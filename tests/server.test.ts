import { describe, it, expect, vi } from 'vitest';
import { RemoteMeshServer, type RemoteSocket } from '../src/index';
import { defaultCodec } from '../src/protocol';

class MockSocket implements RemoteSocket {
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

    receiveMessage(frame: object): void {
        const text = JSON.stringify(frame);
        for (const l of this.messageListeners) l(text);
    }
}

describe('RemoteMeshServer', () => {
    it('replies to PING with PONG', async () => {
        const bus = { on: vi.fn(), send: vi.fn(), request: vi.fn() };
        const server = new RemoteMeshServer({ bus });
        const socket = new MockSocket();

        server.handleConnection(socket);
        socket.receiveMessage({ t: 'PING' });

        expect(socket.sent.length).toBe(1);
        const pong = JSON.parse(socket.sent[0]);
        expect(pong).toEqual({ t: 'PONG' });
    });

    it('handles REQ and returns RES on success', async () => {
        const bus = {
            on: vi.fn(),
            send: vi.fn(),
            request: vi.fn().mockResolvedValue({ payload: { sceneId: 's1' } }),
        };
        const server = new RemoteMeshServer({ bus });
        const socket = new MockSocket();

        server.handleConnection(socket);
        socket.receiveMessage({
            t: 'REQ',
            id: 'req-42',
            channel: 'CAD.GET_SCENE',
            payload: { id: 's1' },
        });

        // Let async request resolve
        await new Promise((r) => setTimeout(r, 10));

        expect(bus.request).toHaveBeenCalledWith({
            channel: 'CAD.GET_SCENE',
            topic: undefined,
            payload: { id: 's1' },
        });

        expect(socket.sent.length).toBe(1);
        const res = JSON.parse(socket.sent[0]);
        expect(res).toEqual({
            t: 'RES',
            id: 'req-42',
            payload: { sceneId: 's1' },
        });
    });

    it('handles REQ and returns RES with error on failure', async () => {
        const bus = {
            on: vi.fn(),
            send: vi.fn(),
            request: vi.fn().mockRejectedValue(new Error('Scene not found')),
        };
        const server = new RemoteMeshServer({ bus });
        const socket = new MockSocket();

        server.handleConnection(socket);
        socket.receiveMessage({
            t: 'REQ',
            id: 'req-43',
            channel: 'CAD.GET_SCENE',
        });

        await new Promise((r) => setTimeout(r, 10));

        expect(socket.sent.length).toBe(1);
        const res = JSON.parse(socket.sent[0]);
        expect(res.t).toBe('RES');
        expect(res.id).toBe('req-43');
        expect(res.error?.message).toBe('Scene not found');
    });

    it('forwards bus events to subscribed sockets and filters unsubscribed', () => {
        let busCallback: ((msg: any) => void) | null = null;
        const bus = {
            on: vi.fn(({ callback }) => {
                busCallback = callback;
            }),
            send: vi.fn(),
            request: vi.fn(),
        };

        const server = new RemoteMeshServer({ bus });
        const socket1 = new MockSocket();
        const socket2 = new MockSocket();

        server.handleConnection(socket1);
        server.handleConnection(socket2);

        // socket1 subscribes to CAD.OBJECT_MOVED
        socket1.receiveMessage({ t: 'SUB', channel: 'CAD.OBJECT_MOVED' });

        expect(bus.on).toHaveBeenCalled();

        // Emit from server bus
        busCallback!({
            channel: 'CAD.OBJECT_MOVED',
            payload: { objectId: 99, x: 10, y: 20 },
        });

        // socket1 gets the message
        expect(socket1.sent.length).toBe(1);
        expect(JSON.parse(socket1.sent[0])).toEqual({
            t: 'MSG',
            channel: 'CAD.OBJECT_MOVED',
            payload: { objectId: 99, x: 10, y: 20 },
        });

        // socket2 was not subscribed, gets nothing
        expect(socket2.sent.length).toBe(0);

        // socket1 unsubs
        socket1.receiveMessage({ t: 'UNSUB', channel: 'CAD.OBJECT_MOVED' });

        // Emit again
        busCallback!({
            channel: 'CAD.OBJECT_MOVED',
            payload: { objectId: 100 },
        });

        expect(socket1.sent.length).toBe(1); // still 1, no new message
    });

    it('enforces authorization hook if provided', async () => {
        const bus = { on: vi.fn(), send: vi.fn(), request: vi.fn() };
        const server = new RemoteMeshServer({
            bus,
            authorize: (ctx, frame) => {
                if (frame.t === 'REQ' && frame.channel === 'ADMIN.SECRET') {
                    return false;
                }
                return true;
            },
        });

        const socket = new MockSocket();
        server.handleConnection(socket);

        socket.receiveMessage({
            t: 'REQ',
            id: 'req-secret',
            channel: 'ADMIN.SECRET',
        });

        await new Promise((r) => setTimeout(r, 10));

        expect(socket.sent.length).toBe(1);
        const res = JSON.parse(socket.sent[0]);
        expect(res).toEqual({
            t: 'RES',
            id: 'req-secret',
            error: { message: 'Unauthorized', code: 403 },
        });
        expect(bus.request).not.toHaveBeenCalled();
    });

    it('cleans up session and subscriptions on socket close', () => {
        const bus = { on: vi.fn(), send: vi.fn(), request: vi.fn() };
        const server = new RemoteMeshServer({ bus });
        const socket = new MockSocket();

        server.handleConnection(socket);
        expect(server.activeSessionsCount).toBe(1);

        socket.close();
        expect(server.activeSessionsCount).toBe(0);
    });
});
