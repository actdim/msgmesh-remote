---
protocol: along
slug: 03-architecture-and-wiring
title: Architecture & Wiring
type: topic
created: 2026-11-01
updated: 2026-11-01
tags: [03-architecture-and-wiring, sequence, bridge, session, rpc, pubsub]
---

# Architecture & Wiring

[<- Back to 02. Core Concepts](./topic--02-core-concepts.md) | [Next: 04. Integration Guide ->](./topic--04-integration-guide.md)

---

## 1. Component Map

```mermaid
flowchart TB
    subgraph Client["Client process (browser / WebView)"]
        LBUS["Local bus (RemoteBusLike)"]
        BRIDGE["bridgeRemoteBus / client.attachToBus"]
        RMC["RemoteMeshClient"]
        LBUS -- "provide(remoteRequests)" --> BRIDGE
        BRIDGE -- "bus.send(MSG)" --> LBUS
        BRIDGE <--> RMC
    end
    subgraph Wire["Transport"]
        SOCK["WebSocket or RemoteSocket + FrameCodec"]
    end
    subgraph Server["Server process"]
        RMS["RemoteMeshServer"]
        SES["RemoteClientSession (1 per socket)"]
        SBUS["Server bus (RemoteServerBusLike)"]
        RMS -- "handleConnection" --> SES
        SES -- "send / request / on" --> SBUS
    end
    RMC <--> SOCK <--> SES
```

| Unit | File | Responsibility |
|---|---|---|
| Frame types, socket and bus contracts | `src/types.ts` | Pure type declarations |
| Codec, validation, frame factories | `src/protocol.ts` | `JsonFrameCodec`, `validateFrame`, `create*Frame` |
| `RemoteMeshServer`, `RemoteClientSession` | `src/server.ts` | Session registry, frame dispatch, bus listeners, auth hooks |
| `RemoteMeshClient`, `bridgeRemoteBus` | `src/client.ts` | Connection state, heartbeat, reconnect, queue, RPC, bus bridge |

---

## 2. Connection Open, Auth and Resubscribe

```mermaid
sequenceDiagram
    participant App as Client app
    participant C as RemoteMeshClient
    participant S as RemoteClientSession
    participant H as Server hooks
    App->>C: connect()
    Note over C: state CONNECTING (or RECONNECTING)
    C->>S: socket open (handleConnection(socket, context))
    Note over C: state OPEN, heartbeat started
    C->>S: AUTH { token } (if token / tokenGetter)
    S->>H: onAuthenticate(token, context)
    H-->>S: { userId, metadata } | true | falsy
    S-->>C: AUTH_OK { userId } or AUTH_FAIL { error, code }
    C->>S: SUB { channel, topic?, group? } (replay of every registered subscription)
    C->>S: MSG ... (offline queue flush, FIFO)
```

`AUTH`, `SUB` and the queued `MSG` frames are written back to back. On the server each frame is dispatched as `void session.handleFrame(frame)`, so an `onAuthenticate` that awaits I/O can still be running when the following `SUB` frames are processed.

---

## 3. Remote RPC (client -> server)

```mermaid
sequenceDiagram
    participant UI as UI code
    participant LB as Local bus
    participant BR as bridgeRemoteBus provider
    participant C as RemoteMeshClient
    participant S as RemoteClientSession
    participant SB as Server bus
    UI->>LB: request({ channel: 'API.REMOTE.CALL', payload })
    LB->>BR: provider callback(inMsg)
    BR->>C: request(channel, inMsg.payload, { topic, group })
    C->>S: REQ { id, channel, topic?, group?, payload }
    S->>S: authorize(context, frame)?
    S->>SB: request({ channel, group, topic, payload })
    SB-->>S: response (msgmesh Msg or raw value)
    S-->>C: RES { id, payload } or RES { id, error }
    C-->>BR: resolve(payload) / reject(error)
    BR-->>LB: provider result
    LB-->>UI: response
```

- Only channels listed in `RemoteBusBridgeConfig.remoteRequests` (array form) get a local `provide()` registration. The topic and group are taken from `inMsg.address` (falling back to `inMsg.topic` / `inMsg.group`).
- On the server, a response object that has a `payload` property (a msgmesh response message) is unwrapped to that `payload`; any other value is sent as-is.
- A thrown error becomes `RES.error`: for an `Error` instance `{ message, name, ...ownEnumerableProps }`, for another object its own enumerable props, otherwise `{ message: String(err) }`.
- `client.request()` can also be called directly without the bridge.

---

## 4. Server Events to the Client (pub/sub)

