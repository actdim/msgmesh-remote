---
protocol: along
slug: domain-model
title: Domain Model
type: topic
created: 2026-11-01
updated: 2026-11-01
tags: [domain-model, frames, protocol, contracts]
---

# @actdim/msgmesh-remote Domain Model & Protocol Contracts

## 1. Domain Overview

The domain of `@actdim/msgmesh-remote` is the **wire frame**: a JSON object discriminated by `t`. Around it sit the contracts for serialization (`FrameCodec`), transport (`RemoteSocket`), the buses on each side (`RemoteServerBusLike`, `RemoteBusLike`) and the server's per-connection identity (`RemoteConnectionContext`). All types live in `src/types.ts` except `RemoteConnectionContext` (`src/server.ts`) and the client option types (`src/client.ts`).

## 2. Frames

### 2.1. Subscription frames (client -> server)

```typescript
type RemoteSubFrame<TChannel extends string = string> = {
    t: 'SUB';
    channel: TChannel;
    group?: string;
    topic?: string;
};

type RemoteUnsubFrame<TChannel extends string = string> = {
    t: 'UNSUB';
    channel: TChannel;
    group?: string;
    topic?: string;
};
```

`channel` may be a pattern (`'*'` or a trailing `*` prefix); `topic` / `group` may be `'*'`. Example: `{ "t": "SUB", "channel": "JOBS.STATUS", "topic": "job-42" }`.

### 2.2. Message frame (both directions)

```typescript
type RemoteMsgFrame<TChannel extends string = string, TPayload = unknown> = {
    t: 'MSG';
    channel: TChannel;
    group?: string;
    topic?: string;
    payload?: TPayload;
};
```

Client -> server: forwarded to `bus.send`. Server -> client: an event the session is subscribed to.

### 2.3. RPC frames

```typescript
type RemoteReqFrame<TChannel extends string = string, TPayload = unknown> = {
    t: 'REQ';
    id: string;
    channel: TChannel;
    group?: string;
    topic?: string;
    payload?: TPayload;
};

type RemoteResFrame<TPayload = unknown, TError = unknown> = {
    t: 'RES';
    id: string;
    payload?: TPayload;
    error?: TError;
};
```

`id` correlates a `RES` with its `REQ`. A `RES` has either `payload` or `error`. Error payloads produced by the server:

| Situation | `error` value |
|---|---|
| `authorize` denied a `REQ` | `{ message: 'Unauthorized', code: 403 }` |
| Server bus has no `request` | `{ message: 'Server bus has no request provider' }` |
| `bus.request` threw an `Error` | `{ message, name, ...ownEnumerableProps }` |
| `bus.request` threw a non-`Error` object | its own enumerable properties |
| `bus.request` threw a primitive | `{ message: String(err) }` |

### 2.4. Heartbeat frames

```typescript
type RemotePingFrame = { t: 'PING' };
type RemotePongFrame = { t: 'PONG' };
```

Either side answers `PING` with `PONG`; only the client sends `PING` on a timer.

### 2.5. Authentication frames

```typescript
type RemoteAuthFrame = { t: 'AUTH'; token: string; metadata?: Record<string, unknown> };
type RemoteAuthOkFrame = { t: 'AUTH_OK'; userId?: string };
type RemoteAuthFailFrame = { t: 'AUTH_FAIL'; error: string; code?: number };
```

Server codes: `401` for a falsy `onAuthenticate` result, `500` when `onAuthenticate` throws. `RemoteAuthFrame.metadata` is part of the frame contract; the server's `handleAuth` passes only `token` and the session context to `onAuthenticate`, and the client's automatic and explicit `AUTH` frames carry no metadata.

### 2.6. Union and type tag

```typescript
type RemoteFrameType = 'SUB' | 'UNSUB' | 'MSG' | 'REQ' | 'RES' | 'PING' | 'PONG' | 'AUTH' | 'AUTH_OK' | 'AUTH_FAIL';

type RemoteFrame<TChannel extends string = string, TPayload = unknown, TError = unknown> =
    | RemoteSubFrame<TChannel>
    | RemoteUnsubFrame<TChannel>
    | RemoteMsgFrame<TChannel, TPayload>
    | RemoteReqFrame<TChannel, TPayload>
    | RemoteResFrame<TPayload, TError>
    | RemotePingFrame
    | RemotePongFrame
    | RemoteAuthFrame
    | RemoteAuthOkFrame
    | RemoteAuthFailFrame;
```

