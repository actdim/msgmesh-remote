# Vision

_North star: scope, boundaries, non-goals, roadmap. Evolves slowly; slims as features ship._

## Scope

- Extend `@actdim/msgmesh` buses across a network boundary with the same `{ channel, group, topic, payload }` addressing on both sides.
- A small, validated JSON wire protocol (`SUB`, `UNSUB`, `MSG`, `REQ`, `RES`, `PING`, `PONG`, `AUTH`, `AUTH_OK`, `AUTH_FAIL`) with a pluggable `FrameCodec`.
- A framework-agnostic server (`RemoteMeshServer`, `RemoteClientSession`) that works over any socket matching `RemoteSocket` and exposes policy hooks: `onAuthenticate`, `authorize`, `resolveChannels`, `filterEvent`.
- A resilient client (`RemoteMeshClient`) for browsers and mobile WebViews: heartbeat with dead-socket detection, exponential reconnect with jitter, subscription replay, bounded offline queue, correlated RPC, in-band token refresh.
- A declarative bridge (`bridgeRemoteBus` / `attachToBus`) between a local msgmesh bus and the client.
- Primary consumer: the mempart server (Fastify + `@fastify/websocket`) and webapp.

## Non-goals

- Owning the socket server or HTTP framework: hosts create the WebSocket endpoint and call `handleConnection`.
- Issuing or verifying credentials: token validation is delegated to `onAuthenticate`.
- Durable or exactly-once delivery: the offline queue is in-memory, bounded and covers fire-and-forget `MSG` frames only; `REQ` frames are not queued.
- Server-to-client RPC: `REQ` frames flow client -> server only.
- Depending on the msgmesh runtime: both sides use structural bus-like interfaces.

## Roadmap

- Implement or remove the declared-but-unused bridge options: `RemoteBusBridgeConfig.sendToRemote` and the predicate form of `remoteRequests`.
- Decide how `request()` behaves while disconnected (currently registered but neither sent nor queued until it times out).
- Align subscription semantics with msgmesh topic matching (a topic-less `SUB` only receives topic-less events from a msgmesh bus; wildcard channels need `resolveChannels`).
- Support the planned mempart .NET MAUI WebView shell as a client host (the heartbeat already targets suspended WebViews).
- Keep the wire protocol backward compatible so hosts in other languages can implement it.
