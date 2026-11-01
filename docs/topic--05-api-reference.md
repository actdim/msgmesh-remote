---
protocol: along
slug: 05-api-reference
title: API Reference
type: topic
created: 2026-11-01
updated: 2026-11-01
tags: [05-api-reference, api, client, server, protocol, types]
---

# API Reference

[<- Back to 04. Integration Guide](./topic--04-integration-guide.md) | [Back to Main README](../README.md)

---

## Entry Points

| Path | Source | Exports |
|---|---|---|
| `@actdim/msgmesh-remote` | `src/index.ts` | `export *` from `types`, `protocol`, `server`, `client` |
| `@actdim/msgmesh-remote/client` | `src/client.ts` | Client section below + `type RemoteBusLike` |
| `@actdim/msgmesh-remote/server` | `src/server.ts` | Server section below + `type RemoteSocket`, `RemoteFrame`, `RemoteServerBusLike` |
| `@actdim/msgmesh-remote/protocol` | `src/protocol.ts` | Protocol section below; values only (no type re-exports) |
| `@actdim/msgmesh-remote/types` | `src/types.ts` | Types section below (reachable through the `./*` export pattern) |

Generic parameters used throughout: `TChannel extends string = string` (channel name union), `TGroup extends string = string` (group name union, server side), `TPayload = unknown`, `TError = unknown`.

---

## Client (`@actdim/msgmesh-remote/client`)

### `class RemoteMeshClient<TChannel>`

```typescript
constructor(options: RemoteClientOptions)
readonly options: RemoteClientOptions
readonly codec: FrameCodec // options.codec ?? defaultCodec
```

| Member | Signature | Purpose |
|---|---|---|
| `getState` | `(): ClientConnectionState` | Current state (initially `'CLOSED'`) |
| `onStateChange` | `(listener: (state) => void): () => void` | Listen to state transitions; returns an unsubscribe function |
| `onMessage` | `(listener: (frame: RemoteMsgFrame<TChannel>) => void): () => void` | Listen to incoming `MSG` frames; listener errors are logged |
| `connect` | `(): void` | Open the socket (no-op while `OPEN` or `CONNECTING`); clears the explicit-close flag |
| `authenticate` | `(token: string, timeoutMs = 10000): Promise<void>` | Send `AUTH`; resolve on `AUTH_OK`, reject on `AUTH_FAIL` / timeout / not `OPEN` |
| `subscribe` | `(channel: TChannel, topic?: string, group?: string): void` | Register a subscription; sends `SUB` when `OPEN`, replayed on every open |
| `unsubscribe` | `(channel: TChannel, topic?: string, group?: string): void` | Remove a subscription; sends `UNSUB` when `OPEN` |
| `send` | `(channel: TChannel, payload?: unknown, topic?: string, group?: string): void` | Send `MSG`; queued while not `OPEN` |
| `request` | `<T = unknown>(channel: TChannel, payload?: unknown, options?: { topic?: string; group?: string; timeout?: number }): Promise<T>` | Correlated RPC via `REQ` / `RES` |
| `close` | `(): void` | Stop reconnecting, reject pending auth and requests, clear the queue, close the socket, state `'CLOSED'` |
| `attachToBus` | `(bus: RemoteBusLike<TChannel>, options?: RemoteBusBridgeConfig<TChannel>): () => void` | Same as `bridgeRemoteBus(bus, this, options)` |

### `function bridgeRemoteBus<TChannel>(bus, client, config?): () => void`

```typescript
function bridgeRemoteBus<TChannel extends string = string>(
    bus: RemoteBusLike<TChannel>,
    client: RemoteMeshClient<TChannel>,
    config?: RemoteBusBridgeConfig<TChannel>,
): () => void;
```

Subscribes `config.remoteSubscriptions`, forwards every incoming `MSG` to `bus.send`, registers `bus.provide` forwarders for the array form of `config.remoteRequests`. The returned function undoes all three.

### `type ClientConnectionState`

```typescript
type ClientConnectionState = 'CONNECTING' | 'OPEN' | 'RECONNECTING' | 'CLOSED';
```

### `interface RemoteClientOptions`

