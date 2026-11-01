---
protocol: along
slug: 04-integration-guide
title: Integration Guide
type: topic
created: 2026-11-01
updated: 2026-11-01
tags: [04-integration-guide, install, fastify, websocket, bridge, testing]
---

# Integration Guide

[<- Back to 03. Architecture & Wiring](./topic--03-architecture-and-wiring.md) | [Next: 05. API Reference ->](./topic--05-api-reference.md)

---

## 1. Installation

```bash
pnpm add @actdim/msgmesh-remote @actdim/msgmesh rxjs
```

| Peer dependency | Range |
|---|---|
| `@actdim/msgmesh` | `>=1.12.0` |
| `rxjs` | `>=7.8.0` |

The package is ESM-only (`"type": "module"`) and side-effect free. Import from the narrowest entry point you need:

| Import path | Use in | Contains |
|---|---|---|
| `@actdim/msgmesh-remote/client` | Browser / WebView | `RemoteMeshClient`, `bridgeRemoteBus`, client option and bridge types |
| `@actdim/msgmesh-remote/server` | Node.js server | `RemoteMeshServer`, `RemoteClientSession`, server option and context types |
| `@actdim/msgmesh-remote/protocol` | Either side, tools, tests | Codec, validation, error classes, `create*Frame` factories |
| `@actdim/msgmesh-remote/types` | Either side | All frame, codec, socket and bus-like type contracts (via the `./*` export) |
| `@actdim/msgmesh-remote` | Either side | Everything above |

---

## 2. Server: Fastify + @fastify/websocket

`@fastify/websocket` hands each route a `ws` socket, which already matches the `RemoteSocket` contract (`send`, `on('message' | 'close' | 'error')`, `close`). This is condensed from mempart's `apps/server/src/controllers/ws/wsController.ts`:

```typescript
import { type FastifyInstance, type FastifyRequest } from 'fastify';
import {
    RemoteMeshServer,
    type RemoteSocket,
    type RemoteConnectionContext,
    type RemoteFrame,
} from '@actdim/msgmesh-remote/server';

export function wsController(fastify: FastifyInstance): RemoteMeshServer<ServerChannel, 'in'> {
    const remoteServer = new RemoteMeshServer<ServerChannel, 'in'>({
        bus: serverBus, // a msgmesh MsgBus
        // msgmesh has no channel wildcards: expand 'WORKS.INTAKE.*' into concrete channels
        resolveChannels: (pattern: string): ServerChannel[] => {
            if (pattern === '*' || pattern.endsWith('*')) {
                const prefix = pattern === '*' ? '' : pattern.slice(0, -1);
                return knownChannels.filter((ch) => ch.startsWith(prefix));
            }
            const exact = pattern as ServerChannel;
            return knownChannels.includes(exact) ? [exact] : [];
        },
        // in-band AUTH frames
        onAuthenticate: async (token: string) => {
            const auth = await verifyRemoteToken(token, fastify);
            if (!auth) return null; // -> AUTH_FAIL 401
            return { userId: auth.userId, metadata: { roles: auth.roles, email: auth.email } };
        },
        // runs for every non-AUTH frame
        authorize: async (context: RemoteConnectionContext, frame: RemoteFrame) => true,
        // per-session event visibility
        filterEvent: (context: RemoteConnectionContext, _channel: string, payload: unknown): boolean => {
            if (!context.userId) return false;
            const record = payload as Record<string, unknown> | undefined;
            const owner = record?.ownerUserId ?? record?.userId;
            return owner === undefined || String(owner) === String(context.userId);
        },
    });

    fastify.get('/api/v1/ws', { websocket: true }, async (socket: unknown, request: FastifyRequest) => {
        // optional handshake authentication (?token= or Authorization: Bearer)
        const query = request.query as { token?: string } | undefined;
        const auth = query?.token ? await verifyRemoteToken(query.token, fastify) : null;
        const initialContext: Partial<RemoteConnectionContext> | undefined = auth
            ? { userId: auth.userId, metadata: { roles: auth.roles, email: auth.email } }
            : undefined;

        remoteServer.handleConnection(socket as RemoteSocket, initialContext);
    });

    return remoteServer;
}
```

`ServerChannel`, `serverBus`, `knownChannels` and `verifyRemoteToken` are application code. Requirements on the server bus:

- `send({ channel, group?, topic?, payload? })` - receives client `MSG` frames.
- `request({ channel, group?, topic?, payload? })` - serves client `REQ` frames; resolve with a msgmesh response message (its `payload` is unwrapped) or a raw value.
- `on({ channel, topic?, options: { abortSignal }, callback })` - lets sessions listen for events they forward. Publish events with `bus.send(...)` without a group (or with `group: 'in'`) so they reach these listeners on a msgmesh bus.

### Any other socket library

Anything that can be adapted to `RemoteSocket` works, including a plain `ws` server:

```typescript
import { WebSocketServer } from 'ws';
import { RemoteMeshServer, type RemoteSocket } from '@actdim/msgmesh-remote/server';

const remoteServer = new RemoteMeshServer({ bus: serverBus });
const wss = new WebSocketServer({ port: 8080 });
wss.on('connection', (socket) => {
    remoteServer.handleConnection(socket as unknown as RemoteSocket, { connectionId: crypto.randomUUID() });
});
```

Because the frames are plain JSON objects with a `t` discriminator, a server written in another language can implement the same protocol; this package ships only the TypeScript server.

---

## 3. Client: Browser or WebView

Condensed from mempart's `apps/webapp/src/config/remoteClient.ts`:

