---
protocol: along
protocol_version: "4.6.0"
slug: auth-on-open-race
type: bug
status: open
priority: medium
created: 2026-11-01
updated: 2026-11-01
agent: claude-code
tags: [client, server, auth]
blocked_by: []
related: []
---

# AUTH on open is fire-and-forget and races SUB processing

The AUTH sent on open has no pending entry, so AUTH_FAIL only logs a warning. Server frames are dispatched with `void handleFrame`, so a SUB can be processed before an async `onAuthenticate` finishes. `RemoteAuthFrame.metadata` is never read by either side.

## Requirements
- REQ-1: The server MUST process frames of a session in order, with SUB waiting for a pending AUTH.
- REQ-2: The client MUST surface AUTH_FAIL on open through its state or error stream.
- REQ-3: `metadata` MUST be passed to `onAuthenticate` or removed from the frame type.

## Acceptance Criteria
- [ ] Test: slow `onAuthenticate` followed by SUB is authorized correctly.
- [ ] Test: AUTH_FAIL on open is observable by the client.
