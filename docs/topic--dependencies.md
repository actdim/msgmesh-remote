---
protocol: along
protocol_version: "4.8.1"
slug: topic--dependencies
title: Dependencies & AI Documentation for @actdim/msgmesh-remote
type: topic
created: 2026-11-11
updated: 2026-11-11
tags: [dependencies, subproject, ai-context, rules]
---

# Dependencies & AI Documentation for `@actdim/msgmesh-remote`

> [!NOTE]
> This document maintains a localized registry of internal workspace dependencies and third-party libraries for `@actdim/msgmesh-remote`.
> Consult linked guidelines when developing, refactoring, or integrating components.

## Internal Workspace Dependencies

| Internal Package | Relative Path | AI Documentation & Context |
| :--- | :--- | :--- |
| **`@actdim/msgmesh`** | [`../../msgmesh`](../../msgmesh) | [AGENTS.md](../../msgmesh/AGENTS.md) <br> [CLAUDE.md](../../msgmesh/CLAUDE.md) <br> [llms-full.txt](../../msgmesh/llms-full.txt) <br> [llms.txt](../../msgmesh/llms.txt) <br> [.along/](../../msgmesh/.along) <br> [docs/](../../msgmesh/docs) |

## Declared External Dependencies with AI Guidelines

| Package | Ecosystem | Version | AI Guidelines / Instructions |
| :--- | :--- | :--- | :--- |
| **`@actdim/dev-config`** | `npm` | `1.14.0` | [AGENTS.md](../../../app-core/packages/dev-config/AGENTS.md) <br> manifest metadata (`ai`) |

## Transitive Dependency Guidelines & Invariants

No exported invariants detected across current dependencies.

## Usage in Agent Sessions
When working on features involving any of the modules or external libraries above:
1. **Internal Submodules**: Follow conventions in the linked package `AGENTS.md` or package `docs/`.
2. **Third-Party Libraries**: Read the linked instruction files directly for framework-specific patterns and best practices.
