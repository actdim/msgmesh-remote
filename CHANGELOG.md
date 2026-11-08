# Changelog

All notable changes to `@actdim/msgmesh-remote` are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.14.0] - 2026-11-08

### Changed
- Adopted `@actdim/dev-config` 1.12.2 presets for ESLint, Prettier, and tsconfig (`#adopt-dev-config`).
- Synchronized GitHub Pages CI workflow, lockfile, and VitePress documentation with dynstruct parity (`#docs-ci-pages-parity`).
- Synchronized workspace dependencies to `>=1.14.0`.

## [1.12.0] - 2026-11-01

### Changed
- Version aligned with the mempart monorepo release; no library changes.

## [1.11.0] - 2026-10-30

### Added
- Initial release: wire protocol and `JsonFrameCodec` with validation; framework-agnostic `RemoteMeshServer` / `RemoteClientSession`; `RemoteMeshClient` with heartbeat, reconnect, subscription replay, offline queue and RPC; `bridgeRemoteBus`.
- In-band `AUTH` / `AUTH_OK` / `AUTH_FAIL`, channel groups, wildcard subscriptions, per-session event filtering.
- Generic `TChannel` / `TGroup` parameters; `url` accepts a getter function.
