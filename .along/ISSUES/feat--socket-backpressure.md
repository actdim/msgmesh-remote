---
protocol: along
protocol_version: "4.6.1"
slug: socket-backpressure
type: feat
status: open
priority: medium
created: 2026-11-08
updated: 2026-11-08
agent: claude-code
tags: [client, server, transport, backpressure, flow-control]
blocked_by: []
related: []
---

# Transport backpressure on WebSocket send (bufferedAmount watermarks)

- Source: `src/client.ts` (`send()`, `sendRaw()`, bus bridge `onMessage` -> `void bus.send(...)`), `src/server.ts` (`RemoteClientSession.send()`, event forwarding at the `createMsgFrame` call), `src/types.ts` (`RemoteSocket`)
- Upstream: `@actdim/msgmesh` issue `feat--async-publish-and-backpressure` (phase 1, in-flight limit per channel). This issue is phase 3 of the same flow control plan.

## Context

Both sides write frames into the socket with no regard for its send buffer:

- `RemoteMeshClient.send()` is synchronous and returns `void`; `sendRaw()` calls `socket.send(data)` directly. Only the offline queue is bounded (`maxOfflineQueueSize`, default 200, drops with a warning); the online path is unbounded.
- `RemoteClientSession.send()` on the server forwards every server bus event matching a client subscription. A fast server-side producer and a slow client (mobile network, background tab) grow the socket buffer without limit.
- `RemoteSocket` (duck-typed contract in `src/types.ts`) has no `bufferedAmount`, so the library cannot observe the buffer even when the underlying socket exposes it (browser `WebSocket`, Node `ws`).

The bus-level flow control in `@actdim/msgmesh` (phase 1) already throttles remote request/response end to end, because the remote `out` answer is republished locally and releases the slot. It does not bound the socket buffer itself: fire-and-forget `send()` frames and server-pushed events are not covered.

Unlike the in-process bus, the socket has a real byte buffer, so high/low watermarks are the right tool here. A browser `WebSocket` emits no `drain` event, so the low watermark has to be polled; the gap between the two thresholds prevents flapping around a single limit.

## Requirements

- REQ-1: `RemoteSocket` MUST gain an optional `readonly bufferedAmount?: number`. Sockets without it keep the current unbounded behavior.
- REQ-2: Client and server options MUST support `sendBuffer?: { highWatermark: number; lowWatermark: number; pollInterval?: number; overflow?: 'wait' | 'drop' | 'error' }` (bytes; default `pollInterval` 10 ms, default overflow `'wait'`).
- REQ-3: The client MUST expose an awaitable send (`sendAsync()` or a changed `send()` returning `Promise<void>`; pick one and keep the other for compatibility) that, with `overflow: 'wait'`, resolves once the frame is written and waits while `bufferedAmount > highWatermark` until it drops below `lowWatermark`.
- REQ-4: Frames waiting for buffer space MUST be kept in a bounded FIFO with frame order preserved; control frames (auth, ping/pong, sub/unsub, responses) MUST bypass it.
- REQ-5: On the server, forwarded events for a session over the high watermark MUST follow the configured overflow policy (`'drop'` logs a warning per burst, `'error'` closes the session with a clear reason) instead of growing the buffer.
- REQ-6: The bus bridge (`client.onMessage` -> `void bus.send(...)`) MUST keep frame order when the local bus channel has `flowControl` and `send()` waits; document that the local waiter queue is then the buffer.
- REQ-7: Waiting MUST stop on socket close: pending sends reject (or move to the offline queue, consistent with the existing reconnect logic) and the poll timer is cleared.

## Acceptance Criteria

- [ ] Fake socket with a controllable `bufferedAmount`: sends wait above the high watermark and resume below the low watermark, order preserved.
- [ ] Control frames are sent while data frames wait.
- [ ] Server-side `'drop'` and `'error'` overflow policies covered by tests.
- [ ] Socket without `bufferedAmount`: behavior unchanged (existing tests pass).
- [ ] Close while waiting: no leaked timers, pending sends settled per REQ-7.
- [ ] README / docs describe the options and the relation to msgmesh `flowControl`.
