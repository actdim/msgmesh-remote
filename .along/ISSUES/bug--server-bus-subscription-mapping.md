---
protocol: along
protocol_version: "4.6.0"
slug: server-bus-subscription-mapping
type: bug
status: open
priority: high
created: 2026-11-01
updated: 2026-11-01
agent: claude-code
tags: [server, subscriptions]
blocked_by: []
related: []
---

# Server SUB mapping ignores group, wildcards and topic-less semantics of msgmesh

Without `resolveChannels`, `SUB 'X.*'` calls `bus.on` on the literal channel `X.*`. A topic-less SUB calls `bus.on` with `topic: undefined`, which in msgmesh matches only topic-less messages, while `isSubscribed` treats a missing topic as a wildcard. The server never passes `group`, so only the default `in` group is observed and events published on `out` are not forwarded. Unit tests pass only because they use a mock bus. The webapp's `remoteSubscriptions: [{ channel: 'JOBS.STATUS' }]` receives nothing for per-job topics.

## Requirements
- REQ-1: Server subscriptions MUST map channel wildcards, missing topics and `group` onto msgmesh with the same semantics `isSubscribed` uses.
- REQ-2: Tests MUST run against a real `@actdim/msgmesh` bus, not only a mock.

## Acceptance Criteria
- [ ] Integration test with a real bus: wildcard channel, topic-less SUB and `out` group events reach the client.
- [ ] mempart webapp job status subscription works without per-job SUBs, or the docs state why it must not.
