import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RemoteMeshClient, type RemoteSocket } from '../src/index';

class MockClientSocket implements RemoteSocket {
    public sent: string[] = [];
    public messageListeners: ((data: unknown) => void)[] = [];
    public closeListeners: ((code?: number, reason?: string) => void)[] = [];
    public errorListeners: ((err: unknown) => void)[] = [];
    public closed = false;

    send(data: string | Uint8Array): void {
        this.sent.push(typeof data === 'string' ? data : new TextDecoder().decode(data));
    }

    on(event: 'message' | 'close' | 'error', listener: (...args: any[]) => void): void {
        if (event === 'message') this.messageListeners.push(listener);
        if (event === 'close') this.closeListeners.push(listener);
        if (event === 'error') this.errorListeners.push(listener);
    }

    close(): void {
        this.closed = true;
        for (const l of this.closeListeners) l();
    }

    triggerMessage(frame: object): void {
        const text = JSON.stringify(frame);
        for (const l of this.messageListeners) l(text);
    }
}

describe('RemoteMeshClient', () => {
    let mockSocket: MockClientSocket;

    beforeEach(() => {
        vi.useFakeTimers();
        mockSocket = new MockClientSocket();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('connects and transitions to OPEN state', () => {
        const client = new RemoteMeshClient({
            socketFactory: () => mockSocket,
        });

        expect(client.getState()).toBe('CLOSED');
        client.connect();
        expect(client.getState()).toBe('OPEN');
        client.close();
        expect(client.getState()).toBe('CLOSED');
    });

    it('sends PING periodically and responds to PONG', () => {
        const client = new RemoteMeshClient({
            socketFactory: () => mockSocket,
            heartbeatIntervalMs: 5000,
            heartbeatTimeoutMs: 2000,
        });

        client.connect();
        expect(mockSocket.sent.length).toBe(0);

        // Advance past heartbeat interval
        vi.advanceTimersByTime(5000);
        expect(mockSocket.sent.length).toBe(1);
        expect(JSON.parse(mockSocket.sent[0])).toEqual({ t: 'PING' });

        // Server replies with PONG
        mockSocket.triggerMessage({ t: 'PONG' });

        // Advance past timeout; socket should NOT close because PONG arrived
        vi.advanceTimersByTime(3000);
        expect(mockSocket.closed).toBe(false);

        client.close();
    });

    it('forces socket termination if heartbeat PONG is not received within timeout', () => {
        const client = new RemoteMeshClient({
            socketFactory: () => mockSocket,
            heartbeatIntervalMs: 5000,
            heartbeatTimeoutMs: 2000,
        });

        client.connect();
        vi.advanceTimersByTime(5000);
        expect(mockSocket.sent.length).toBe(1);

        // Do NOT send PONG, advance past timeout
        vi.advanceTimersByTime(2001);

        // Socket should be closed and client should enter RECONNECTING
        expect(mockSocket.closed).toBe(true);
        expect(client.getState()).toBe('RECONNECTING');

        client.close();
    });

    it('buffers offline messages and flushes on connect', () => {
        const client = new RemoteMeshClient({
            socketFactory: () => mockSocket,
        });

        // Send while CLOSED
        client.send('CAD.MUTATION', { id: 1 });
        client.send('CAD.MUTATION', { id: 2 });

        expect(mockSocket.sent.length).toBe(0);

        // Connect now
        client.connect();

        // Both messages should be flushed
        expect(mockSocket.sent.length).toBe(2);
        expect(JSON.parse(mockSocket.sent[0])).toEqual({
            t: 'MSG',
            channel: 'CAD.MUTATION',
            payload: { id: 1 },
        });
        expect(JSON.parse(mockSocket.sent[1])).toEqual({
            t: 'MSG',
            channel: 'CAD.MUTATION',
            payload: { id: 2 },
        });

        client.close();
    });

    it('automatically resubscribes cached subscriptions upon connect', () => {
        const client = new RemoteMeshClient({
            socketFactory: () => mockSocket,
        });

        client.subscribe('FEED.UPDATES');
        client.subscribe('CAD.SCENE', 'doc-123');

        expect(mockSocket.sent.length).toBe(0);

        client.connect();

        expect(mockSocket.sent.length).toBe(2);
        const sub1 = JSON.parse(mockSocket.sent[0]);
        const sub2 = JSON.parse(mockSocket.sent[1]);

        expect([sub1, sub2]).toContainEqual({ t: 'SUB', channel: 'FEED.UPDATES' });
        expect([sub1, sub2]).toContainEqual({ t: 'SUB', channel: 'CAD.SCENE', topic: 'doc-123' });

        client.close();
    });

    it('handles request() with correlation ID and resolves on RES', async () => {
        const client = new RemoteMeshClient({
            socketFactory: () => mockSocket,
        });

        client.connect();

        const reqPromise = client.request('API.ITEMS.GET', { id: 'x' });

        expect(mockSocket.sent.length).toBe(1);
        const reqFrame = JSON.parse(mockSocket.sent[0]);
        expect(reqFrame.t).toBe('REQ');
        expect(reqFrame.channel).toBe('API.ITEMS.GET');
        expect(reqFrame.id).toBeDefined();

        // Server sends RES matching id
        mockSocket.triggerMessage({
            t: 'RES',
            id: reqFrame.id,
            payload: { item: 'Widget' },
        });

        const result = await reqPromise;
        expect(result).toEqual({ item: 'Widget' });

        client.close();
    });

    it('rejects request() when timeout fires', async () => {
        const client = new RemoteMeshClient({
            socketFactory: () => mockSocket,
            defaultRequestTimeoutMs: 1000,
        });

        client.connect();

        const reqPromise = client.request('SLOW.OP');

        vi.advanceTimersByTime(1001);

        await expect(reqPromise).rejects.toThrow('Request timeout after 1000ms');

        client.close();
    });

    it('bridges with MsgBus via attachToBus()', async () => {
        let busProviderCallback: ((inMsg: any) => Promise<any>) | null = null;
        let busSent: any[] = [];

        const mockBus = {
            provide: vi.fn(({ callback }) => {
                busProviderCallback = callback;
            }),
            send: vi.fn((msg) => {
                busSent.push(msg);
            }),
        };

        const client = new RemoteMeshClient({
            socketFactory: () => mockSocket,
        });

        client.connect();
        const detach = client.attachToBus(mockBus, {
            remoteChannels: ['API.REMOTE.CALL'],
        });

        // 1. Bus call routes to client.request
        const busCallPromise = busProviderCallback!({
            address: { channel: 'API.REMOTE.CALL', topic: 'top-1' },
            payload: { query: 'test' },
        });

        expect(mockSocket.sent.length).toBe(1);
        const reqFrame = JSON.parse(mockSocket.sent[0]);
        expect(reqFrame.channel).toBe('API.REMOTE.CALL');
        expect(reqFrame.topic).toBe('top-1');

        mockSocket.triggerMessage({
            t: 'RES',
            id: reqFrame.id,
            payload: { ok: true },
        });

        const result = await busCallPromise;
        expect(result).toEqual({ ok: true });

        // 2. Client incoming MSG routes to bus.send
        mockSocket.triggerMessage({
            t: 'MSG',
            channel: 'SERVER.NOTIFICATION',
            payload: { alert: 'done' },
        });

        expect(busSent.length).toBe(1);
        expect(busSent[0]).toEqual({
            channel: 'SERVER.NOTIFICATION',
            topic: undefined,
            payload: { alert: 'done' },
        });

        detach();
        client.close();
    });
});
