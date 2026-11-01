---
protocol: along
slug: setup-and-workflow
title: Setup And Workflow
type: topic
created: 2026-11-01
updated: 2026-11-01
tags: [setup-and-workflow, build, test, docs, monorepo]
---

# @actdim/msgmesh-remote Setup, Build & Test Workflow

## 1. Repository Layout

`@actdim/msgmesh-remote` has its own Git repository (`https://github.com/actdim/msgmesh-remote`) and is developed as a Git submodule of the mempart monorepo at `src/packages/msgmesh-remote`. The monorepo's pnpm workspace (`src/pnpm-workspace.yaml`, `packages/*` and `apps/*`) links it with its sibling `@actdim/msgmesh` (`src/packages/msgmesh`) and with the consumers `apps/server` and `apps/webapp`.

```text
msgmesh-remote/
|-- src/            index.ts, types.ts, protocol.ts, server.ts, client.ts
|-- tests/          protocol, server, client and integration Vitest suites
|-- docs/           Knowledge Base (this folder) and the VitePress site config
|-- packageConfig.ts         aliases, source file list and peer externals for Vite / Vitest
|-- vite.config.ts           library build (ESM, preserveModules, .d.ts via vite-plugin-dts)
|-- vitest.node.config.ts    Node test configuration
|-- tsconfig*.json           base / build / dev project references
```

## 2. Prerequisites & Installation

- **Package manager**: `pnpm` (the mempart workspace pins `pnpm@10.30.3`)
- **TypeScript**: `^5.9.3`

Inside the monorepo, install from `src/`:

```bash
pnpm install
```

Peer dependencies for consumers:

```bash
pnpm add @actdim/msgmesh-remote @actdim/msgmesh rxjs
```

## 3. Scripts

Run from the package folder (`src/packages/msgmesh-remote`):

| Command | Action | Description |
|---|---|---|
| `pnpm run build` | `tsc -b tsconfig.json && vite build` | Typecheck, then emit ESM modules (`dist/<module>.es.js`) and declarations (`dist/<module>.d.ts`) |
| `pnpm run typecheck` | `tsc -b tsconfig.json` | Typecheck only |
| `pnpm run test` | `npx vitest --config=vitest.node.config.ts --no-cache` | Run all `tests/**/*.test.ts` once in Node |
| `pnpm run test:w` | `npx vitest --config=vitest.node.config.ts --watch` | Watch mode |
| `pnpm run format` | `prettier --write .` | Format |
| `pnpm run format:check` | `prettier --check .` | Check formatting |
| `pnpm run docs:dev` | `vitepress dev docs` | Local docs site |
| `pnpm run docs:build` | `vitepress build docs` | Build the docs site (GitHub Pages: https://actdim.github.io/msgmesh-remote/) |
| `pnpm run docs:preview` | `vitepress preview docs` | Preview the built docs |

From the monorepo root (`src/`), `pnpm build` runs every workspace package's `build` script, including this one.

## 4. Test Suites

| File | Covers |
|---|---|
| `tests/protocol.test.ts` | Encode/decode of every frame type, `Uint8Array` input, invalid JSON, unknown type, missing fields |
| `tests/server.test.ts` | `PING` -> `PONG`, `AUTH` success/failure, `REQ` -> `RES`, wildcard channel subscriptions, default tenant isolation, cleanup on close |
| `tests/client.test.ts` | `AUTH` on open, `authenticate()` resolve/reject, heartbeat and dead-socket termination, offline queue flush, `bridgeRemoteBus` |
| `tests/integration.test.ts` | Real client and server over an in-memory socket pair: RPC, pub/sub, offline buffering |

The client tests use Vitest fake timers; all suites are hermetic (no network).

Mempart also exercises the package end to end against a real Fastify WebSocket server in `apps/server/src/testRemoteMeshWebSocket.ts` and against the app bus in `apps/webapp/tests/remoteClient.test.ts`.

## 5. Versioning & Release

The mempart monorepo uses one synchronized version for all apps, packages and submodules. The package version (currently `1.12.0`) is never bumped in isolation: run `pnpm run version:sync <version>` from mempart's `src/` (it updates this package's `package.json` together with the others), then commit, tag `vX.Y.Z` and push the root repository and all submodules together. The `@actdim/msgmesh` peer range tracks the same version line (`>=1.12.0`).

The published tarball contains `dist`, `docs` (without `docs/.vitepress`), `README.md`, `LICENSE`, `AGENTS.md`, `CLAUDE.md`, `llms.txt` and `llms-full.txt` (see `files` in `package.json`).

## 6. Cross-Links

- [Knowledge Base Index](./INDEX.md) - Knowledge Base Root
- [Architecture](./topic--architecture.md) - Architecture
- [Domain Model](./topic--domain-model.md) - Domain Model
- [Integration Guide](./topic--04-integration-guide.md) - Integration Guide
- [API Reference](./topic--05-api-reference.md) - API Reference
- [License](./topic--license.md) - License Information