| Option | Type | Default | Purpose |
|---|---|---|---|
| `url` | `string \| (() => string)` | - | WebSocket URL for the global `WebSocket`; a function is called on each connect |
| `socketFactory` | `() => WebSocket \| RemoteSocket` | - | Custom socket; takes precedence over `url` |
| `token` | `string` | - | Static token sent as `AUTH` on every open |
| `tokenGetter` | `() => string \| undefined \| Promise<string \| undefined>` | - | Token provider used when `token` is not set |
| `codec` | `FrameCodec` | `defaultCodec` | Frame serialization |
| `heartbeatIntervalMs` | `number` | `15000` | `PING` interval |
| `heartbeatTimeoutMs` | `number` | `5000` | Max wait for `PONG` before the socket is terminated |
| `minReconnectDelayMs` | `number` | `500` | First reconnect delay (before jitter) |
| `maxReconnectDelayMs` | `number` | `10000` | Backoff cap (before jitter) |
| `maxOfflineQueueSize` | `number` | `200` | Max buffered `MSG` frames while not `OPEN` |
| `defaultRequestTimeoutMs` | `number` | `10000` | `request()` timeout when none is passed |
| `logger` | `{ debug?, info?, warn?, error? }` | - | Optional logger; each method is `(msg: string, ...args: unknown[]) => void` |

### `interface RemoteSubscriptionItem<TChannel>`

```typescript
interface RemoteSubscriptionItem<TChannel extends string = string> {
    channel: TChannel;
    topic?: string;
    group?: string;
}
```

### `interface RemoteBusBridgeConfig<TChannel>`

| Field | Type | Behavior in `bridgeRemoteBus` |
|---|---|---|
| `remoteRequests` | `TChannel[] \| ((channel: string) => boolean)` | Array: one `bus.provide` forwarder per channel. Function form: declared, not used |
| `sendToRemote` | `TChannel[] \| ((channel: string) => boolean)` | Declared, not used |
| `remoteSubscriptions` | `RemoteSubscriptionItem<TChannel>[]` | Subscribed on bridge, unsubscribed on dispose |

---

## Server (`@actdim/msgmesh-remote/server`)

### `class RemoteMeshServer<TChannel, TGroup>`

```typescript
constructor(options: RemoteServerOptions<TChannel, TGroup>)
readonly options: RemoteServerOptions<TChannel, TGroup>
readonly codec: FrameCodec // options.codec ?? defaultCodec
```

| Member | Signature | Purpose |
|---|---|---|
| `handleConnection` | `(socket: RemoteSocket, context?: Partial<RemoteConnectionContext>): RemoteClientSession<TChannel, TGroup>` | Create a session, decode and dispatch its frames, clean up on `close` / `error` |
| `broadcast` | `(channel: TChannel, payload?: unknown, topic?: string, group?: string): void` | Send `MSG` to every session subscribed to the address (no `filterEvent`) |
| `activeSessionsCount` | `get: number` | Number of live sessions |
| `close` | `(): void` | Close every session and its socket |

### `class RemoteClientSession<TChannel, TGroup>`

Created by `handleConnection`; one per socket.

| Member | Signature | Purpose |
|---|---|---|
| `context` | `readonly RemoteConnectionContext` | Connection identity; `connectionId` defaults to `conn-<random>` |
| `socket` | `readonly RemoteSocket` | Underlying socket |
| `send` | `(frame: RemoteFrame<TChannel>): void` | Encode and send a frame (no-op after `close`) |
| `isSubscribed` | `(channel: string, topic?: string, group?: string): boolean` | Wildcard-aware subscription match |
| `handleFrame` | `(frame: RemoteFrame<TChannel>): Promise<void>` | Dispatch one decoded frame (auth, authorize, `PING`, `SUB`, `UNSUB`, `MSG`, `REQ`) |
| `close` | `(): void` | Abort all bus listeners and clear subscriptions |

### `interface RemoteConnectionContext`

```typescript
interface RemoteConnectionContext {
    connectionId: string;
    userId?: string;
    metadata?: Record<string, unknown>;
}
```

### `interface RemoteServerOptions<TChannel, TGroup>`

| Option | Signature | Purpose |
|---|---|---|
| `bus` | `RemoteServerBusLike<TChannel, TGroup>` | Required. Target of `MSG` / `REQ`, source of forwarded events |
| `codec` | `FrameCodec` | Frame serialization (default `defaultCodec`) |
| `resolveChannels` | `(channelPattern: string) => TChannel[]` | Expand a `SUB` / `UNSUB` channel (pattern) into bus channels |
| `onAuthenticate` | `(token, context) => result \| Promise<result>` where `result` is `{ userId?, metadata? } \| boolean \| null` | Validate `AUTH` tokens |
| `authorize` | `(context, frame: RemoteFrame<TChannel>) => boolean \| Promise<boolean>` | Gate every non-`AUTH` frame |
| `filterEvent` | `(context, channel: string, payload: unknown, topic?: string, group?: string) => boolean` | Per-session event visibility (replaces the default owner filter) |
| `logger` | `{ debug?, info?, warn?, error? }` | Optional logger |

---

## Protocol (`@actdim/msgmesh-remote/protocol`)

### Errors