## 3. Validation Rules (`validateFrame`)

| `t` | Required | Optional, type-checked |
|---|---|---|
| `SUB`, `UNSUB`, `MSG` | `channel`: non-empty string | `group`, `topic`: string |
| `REQ` | `id`, `channel`: non-empty strings | `group`, `topic`: string |
| `RES` | `id`: non-empty string | - |
| `PING`, `PONG` | - | (returned as a fresh `{ t }` object; extra fields dropped) |
| `AUTH` | `token`: non-empty string | - |
| `AUTH_OK` | - | - |
| `AUTH_FAIL` | `error`: non-empty string | - |

Anything else (non-object, missing or unknown `t`) throws `InvalidFrameError`. `payload`, `error`, `metadata`, `userId` and `code` are not type-checked; other frames are returned as received, extra fields included.

## 4. Infrastructure Contracts

### 4.1. `FrameCodec`

```typescript
interface FrameCodec {
    encode(frame: RemoteFrame): string | Uint8Array;
    decode(raw: string | Uint8Array): RemoteFrame;
}
```

### 4.2. `RemoteSocket`

```typescript
interface RemoteSocket {
    send(data: string | Uint8Array): void;
    on(event: 'message', listener: (data: unknown) => void): void;
    on(event: 'close', listener: (code?: number, reason?: string) => void): void;
    on(event: 'error', listener: (err: unknown) => void): void;
    close(code?: number, reason?: string): void;
}
```

### 4.3. Bus-like contracts

```typescript
interface RemoteServerBusLike<TChannel extends string = string, TGroup extends string = string> {
    send?(msg: { channel: TChannel; group?: TGroup; topic?: string; payload?: unknown }): Promise<unknown> | void;
    request?(msg: { channel: TChannel; group?: TGroup; topic?: string; payload?: unknown }): Promise<unknown>;
    on?(params: {
        channel: TChannel;
        group?: TGroup;
        topic?: string;
        options?: { abortSignal?: AbortSignal };
        callback: (msg: {
            address?: { channel: string; group?: string; topic?: string };
            channel?: string;
            group?: string;
            topic?: string;
            payload?: unknown;
        }) => void;
    }): (() => void) | void;
}

interface RemoteBusLike<TChannel extends string = string, TGroup extends string = string>
    extends RemoteServerBusLike<TChannel, TGroup> {
    provide?(params: {
        channel: TChannel;
        group?: TGroup;
        callback: (inMsg: {
            address?: { channel: string; group?: string; topic?: string };
            channel?: string;
            topic?: string;
            group?: string;
            payload?: unknown;
        }) => Promise<unknown> | unknown;
    }): (() => void) | void;
}
```

Callbacks accept both msgmesh messages (address under `address`) and flat objects (address fields at top level).

### 4.4. `RemoteConnectionContext`

```typescript
interface RemoteConnectionContext {
    connectionId: string;          // handshake value or generated 'conn-<random>'
    userId?: string;               // handshake value, replaced by onAuthenticate
    metadata?: Record<string, unknown>; // handshake value, shallow-merged by onAuthenticate
}
```

## 5. Runtime Entities

| Entity | Lifetime | Key state |
|---|---|---|
| `RemoteMeshServer` | Application | Set of live sessions |
| `RemoteClientSession` | One socket | `context`, subscriptions (`channel::group::topic`), bus listeners (`busChannel::topic` -> abort) |
| `RemoteMeshClient` | Application | `ClientConnectionState`, subscription registry (`channel::group::topic`), offline `MSG` queue, pending requests by `id`, pending auth, heartbeat and reconnect timers |
| Bridge disposer | Until called | Message listener, `provide` disposers, bridge subscriptions |

## 6. Cross-Links

- [Knowledge Base Index](./INDEX.md) - Knowledge Base Root
- [Architecture](./topic--architecture.md) - System summary
- [Core Concepts](./topic--02-core-concepts.md) - How the frames are used
- [API Reference](./topic--05-api-reference.md) - Every public export
