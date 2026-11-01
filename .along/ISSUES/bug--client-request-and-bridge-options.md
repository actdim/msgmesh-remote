---
protocol: along
protocol_version: "4.6.0"
slug: client-request-and-bridge-options
type: bug
status: open
priority: medium
created: 2026-11-01
updated: 2026-11-01
agent: claude-code
tags: [client, bridge]
blocked_by: []
related: []
---

# request() before OPEN always times out; bridge ignores sendToRemote and function remoteRequests

`request()` called while the client is not OPEN is registered as pending but never sent, queued or resent on reconnect, so it always times out. `RemoteBusBridgeConfig.sendToRemote` and the function form of `remoteRequests` are declared but `bridgeRemoteBus` ignores them (it only handles `Array.isArray(remoteRequests)`).

## Requirements
- REQ-1: Requests made before OPEN MUST be queued and sent on open (or rejected immediately, by documented policy).
- REQ-2: Every declared `RemoteBusBridgeConfig` option MUST have an effect or be removed.

## Acceptance Criteria
- [ ] Test: request issued while CONNECTING resolves after open.
- [ ] Tests for `sendToRemote` and function `remoteRequests`.
