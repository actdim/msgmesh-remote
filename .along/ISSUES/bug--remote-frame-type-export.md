---
protocol: along
protocol_version: "4.6.0"
slug: remote-frame-type-export
type: bug
status: open
priority: high
created: 2026-11-01
updated: 2026-11-01
agent: claude-code
tags: [types, protocol]
blocked_by: []
related: []
---

# ./protocol does not re-export RemoteFrame used by the mempart server

`src/protocol.ts` imports `type RemoteFrame` but never re-exports it, while mempart `apps/server/src/testRemoteMeshWebSocket.ts` imports `type RemoteFrame` from `@actdim/msgmesh-remote/protocol`.

## Requirements
- REQ-1: `@actdim/msgmesh-remote/protocol` MUST export the frame types it validates and builds (`RemoteFrame` and the per-type frame interfaces).

## Acceptance Criteria
- [ ] mempart `apps/server` typechecks against the built package.
- [ ] API reference lists the exported types.