| Class | Constructor | Thrown when |
|---|---|---|
| `FrameDecodeError` | `(message: string, cause?: unknown)` | Raw data is not a string / `Uint8Array`, or JSON parsing fails |
| `InvalidFrameError` | `(message: string)` | Parsed value is not a valid frame |

Messages are prefixed with `[msgmesh-remote] Frame decode error:` and `[msgmesh-remote] Invalid frame:`.

### Validation and codec

| Export | Signature | Purpose |
|---|---|---|
| `validateFrame` | `(data: unknown): RemoteFrame` | Check type-specific required fields; throws `InvalidFrameError` |
| `JsonFrameCodec` | `class implements FrameCodec` | `encode(frame): string`, `decode(raw: string \| Uint8Array): RemoteFrame` |
| `defaultCodec` | `JsonFrameCodec` instance | Shared default codec |

### Frame factories

Optional arguments that are `undefined` are omitted from the frame.

| Function | Signature |
|---|---|
| `createSubFrame` | `<TChannel>(channel: TChannel, topic?: string, group?: string): RemoteSubFrame<TChannel>` |
| `createUnsubFrame` | `<TChannel>(channel: TChannel, topic?: string, group?: string): RemoteUnsubFrame<TChannel>` |
| `createMsgFrame` | `<TChannel, TPayload>(channel: TChannel, payload?: TPayload, topic?: string, group?: string): RemoteMsgFrame<TChannel, TPayload>` |
| `createReqFrame` | `<TChannel, TPayload>(id: string, channel: TChannel, payload?: TPayload, topic?: string, group?: string): RemoteReqFrame<TChannel, TPayload>` |
| `createResFrame` | `<TPayload, TError>(id: string, payload?: TPayload, error?: TError): RemoteResFrame<TPayload, TError>` (if `error` is defined, `payload` is dropped) |
| `createPingFrame` | `(): RemotePingFrame` |
| `createPongFrame` | `(): RemotePongFrame` |
| `createAuthFrame` | `(token: string, metadata?: Record<string, unknown>): RemoteAuthFrame` |
| `createAuthOkFrame` | `(userId?: string): RemoteAuthOkFrame` (empty `userId` omitted) |
| `createAuthFailFrame` | `(error: string, code?: number): RemoteAuthFailFrame` |

Note the argument order: `topic` comes before `group` in every factory and in the client methods.

---

## Types (`@actdim/msgmesh-remote/types`)

| Type | Kind | Summary |
|---|---|---|
| `RemoteFrameType` | union | `'SUB' \| 'UNSUB' \| 'MSG' \| 'REQ' \| 'RES' \| 'PING' \| 'PONG' \| 'AUTH' \| 'AUTH_OK' \| 'AUTH_FAIL'` |
| `RemoteSubFrame<TChannel>` | type | `{ t: 'SUB'; channel; group?; topic? }` |
| `RemoteUnsubFrame<TChannel>` | type | `{ t: 'UNSUB'; channel; group?; topic? }` |
| `RemoteMsgFrame<TChannel, TPayload>` | type | `{ t: 'MSG'; channel; group?; topic?; payload? }` |
| `RemoteReqFrame<TChannel, TPayload>` | type | `{ t: 'REQ'; id; channel; group?; topic?; payload? }` |
| `RemoteResFrame<TPayload, TError>` | type | `{ t: 'RES'; id; payload?; error? }` |
| `RemotePingFrame` / `RemotePongFrame` | type | `{ t: 'PING' }` / `{ t: 'PONG' }` |
| `RemoteAuthFrame` | type | `{ t: 'AUTH'; token; metadata? }` |
| `RemoteAuthOkFrame` | type | `{ t: 'AUTH_OK'; userId? }` |
| `RemoteAuthFailFrame` | type | `{ t: 'AUTH_FAIL'; error; code? }` |
| `RemoteFrame<TChannel, TPayload, TError>` | union | All ten frame types |
| `FrameCodec` | interface | `encode(frame): string \| Uint8Array`, `decode(raw): RemoteFrame` |
| `RemoteSocket` | interface | `send(data)`, `on('message' \| 'close' \| 'error', listener)`, `close(code?, reason?)` |
| `RemoteServerBusLike<TChannel, TGroup>` | interface | Optional `send`, `request`, `on` |
| `RemoteBusLike<TChannel, TGroup>` | interface | `RemoteServerBusLike` + optional `provide` |

Field-level details and validation rules: [Domain Model](./topic--domain-model.md).

---

## Package Scripts

See [Setup & Workflow](./topic--setup-and-workflow.md).

---

[<- Back to 04. Integration Guide](./topic--04-integration-guide.md) | [Back to Main README](../README.md)
