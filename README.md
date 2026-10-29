# @actdim/msgmesh-remote

Bidirectional remote transport, WebSocket bridge, and reconnect orchestration for `@actdim/msgmesh`.

## Features

- **Full-Duplex Wire Protocol**: Strongly typed lightweight frame protocol (`SUB`, `UNSUB`, `MSG`, `REQ`, `RES`, `PING`, `PONG`).
- **Framework-Agnostic Server**: Duck-typed `RemoteSocket` contract compatible with Fastify, pure `ws`, or custom WebSocket implementations, with direct parity for C# ASP.NET Core Kestrel.
- **Resilient Client**: Active 15s heartbeat with missed-pong detection, preventing dead half-open sockets in mobile WebViews (.NET MAUI, iOS WKWebView, Android WebView).
- **Auto-Resubscription**: Automatically replays active channel and topic subscriptions upon reconnection.
- **Offline Message Buffer**: Bounded queue buffering outbound fire-and-forget messages during brief disconnects.
- **RPC Correlation**: Integrates with `bus.request()` mapping requests to correlated responses with timeout handling.

## Installation

```bash
pnpm add @actdim/msgmesh-remote @actdim/msgmesh rxjs
```

## License

MIT
