---
protocol: along
protocol_version: "4.6.1"
slug: adopt-dev-config
type: task
status: done
completed: 2026-11-08
priority: medium
created: 2026-11-06
updated: 2026-11-08
agent: antigravity
parent: task--shared-lint-tsconfig
tags: [tooling, lint, typescript, dev-config]
blocked_by: []
related: []
plan_status: approved
---

# Adopt @actdim/dev-config shared presets

## Problem Statement
Migrate local ESLint, Prettier, and TypeScript compiler configurations to `@actdim/dev-config`.

## Phase 2b Recipe
1. Baseline: ESLint findings, print-config of 2 files, showConfig of `tsconfig.build.json` and `tsconfig.dev.json`, `prettier --check`.
2. Add devDependency `"@actdim/dev-config": ">=1.12.2"`.
3. ESLint config:
   - `msgmesh`, `utico`, `msgmesh-remote`, `msgmesh-store`: use `base()` with existing `noExplicitAny` setting.
   - `dynstruct`: use `base({ indent: 'off' })` + `react()`.
   - `dynstruct-mui`: use `base()` + `react()`.
   - `livestruct`: use `legacyRoot()` plus local `no-explicit-any: error` block.
4. Prettier config: `{ ...base, jsxSingleQuote: false, trailingComma: 'all' }` unless check list stays equal without overrides.
5. tsconfig: extend `["@actdim/dev-config/tsconfig/base.json", "@actdim/dev-config/tsconfig/loose.json"]` plus differing options. Intentional diffs: drop decorator flags, `lib: ["ES2022", "DOM", "DOM.Iterable"]`, `isolatedModules: true`.
6. Drop unused plugin devDependencies.
7. Verify standalone: `pnpm install && pnpm lint && pnpm typecheck` in a standalone clone.
8. Commit in submodule, push to remote, and bump pointer in Mempart root.

## Outcome (2026-11-08)
- Recipe correction: this package has no ESLint (no config, no `lint` script), so step 3 does not apply; adding it is `debt--add-eslint`.
- `lib` stays `["ESNext", "DOM", "DOM.Iterable"]` (ES2022 would drop ESNext APIs).
- `prettier.config.js` = `@actdim/dev-config/prettier` (inside Mempart the package previously resolved Mempart `src/prettier.config.js`, the dev-config tailwind preset; standalone it had no config). Prettier `--check` list unchanged. `prettier` devDependency raised to `^3.9.6` (dev-config peer).
- `--showConfig` diffs (build, dev): decorator flags removed, `isolatedModules: true` (+ implied `preserveConstEnums`), `dom.iterable` added. Nothing else.
- In Mempart and in a standalone clone: typecheck, build and 4 test files pass, as at HEAD.

## Acceptance Criteria
- [x] Submodule builds and passes typecheck standalone (no lint configured; see `debt--add-eslint`).
- [x] No regression in effective compiler options and Prettier results.
