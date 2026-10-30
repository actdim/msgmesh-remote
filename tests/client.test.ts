import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RemoteMeshClient, bridgeRemoteBus, type RemoteSocket, type RemoteBusLike } from '../src/index';

class MockClientSocket implements RemoteSocket {
    public sent: string[] = [];
    public messageListeners: ((data: unknown) => void)[] = [];
    public closeListeners: ((code?: number, reason?: string) => void)[] = [];
    public errorListeners: ((err: unknown) => void)[] = [];
    public closed = false;

    send(data: string | Uint8Array): void {
        this.sent.push(typeof data === 'string' ? data : new TextDecoder().decode(data));
    }

    on(event: 'message', listener: (data: unknown) => void): void;
    on(event: 'close', listener: (code?: number, reason?: string) => void): void;
    on(event: 'error', listener: (err: unknown) => void): void;
    on(
        event: 'message' | 'close' | 'error',
        listener: ((data: unknown) => void) | ((code?: number, reason?: string) => void) | ((err: unknown) => void),
    ): void {
        if (event === 'message') this.messageListeners.push(listener as (data: unknown) => void);
        if (event === 'close') this.closeListeners.push(listener as (code?: number, reason?: string) => void);
        if (event === 'error') this.errorListeners.push(listener as (err: unknown) => void);
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

    it('connects and sends AUTH frame on open when token is provided', async () => {
        const client = new RemoteMeshClient({
            socketFactory: () => mockSocket,
            token: 'jwt-abc-123',
        });

        client.connect();
        await vi.advanceTimersByTimeAsync(1);

        expect(client.getState()).toBe('OPEN');
        expect(mockSocket.sent.length).toBe(1);
        expect(JSON.parse(mockSocket.sent[0])).toEqual({
            t: 'AUTH',
            token: 'jwt-abc-123',
        });

        client.close();
    });

    it('supports dynamic authenticate() resolving on AUTH_OK', async () => {
        const client = new RemoteMeshClient({
            socketFactory: () => mockSocket,
        });

        client.connect();
        await vi.advanceTimersByTimeAsync(1);

        const authPromise = client.authenticate('new-fresh-token');

        expect(mockSocket.sent.length).toBe(1);
        expect(JSON.parse(mockSocket.sent[0])).toEqual({
            t: 'AUTH',
            token: 'new-fresh-token',
        });

        mockSocket.triggerMessage({ t: 'AUTH_OK', userId: 'u-99' });

        await expect(authPromise).resolves.toBeUndefined();
        client.close();
    });

    it('supports dynamic authenticate() rejecting on AUTH_FAIL', async () => {
        const client = new RemoteMeshClient({
            socketFactory: () => mockSocket,
        });

        client.connect();
        await vi.advanceTimersByTimeAsync(1);

        const authPromise = client.authenticate('expired-token');

        mockSocket.triggerMessage({ t: 'AUTH_FAIL', error: 'Signature expired' });

        await expect(authPromise).rejects.toThrow('Signature expired');
        client.close();
    });

    it('sends PING periodically and responds to PONG', async () => {
        const client = new RemoteMeshClient({
            socketFactory: () => mockSocket,
            heartbeatIntervalMs: 5000,
            heartbeatTimeoutMs: 2000,
        });

        client.connect();
        await vi.advanceTimersByTimeAsync(1);
        expect(mockSocket.sent.length).toBe(0);

        await vi.advanceTimersByTimeAsync(5000);
        expect(mockSocket.sent.length).toBe(1);
        expect(JSON.parse(mockSocket.sent[0])).toEqual({ t: 'PING' });

        mockSocket.triggerMessage({ t: 'PONG' });

        await vi.advanceTimersByTimeAsync(3000);
        expect(mockSocket.closed).toBe(false);

        client.close();
    });

    it('forces socket termination if heartbeat PONG is not received within timeout', async () => {
        const client = new RemoteMeshClient({
            socketFactory: () => mockSocket,
            heartbeatIntervalMs: 5000,
            heartbeatTimeoutMs: 2000,
        });

        client.connect();
        await vi.advanceTimersByTimeAsync(1);

        await vi.advanceTimersByTimeAsync(5000);
        expect(mockSocket.sent.length).toBe(1);

        await vi.advanceTimersByTimeAsync(2001);

        expect(mockSocket.closed).toBe(true);
        expect(client.getState()).toBe('RECONNECTING');

        client.close();
    });

    it('buffers offline messages and flushes on connect', async () => {
        const client = new RemoteMeshClient({
            socketFactory: () => mockSocket,
        });

        client.send('CAD.MUTATION', { id: 1 });
        client.send('CAD.MUTATION', { id: 2 });

        expect(mockSocket.sent.length).toBe(0);

        client.connect();
        await vi.advanceTimersByTimeAsync(1);

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

    it('declaratively bridges with in-memory MsgBus via bridgeRemoteBus()', async () => {
        let busProviderCallback: ((inMsg: { address?: { channel: string; topic?: string; group?: string }; payload?: unknown }) => Promise<unknown> | unknown) | null = null;
        const busSent: Array<{ channel: string; topic?: string; group?: string; payload?: unknown }> = [];

        const mockBus: RemoteBusLike = {
            provide: vi.fn((params) => {
                busProviderCallback = params.callback;
                return () => {};
            }),
            send: vi.fn((msg) => {
                busSent.push(msg);
            }),
        };

        const client = new RemoteMeshClient({
            socketFactory: () => mockSocket,
        });

        const unbridge = bridgeRemoteBus(mockBus, client, {
            remoteRequests: ['API.REMOTE.CALL'],
            remoteSubscriptions: [
                { channel: 'WORKS.INTAKE.*' },
                { channel: 'FEED.EXCHANGE.*' },
            ],
        });

        client.connect();
        await vi.advanceTimersByTimeAsync(1);

        expect(mockSocket.sent.length).toBe(2);
        const sub1 = JSON.parse(mockSocket.sent[0]);
        const sub2 = JSON.parse(mockSocket.sent[1]);
        expect([sub1, sub2]).toContainEqual({ t: 'SUB', channel: 'WORKS.INTAKE.*' });
        expect([sub1, sub2]).toContainEqual({ t: 'SUB', channel: 'FEED.EXCHANGE.*' });

        const busCallPromise = busProviderCallback!({
            address: { channel: 'API.REMOTE.CALL', topic: 'top-1', group: 'in' },
            payload: { query: 'test' },
        });

        expect(mockSocket.sent.length).toBe(3);
        const reqFrame = JSON.parse(mockSocket.sent[2]);
        expect(reqFrame.channel).toBe('API.REMOTE.CALL');
        expect(reqFrame.topic).toBe('top-1');
        expect(reqFrame.group).toBe('in');

        mockSocket.triggerMessage({
            t: 'RES',
            id: reqFrame.id,
            payload: { ok: true },
        });

        const result = await busCallPromise;
        expect(result).toEqual({ ok: true });

        unbridge();
        client.close();
    });
});
