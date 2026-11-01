---
protocol: along
protocol_version: "4.5.4"
slug: kb-parity-and-pages
type: docs
status: in-progress
priority: medium
created: 2026-11-01
updated: 2026-11-01
agent: claude-code
tags: [docs, pages]
parent: docs--lib-docs-demo-pages
blocked_by: []
related: []
---

# Knowledge base, llms.txt and VitePress Pages site at dynstruct parity

msgmesh-remote had no Along context and no documentation beyond a 22-line README. Along was
scaffolded with `along init` on 2026-11-01; the KB, llms files and a docs site follow the
`@actdim/dynstruct` reference set.

## Requirements
- REQ-1: `AGENTS.md` `## Project specifics` and `.along/VISION.md` MUST describe the package from facts in `src/` and package.json.
- REQ-2: The KB MUST contain overview, core concepts, architecture and wiring, integration guide, API reference, domain model, setup and license topics grounded in the `.`, `./client`, `./server`, `./protocol` exports.
- REQ-3: `llms.txt` and `llms-full.txt` MUST be regenerated from the KB via the Along KB pipeline.
- REQ-4: The repo MUST contain a VitePress config, a `docs:build` script, and a `pages.yml` workflow deploying to GitHub Pages.

## Acceptance Criteria
- [ ] No scaffold placeholder text remains in `docs/`, `AGENTS.md` or `.along/VISION.md`.
- [ ] Every API name cited in the KB exists in `src/`.
- [ ] `along kb-sync --check` reports no broken links.
- [ ] `pnpm run docs:build` succeeds locally.