```mermaid
sequenceDiagram
    participant C as RemoteMeshClient
    participant S as RemoteClientSession
    participant SB as Server bus
    participant SVC as Server service
    participant LB as Client local bus
    C->>S: SUB { channel: 'WORKS.INTAKE.*' }
    S->>S: resolveChannels('WORKS.INTAKE.*') -> concrete channels
    S->>SB: on({ channel, topic, options: { abortSignal }, callback }) per channel
    SVC->>SB: send({ channel: 'WORKS.INTAKE.RECEIVED', payload })
    SB-->>S: callback(msg)
    S->>S: isSubscribed(channel, topic, group) and filterEvent / default owner filter
    S-->>C: MSG { channel, topic?, group?, payload }
    C->>C: onMessage listeners
    C->>LB: bus.send({ channel, group, topic, payload }) (via bridge)
```

### Server subscription pipeline

For a `SUB` frame, `RemoteClientSession`:

1. Stores the subscription under `channel::group::topic`.
2. Computes the bus channels to listen on: `resolveChannels(frame.channel)` if configured, otherwise `[frame.channel]` verbatim.
3. For each bus channel not yet listened on (keyed by `busChannel::topic`), calls `bus.on({ channel, topic, options: { abortSignal }, callback })`. A topic of `'*'` is translated to the msgmesh regex topic `'/.*/'`. No `group` is passed, so a msgmesh bus listens on its default group (`in`), which is also the group `bus.send` uses when none is given.
4. In the callback, reads `channel` / `topic` / `group` from `msg.address` (or top-level fields), takes `msg.payload` (or the whole message if there is none), re-checks `isSubscribed`, applies `filterEvent` (or the default owner filter) and sends a `MSG` frame.

Two consequences for a msgmesh server bus:

- **Channel wildcards need `resolveChannels`.** Without it, `SUB 'WORKS.INTAKE.*'` makes the session listen on a bus channel literally named `WORKS.INTAKE.*`.
- **Topic-less subscriptions only see topic-less events.** msgmesh matches an undefined listener topic only against messages without a topic, so to receive `JOBS.STATUS` events published with `topic: jobId`, subscribe with that topic (or with `'*'`).

`UNSUB` removes the stored subscription and aborts a bus listener only when no remaining subscription resolves to the same bus channel and topic. Closing the socket (`close` or `error` event) calls `session.close()`, which aborts every bus listener and removes the session from the server.

### Server-initiated pushes

`server.broadcast(channel, payload?, topic?, group?)` sends a `MSG` to every session whose subscriptions match, independent of the server bus.

---

## 5. Client Messages to the Server (fire-and-forget)

```mermaid
sequenceDiagram
    participant App as Client app
    participant C as RemoteMeshClient
    participant S as RemoteClientSession
    participant SB as Server bus
    App->>C: send('CAD.OBJECT_MUTATION', payload)
    alt state OPEN
        C->>S: MSG { channel, payload }
    else not OPEN
        C->>C: offlineQueue.push (max maxOfflineQueueSize)
        Note over C: flushed after next open
        C->>S: MSG { channel, payload }
    end
    S->>S: authorize(context, frame)?
    S->>SB: send({ channel, group, topic, payload })
```

---

## 6. Heartbeat and Reconnect

```mermaid
sequenceDiagram
    participant C as RemoteMeshClient
    participant S as RemoteClientSession
    loop every heartbeatIntervalMs (15000)
        C->>S: PING
        alt PONG within heartbeatTimeoutMs (5000)
            S-->>C: PONG
        else timeout
            C->>C: close socket, state RECONNECTING
            C->>C: wait min(min * 1.5^(n-1), max) * jitter
            C->>S: new socket, open sequence (AUTH, SUB replay, queue flush)
        end
    end
```

---

## 7. Declarative Bridge

`bridgeRemoteBus(bus, client, config)` (or `client.attachToBus(bus, config)`) wires three things and returns one disposer:

| Config field | Effect |
|---|---|
| `remoteSubscriptions: RemoteSubscriptionItem[]` | `client.subscribe(...)` for each item now; `client.unsubscribe(...)` on dispose |
| `remoteRequests: TChannel[]` | `bus.provide({ channel, callback })` forwarding to `client.request(...)`; provider disposed on dispose |
| *(always)* | `client.onMessage` -> `bus.send({ channel, group, topic, payload })` for every incoming `MSG` |

`RemoteBusBridgeConfig` also declares `remoteRequests` as a predicate function and a `sendToRemote` field; neither is acted on by `bridgeRemoteBus` in the current source (only the array form of `remoteRequests` registers providers, and local-to-remote forwarding is done by calling `client.send` yourself).

---

[<- Back to 02. Core Concepts](./topic--02-core-concepts.md) | [Next: 04. Integration Guide ->](./topic--04-integration-guide.md)
