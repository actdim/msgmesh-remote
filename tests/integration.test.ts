import { describe, it, expect } from 'vitest';
import {
    RemoteMeshClient,
    RemoteMeshServer,
    type RemoteSocket,
} from '../src/index';

/**
 * Creates an in-memory linked duplex socket pair.
 */
function createSocketPair(): { clientSocket: RemoteSocket; serverSocket: RemoteSocket } {
    const clientListeners: {
        message: ((d: unknown) => void)[];
        close: ((code?: number, reason?: string) => void)[];
        error: ((e: unknown) => void)[];
    } = {
        message: [],
        close: [],
        error: [],
    };
    const serverListeners: {
        message: ((d: unknown) => void)[];
        close: ((code?: number, reason?: string) => void)[];
        error: ((e: unknown) => void)[];
    } = {
        message: [],
        close: [],
        error: [],
    };

    const clientSocket: RemoteSocket = {
        send: (data: string | Uint8Array) => {
            setTimeout(() => {
                for (const l of serverListeners.message) l(data);
            }, 0);
        },
        on: (
            event: 'message' | 'close' | 'error',
            listener: ((d: unknown) => void) | ((code?: number, reason?: string) => void) | ((e: unknown) => void),
        ) => {
            if (event === 'message') clientListeners.message.push(listener as (d: unknown) => void);
            if (event === 'close') clientListeners.close.push(listener as (code?: number, reason?: string) => void);
            if (event === 'error') clientListeners.error.push(listener as (e: unknown) => void);
        },
        close: () => {
            setTimeout(() => {
                for (const l of clientListeners.close) l();
                for (const l of serverListeners.close) l();
            }, 0);
        },
    };

    const serverSocket: RemoteSocket = {
        send: (data: string | Uint8Array) => {
            setTimeout(() => {
                for (const l of clientListeners.message) l(data);
            }, 0);
        },
        on: (
            event: 'message' | 'close' | 'error',
            listener: ((d: unknown) => void) | ((code?: number, reason?: string) => void) | ((e: unknown) => void),
        ) => {
            if (event === 'message') serverListeners.message.push(listener as (d: unknown) => void);
            if (event === 'close') serverListeners.close.push(listener as (code?: number, reason?: string) => void);
            if (event === 'error') serverListeners.error.push(listener as (e: unknown) => void);
        },
        close: () => {
            setTimeout(() => {
                for (const l of serverListeners.close) l();
                for (const l of clientListeners.close) l();
            }, 0);
        },
    };

    return { clientSocket, serverSocket };
}

describe('End-to-End Integration: RemoteMeshClient <-> RemoteMeshServer', () => {
    it('executes full RPC request/response cycle over duplex connection', async () => {
        const { clientSocket, serverSocket } = createSocketPair();

        const serverBus = {
            on: () => {},
            send: () => {},
            request: async (msg: { channel: string; payload?: unknown }) => {
                if (msg.channel === 'CAD.GET_DOCUMENT') {
                    const payload = msg.payload as { id: string } | undefined;
                    return { docId: payload?.id, name: 'Main Floorplan', version: 3 };
                }
                throw new Error('Unknown channel');
            },
        };

        const server = new RemoteMeshServer({ bus: serverBus });
        server.handleConnection(serverSocket);

        const client = new RemoteMeshClient({
            socketFactory: () => clientSocket,
        });

        client.connect();

        const result = await client.request<{ docId: string; name: string; version: number }>(
            'CAD.GET_DOCUMENT',
            { id: 'doc-001' },
        );

        expect(result).toEqual({
            docId: 'doc-001',
            name: 'Main Floorplan',
            version: 3,
        });

        client.close();
        server.close();
    });

    it('propagates server pub-sub events to subscribed client', async () => {
        const { clientSocket, serverSocket } = createSocketPair();

        let serverBusListener: ((msg: { channel: string; payload?: unknown }) => void) | null = null;
        const serverBus = {
            on: (params: { channel: string; callback: (msg: { channel: string; payload?: unknown }) => void }) => {
                if (params.channel === 'CAD.SCENE_DELTA') {
                    serverBusListener = params.callback;
                }
            },
            send: () => {},
            request: async () => {},
        };

        const server = new RemoteMeshServer({ bus: serverBus });
        server.handleConnection(serverSocket);

        const client = new RemoteMeshClient({
            socketFactory: () => clientSocket,
        });

        const receivedDeltas: unknown[] = [];
        client.onMessage((msg) => {
            if (msg.channel === 'CAD.SCENE_DELTA') {
                receivedDeltas.push(msg.payload);
            }
        });

        client.connect();
        client.subscribe('CAD.SCENE_DELTA');

        await new Promise((r) => setTimeout(r, 20));

        expect(serverBusListener).toBeDefined();

        serverBusListener!({
            channel: 'CAD.SCENE_DELTA',
            payload: { addedObjects: ['rect-1'], timestamp: 123456 },
        });

        await new Promise((r) => setTimeout(r, 20));

        expect(receivedDeltas.length).toBe(1);
        expect(receivedDeltas[0]).toEqual({
            addedObjects: ['rect-1'],
            timestamp: 123456,
        });

        client.close();
        server.close();
    });

    it('buffers offline messages and delivers them once connection is established', async () => {
        const currentSockets = createSocketPair();

        const serverSentMessages: Array<{ channel: string; topic?: string; payload?: unknown }> = [];
        const serverBus = {
            on: () => {},
            send: (msg: { channel: string; topic?: string; payload?: unknown }) => {
                serverSentMessages.push(msg);
            },
            request: async () => {},
        };

        const server = new RemoteMeshServer({ bus: serverBus });

        const client = new RemoteMeshClient({
            socketFactory: () => currentSockets.clientSocket,
        });

        client.send('CAD.OBJECT_MUTATION', { id: 'obj-1', color: 'red' });
        client.send('CAD.OBJECT_MUTATION', { id: 'obj-2', color: 'blue' });

        expect(serverSentMessages.length).toBe(0);

        server.handleConnection(currentSockets.serverSocket);
        client.connect();

        await new Promise((r) => setTimeout(r, 30));

        expect(serverSentMessages.length).toBe(2);
        expect(serverSentMessages[0]).toEqual({
            channel: 'CAD.OBJECT_MUTATION',
            topic: undefined,
            payload: { id: 'obj-1', color: 'red' },
        });
        expect(serverSentMessages[1]).toEqual({
            channel: 'CAD.OBJECT_MUTATION',
            topic: undefined,
            payload: { id: 'obj-2', color: 'blue' },
        });

        client.close();
        server.close();
    });
});
