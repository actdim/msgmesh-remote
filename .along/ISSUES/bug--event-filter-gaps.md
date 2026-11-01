---
protocol: along
protocol_version: "4.6.0"
slug: event-filter-gaps
type: bug
status: open
priority: high
created: 2026-11-01
updated: 2026-11-01
agent: claude-code
tags: [server, security, auth]
blocked_by: []
related: []
---

# Event filtering gaps: broadcast skips filterEvent, userless sessions get everything

`broadcast()` skips `filterEvent` entirely. The default owner filter lets sessions without a `userId` receive every event. `authorize` also gates `PING`, so an `authorize` that rejects PING causes heartbeat timeouts and a reconnect loop.

## Requirements
- REQ-1: Every outbound event path, including `broadcast()`, MUST pass through `filterEvent`.
- REQ-2: The default filter MUST NOT deliver user-owned events to unauthenticated sessions.
- REQ-3: Heartbeat frames MUST NOT be subject to `authorize`.

## Acceptance Criteria
- [ ] Tests for each of REQ-1..3.
- [ ] Security notes in `docs/topic--03-architecture-and-wiring.md` updated.
