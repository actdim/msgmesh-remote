---
protocol: along
slug: architecture
title: Architecture
type: topic
created: 2026-11-01
updated: 2026-11-01
tags: [architecture]
---

# @actdim/msgmesh-remote Architecture

## 1. System Overview

`@actdim/msgmesh-remote` bridges two `@actdim/msgmesh` buses over a duplex socket. It is layered so that each layer can be used on its own: the protocol layer has no runtime state, the server and client depend only on the protocol layer and on structural "bus-like" and "socket" interfaces.

```text
+-------------------------------------------------------------------------------------------+
|                                  @actdim/msgmesh-remote                                   |
+-------------------------------------------------------------------------------------------+
|  Type Contracts (src/types.ts, zero runtime)                                              |
|  - RemoteFrame union: SUB, UNSUB, MSG, REQ, RES, PING, PONG, AUTH, AUTH_OK, AUTH_FAIL     |
|  - FrameCodec, RemoteSocket, RemoteServerBusLike, RemoteBusLike                           |
+-------------------------------------------------------------------------------------------+
|  Protocol (src/protocol.ts, entry ./protocol)                                             |
|  - validateFrame, JsonFrameCodec, defaultCodec                                            |
|  - FrameDecodeError, InvalidFrameError, create*Frame factories                            |
+-------------------------------------------------------------------------------------------+
|  Server (src/server.ts, entry ./server)          |  Client (src/client.ts, entry ./client)|
|  - RemoteMeshServer: session registry,           |  - RemoteMeshClient: state machine,    |
|    broadcast, close                              |    heartbeat, backoff reconnect,       |
|  - RemoteClientSession: AUTH, authorize,         |    subscription replay, offline queue, |
|    SUB/UNSUB -> bus.on, MSG -> bus.send,         |    REQ/RES correlation, authenticate   |
|    REQ -> bus.request, event filtering           |  - bridgeRemoteBus / attachToBus       |
+-------------------------------------------------------------------------------------------+
|  Host integration (application code)                                                      |
|  - Server: WebSocket route (e.g. @fastify/websocket) -> server.handleConnection(socket)   |
|  - Client: local msgmesh bus <- bridgeRemoteBus -> RemoteMeshClient(url | socketFactory) |
+-------------------------------------------------------------------------------------------+
```

## 2. Core Architectural Principles

### 2.1. Same Addressing on Both Sides
Frames carry msgmesh's `channel` / `group` / `topic` address verbatim. The server translates frames into `bus.send`, `bus.request` and `bus.on` calls; the client bridge translates incoming `MSG` frames into `bus.send` and local `bus.provide` calls into `REQ` frames.

### 2.2. Structural Dependencies Only
The runtime never imports `@actdim/msgmesh`. It calls optional methods on `RemoteServerBusLike` / `RemoteBusLike` and on a duck-typed `RemoteSocket`, so hosts can use any socket library and tests can use object literals.

### 2.3. Client Owns Resilience
Liveness detection (`PING` / `PONG`), reconnect backoff, subscription replay and offline buffering live in the client. The server is reactive: it answers `PING` and cleans up a session when its socket emits `close` or `error`.

### 2.4. Server Owns Policy
Identity (handshake context, `onAuthenticate`), access control (`authorize`) and event visibility (`filterEvent` or the default owner filter) are server-side hooks evaluated per session.

## 3. Detailed Flows

Sequence diagrams for connect/auth, RPC, pub/sub, fire-and-forget and heartbeat are in [03. Architecture & Wiring](./topic--03-architecture-and-wiring.md).

## 4. Cross-Links

- [Knowledge Base Index](./INDEX.md) - Knowledge Base Root
- [Overview & Advantages](./topic--01-overview-and-advantages.md) - What the package is and why
- [Core Concepts](./topic--02-core-concepts.md) - Addressing, frames, lifecycle, auth
- [Architecture & Wiring](./topic--03-architecture-and-wiring.md) - Sequence diagrams and bridge wiring
- [Integration Guide](./topic--04-integration-guide.md) - Server and client setup
- [API Reference](./topic--05-api-reference.md) - Every public export
- [Domain Model](./topic--domain-model.md) - Frame and contract reference
- [Setup & Workflow](./topic--setup-and-workflow.md) - Build, test and docs scripts
- [License](./topic--license.md) - License Information