```typescript
import { RemoteMeshClient, bridgeRemoteBus, type RemoteBusLike } from '@actdim/msgmesh-remote/client';

const client = new RemoteMeshClient({
    url: () => `${apiBaseUrl.replace(/^http/, 'ws')}/api/v1/ws`, // re-evaluated on every (re)connect
    tokenGetter: async () => {
        const auth = await appBus.request({ channel: 'APP.SECURITY.AUTH.INFO.GET', group: 'in', options: { timeout: 3000 } });
        const payload = auth?.payload as { accessToken?: string; isAuthenticated?: boolean } | undefined;
        return payload?.isAuthenticated ? payload.accessToken : undefined;
    },
    heartbeatIntervalMs: 15000,
    heartbeatTimeoutMs: 5000,
    minReconnectDelayMs: 500,
    maxReconnectDelayMs: 10000,
    maxOfflineQueueSize: 200,
});

const unbridge = bridgeRemoteBus(appBus as unknown as RemoteBusLike, client, {
    remoteSubscriptions: [
        { channel: 'WORKS.INTAKE.*' },
        { channel: 'FEED.EXCHANGE.*' },
        { channel: 'VFS.NODE.*' },
    ],
});

client.connect();

// Refresh the token in-band after the user signs in again
appBus.on({
    channel: 'APP.SECURITY.AUTH.SIGNIN',
    group: 'in',
    callback: (msg) => {
        const token = (msg.payload as { accessToken?: string } | undefined)?.accessToken;
        if (token && client.getState() === 'OPEN') {
            void client.authenticate(token).catch(() => {});
        }
    },
});
```

Bridged `MSG` frames are re-published on the local bus with `bus.send(...)`, so UI code consumes them like any local event:

```typescript
appBus.on({
    channel: 'JOBS.STATUS',
    topic: jobId,
    group: 'in',
    callback: (msg) => updateProgress(msg.payload),
});
```

### Per-topic subscriptions

Subscribe to a concrete topic for keyed streams and unsubscribe when done:

```typescript
client.subscribe('JOBS.STATUS', jobId);
// ...
client.unsubscribe('JOBS.STATUS', jobId);
```

Subscriptions survive reconnects; you do not need to resubscribe in `onStateChange`.

### Remote RPC through the local bus

List channels in `remoteRequests` to make `appBus.request(...)` on those channels go to the server:

```typescript
const unbridge = client.attachToBus(appBus as unknown as RemoteBusLike, {
    remoteRequests: ['API.REMOTE.CALL'],
});

const res = await appBus.request({ channel: 'API.REMOTE.CALL', payload: { query: 'test' } });
```

Or call the server directly:

```typescript
const doc = await client.request<{ docId: string; name: string }>('CAD.GET_DOCUMENT', { id: 'doc-001' }, { timeout: 5000 });
```

### Fire-and-forget to the server

```typescript
client.send('CAD.OBJECT_MUTATION', { id: 'obj-1', color: 'red' });
```

Sent immediately when `OPEN`, otherwise buffered and flushed after the next open.

### Connection status in UI

```typescript
const off = client.onStateChange((state) => {
    // 'CONNECTING' | 'OPEN' | 'RECONNECTING' | 'CLOSED'
    statusBadge.set(state);
});
```

### Teardown

```typescript
unbridge();     // removes local providers, message forwarding and bridge subscriptions
client.close(); // stops reconnecting, rejects pending requests, clears the offline queue
```

### Non-browser clients

In environments without a global `WebSocket`, pass `socketFactory`. If neither `url` nor `socketFactory` is usable, socket creation fails, the error is logged and the client keeps retrying with backoff.

```typescript
const client = new RemoteMeshClient({ socketFactory: () => createMySocket() });
```

A factory returning a `RemoteSocket` (with `on`) is treated as already open.

---

## 4. Testing Without a Network

All tests in `tests/` run in Node with in-memory sockets:

- `tests/integration.test.ts` builds a linked `RemoteSocket` pair (`createSocketPair()`), connects a real `RemoteMeshClient` to a real `RemoteMeshServer` with a mock bus, and covers RPC, server-to-client pub/sub and offline buffering.
- `tests/client.test.ts` and `tests/server.test.ts` use a `MockSocket` class that records `sent` frames and exposes `triggerMessage` / `receiveMessage`.

A mock bus is just an object literal, because every bus method is optional:

```typescript
const serverBus = {
    on: () => {},
    send: () => {},
    request: async (msg: { channel: string; payload?: unknown }) => ({ ok: true, channel: msg.channel }),
};
const server = new RemoteMeshServer({ bus: serverBus });
```

For raw protocol tests against a running server, use the protocol entry point (as mempart's `apps/server/src/testRemoteMeshWebSocket.ts` does):

```typescript
import { defaultCodec, createAuthFrame, createSubFrame, createPingFrame } from '@actdim/msgmesh-remote/protocol';

ws.send(defaultCodec.encode(createPingFrame()));
ws.send(defaultCodec.encode(createAuthFrame(token)));
ws.send(defaultCodec.encode(createSubFrame('JOBS.STATUS', jobId)));
```

---

## 5. Checklist

- Server bus channels that clients subscribe to with wildcards are listed in `resolveChannels`.
- Keyed streams (job ids, drive ids) are subscribed with a topic.
- `filterEvent` is set if anonymous sessions must not receive events (the default owner filter lets them through).
- `authorize` returns `true` for `PING` frames, otherwise heartbeats go unanswered and clients reconnect every cycle.
- The client is closed with `close()` on app teardown so it stops reconnecting.

---

[<- Back to 03. Architecture & Wiring](./topic--03-architecture-and-wiring.md) | [Next: 05. API Reference ->](./topic--05-api-reference.md)
