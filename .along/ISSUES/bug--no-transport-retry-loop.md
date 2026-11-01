---
protocol: along
protocol_version: "4.6.0"
slug: no-transport-retry-loop
type: bug
status: open
priority: low
created: 2026-11-01
updated: 2026-11-01
agent: claude-code
tags: [client, transport]
blocked_by: []
related: []
---

# connect() retries forever when no WebSocket transport exists

With no global `WebSocket` and no `socketFactory`, `connect()` logs an error and keeps retrying with backoff forever. Separately, a `socketFactory` returning a Node `ws` socket takes the `addEventListener` path, whose events may not be `MessageEvent` instances, so the event object itself is passed to `decode` (unverified).

## Requirements
- REQ-1: A missing transport MUST fail fast with a clear error instead of retrying.
- REQ-2: Compatibility with Node `ws` sockets MUST be verified by a test and fixed if broken.

## Acceptance Criteria
- [ ] Test: no transport -> single error, no reconnect loop.
- [ ] Test with a `ws`-style socket delivering messages.
