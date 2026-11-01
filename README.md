# @actdim/msgmesh-remote

> **Bidirectional remote transport, WebSocket bridge, and reconnect orchestration for `@actdim/msgmesh`**

[![npm version](https://img.shields.io/npm/v/@actdim/msgmesh-remote.svg)](https://www.npmjs.com/package/@actdim/msgmesh-remote)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## What is MsgMesh Remote?

**`@actdim/msgmesh-remote`** carries [`@actdim/msgmesh`](https://www.npmjs.com/package/@actdim/msgmesh) messages across a network boundary. A client bus (browser, WebView) and a server bus exchange the same `{ channel, group, topic, payload }` messages over one duplex socket, using a small typed JSON frame protocol.

### The Problem It Solves
- **Two buses, one app**: the UI talks to a local msgmesh bus, the server publishes on its own; something has to move events and RPC calls between them.
- **Dead mobile sockets**: WebViews (.NET MAUI, iOS WKWebView, Android WebView) can leave a WebSocket half-open after the app is suspended, with no `close` event.
- **Lost state on reconnect**: subscriptions and messages sent during a short outage vanish unless the transport replays them.

### The Output You Get
- **Full-Duplex Wire Protocol**: strongly typed frames `SUB`, `UNSUB`, `MSG`, `REQ`, `RES`, `PING`, `PONG`, `AUTH`, `AUTH_OK`, `AUTH_FAIL`, with a validating JSON codec and a pluggable `FrameCodec`.
- **Framework-Agnostic Server**: `RemoteMeshServer` works with any socket that matches the duck-typed `RemoteSocket` contract - `ws` / `@fastify/websocket`, or a custom implementation. The frames are plain JSON, so other server stacks can implement the same protocol.
- **Resilient Client**: `RemoteMeshClient` sends a heartbeat every 15 s and treats a `PONG` missing for 5 s as a dead socket, then reconnects with exponential backoff and jitter.
- **Auto-Resubscription**: active channel/topic subscriptions are replayed after every reconnect.
- **Offline Message Buffer**: bounded queue (200 by default) for outbound fire-and-forget messages sent while disconnected.
- **RPC Correlation**: `client.request()` maps requests to correlated responses with timeouts; `bridgeRemoteBus` exposes remote channels as local `bus.request()` providers.
- **Security Hooks**: handshake context, in-band `AUTH` / token refresh (`client.authenticate(token)`), per-frame `authorize`, per-session `filterEvent` with a default owner-based tenant filter.

---

## Installation

```bash
pnpm add @actdim/msgmesh-remote @actdim/msgmesh rxjs
```

Peer dependencies: `@actdim/msgmesh >=1.12.0`, `rxjs >=7.8.0`. ESM only.

| Entry point | Contents |
|---|---|
| `@actdim/msgmesh-remote/client` | `RemoteMeshClient`, `bridgeRemoteBus` |
| `@actdim/msgmesh-remote/server` | `RemoteMeshServer`, `RemoteClientSession` |
| `@actdim/msgmesh-remote/protocol` | `JsonFrameCodec`, `defaultCodec`, `validateFrame`, `create*Frame` factories, error classes |
| `@actdim/msgmesh-remote` | All of the above plus the type contracts |

---

## Quick Start

### Server (Node.js, `@fastify/websocket`)

```typescript
import { RemoteMeshServer, type RemoteSocket } from '@actdim/msgmesh-remote/server';

const remoteServer = new RemoteMeshServer({
    bus: serverBus, // your msgmesh bus
    onAuthenticate: async (token) => {
        const user = await verifyToken(token);
        return user ? { userId: user.id } : null;
    },
});

fastify.get('/api/v1/ws', { websocket: true }, (socket) => {
    remoteServer.handleConnection(socket as unknown as RemoteSocket);
});

// server code publishes as usual; subscribed clients receive it
await serverBus.send({ channel: 'JOBS.STATUS', topic: jobId, payload: { jobId, progress: 55 } });
```

### Client (browser / WebView)

```typescript
import { RemoteMeshClient, bridgeRemoteBus, type RemoteBusLike } from '@actdim/msgmesh-remote/client';

const client = new RemoteMeshClient({
    url: 'wss://example.com/api/v1/ws',
    tokenGetter: () => getAccessToken(),
});

// incoming events are re-published on the local bus
const unbridge = bridgeRemoteBus(appBus as unknown as RemoteBusLike, client, {
    remoteSubscriptions: [{ channel: 'WORKS.INTAKE.*' }],
});

client.connect();
client.subscribe('JOBS.STATUS', jobId);

appBus.on({ channel: 'JOBS.STATUS', topic: jobId, callback: (msg) => render(msg.payload) });

// direct RPC to the server bus
const doc = await client.request<{ name: string }>('CAD.GET_DOCUMENT', { id: 'doc-001' });
```

`serverBus`, `appBus`, `verifyToken`, `getAccessToken` and `render` are application code. With a msgmesh server bus, wildcard channel subscriptions such as `WORKS.INTAKE.*` need `resolveChannels` on the server - see the [Integration Guide](./docs/topic--04-integration-guide.md).

---

## Documentation Index

Online: **https://actdim.github.io/msgmesh-remote/**

| Section | Description |
|---|---|
| [**01. Overview & Key Advantages**](./docs/topic--01-overview-and-advantages.md) | What the package is, where it fits, why it is built this way |
| [**02. Core Concepts**](./docs/topic--02-core-concepts.md) | Addressing, frames, codec, client lifecycle, heartbeat, reconnect, auth and filtering |
| [**03. Architecture & Wiring**](./docs/topic--03-architecture-and-wiring.md) | Sequence diagrams for connect, RPC, pub/sub, heartbeat; the declarative bus bridge |
| [**04. Integration Guide**](./docs/topic--04-integration-guide.md) | Installing, wiring a Fastify server and a browser client, testing without a network |
| [**05. API Reference**](./docs/topic--05-api-reference.md) | Every public export per entry point |
| [Architecture](./docs/topic--architecture.md) / [Domain Model](./docs/topic--domain-model.md) | System summary and frame contracts |
| [Setup & Workflow](./docs/topic--setup-and-workflow.md) | Build, test, docs scripts and monorepo versioning |

---

## AI Coding Assistants (Cursor, Claude Code, Copilot, Antigravity)

Point your agent at the bundled LLM documentation in your project's `AGENTS.md`, `CLAUDE.md` or `.cursorrules`:

```markdown
## MsgMesh Remote Guidelines
- Reference: `node_modules/@actdim/msgmesh-remote/llms.txt`
```

The package ships `llms.txt`, `llms-full.txt` and the `docs/` topics matching the installed version.

---

## AI-Assisted Development

Developed with [Along](https://github.com/actdim/along) - a provider-agnostic context and memory system for AI coding agents.

---

## Changelog

### 1.12.0 (2026-11-01)
- Version aligned with the mempart monorepo release; no library changes

### 1.11.0 (2026-10-30)
- Initial release: wire protocol and `JsonFrameCodec` with validation; framework-agnostic `RemoteMeshServer` / `RemoteClientSession`; `RemoteMeshClient` with heartbeat, reconnect, subscription replay, offline queue and RPC; `bridgeRemoteBus`
- In-band `AUTH` / `AUTH_OK` / `AUTH_FAIL`, channel groups, wildcard subscriptions, per-session event filtering
- Generic `TChannel` / `TGroup` parameters; `url` accepts a getter function

---

## License

MIT License. See [LICENSE](LICENSE) for details.
