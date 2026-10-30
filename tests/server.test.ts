import { describe, it, expect, vi } from 'vitest';
import { RemoteMeshServer, type RemoteSocket } from '../src/index';

class MockSocket implements RemoteSocket {
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

    it('handles AUTH frame and updates session context on success', async () => {
        const bus = { on: vi.fn(), send: vi.fn(), request: vi.fn() };
        const server = new RemoteMeshServer({
            bus,
            onAuthenticate: async (token) => {
                if (token === 'valid-secret') {
                    return { userId: 'u-123', metadata: { role: 'admin' } };
                }
                return false;
            },
        });
        const socket = new MockSocket();
        const session = server.handleConnection(socket);

        socket.receiveMessage({ t: 'AUTH', token: 'valid-secret' });
        await new Promise((r) => setTimeout(r, 10));

        expect(socket.sent.length).toBe(1);
        expect(JSON.parse(socket.sent[0])).toEqual({ t: 'AUTH_OK', userId: 'u-123' });
        expect(session.context.userId).toBe('u-123');
        expect(session.context.metadata?.role).toBe('admin');
    });

    it('handles AUTH frame and replies AUTH_FAIL on invalid token', async () => {
        const bus = { on: vi.fn(), send: vi.fn(), request: vi.fn() };
        const server = new RemoteMeshServer({
            bus,
            onAuthenticate: async () => false,
        });
        const socket = new MockSocket();
        server.handleConnection(socket);

        socket.receiveMessage({ t: 'AUTH', token: 'bad-token' });
        await new Promise((r) => setTimeout(r, 10));

        expect(socket.sent.length).toBe(1);
        expect(JSON.parse(socket.sent[0])).toEqual({
            t: 'AUTH_FAIL',
            error: 'Authentication failed',
            code: 401,
        });
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

        await new Promise((r) => setTimeout(r, 10));

        expect(bus.request).toHaveBeenCalledWith({
            channel: 'CAD.GET_SCENE',
            topic: undefined,
            group: undefined,
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

    it('matches wildcard channel subscriptions (e.g. WORKS.INTAKE.*)', () => {
        let busCallback: ((msg: { address?: { channel: string }; payload?: unknown }) => void) | null = null;
        const bus = {
            on: vi.fn(({ callback }: { callback: (msg: { address?: { channel: string }; payload?: unknown }) => void }) => {
                busCallback = callback;
                return () => {};
            }),
            send: vi.fn(),
            request: vi.fn(),
        };

        const server = new RemoteMeshServer({ bus });
        const socket = new MockSocket();
        server.handleConnection(socket);

        socket.receiveMessage({ t: 'SUB', channel: 'WORKS.INTAKE.*' });

        expect(bus.on).toHaveBeenCalled();

        busCallback!({
            address: { channel: 'WORKS.INTAKE.COMPLETED' },
            payload: { intakeId: 'item-10' },
        });

        expect(socket.sent.length).toBe(1);
        expect(JSON.parse(socket.sent[0])).toEqual({
            t: 'MSG',
            channel: 'WORKS.INTAKE.COMPLETED',
            payload: { intakeId: 'item-10' },
        });
    });

    it('enforces multi-tenant isolation by default (filters events belonging to other users)', () => {
        let busCallback: ((msg: { channel?: string; payload?: unknown }) => void) | null = null;
        const bus = {
            on: vi.fn(({ callback }: { callback: (msg: { channel?: string; payload?: unknown }) => void }) => {
                busCallback = callback;
                return () => {};
            }),
            send: vi.fn(),
            request: vi.fn(),
        };

        const server = new RemoteMeshServer({ bus });
        const userSocket = new MockSocket();

        server.handleConnection(userSocket, { userId: 'u-1' });

        userSocket.receiveMessage({ t: 'SUB', channel: 'INTAKE.UPDATE' });

        busCallback!({
            channel: 'INTAKE.UPDATE',
            payload: { userId: 'u-2', secretInfo: 'private' },
        });

        expect(userSocket.sent.length).toBe(0);

        busCallback!({
            channel: 'INTAKE.UPDATE',
            payload: { userId: 'u-1', secretInfo: 'for-me' },
        });

        expect(userSocket.sent.length).toBe(1);
        expect(JSON.parse(userSocket.sent[0])).toEqual({
            t: 'MSG',
            channel: 'INTAKE.UPDATE',
            payload: { userId: 'u-1', secretInfo: 'for-me' },
        });
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
