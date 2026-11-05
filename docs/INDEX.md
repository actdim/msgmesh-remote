---
protocol: along
slug: INDEX
title: '@actdim/msgmesh-remote - Knowledge Base Topic Index'
type: index
created: 2026-11-01
updated: 2026-11-05
tags: [index, kb, topics, map]
---

# @actdim/msgmesh-remote - Knowledge Base Topic Index

Central entry point and cross-linked topic catalog for project documentation:

## Knowledge Graph & Topic Map

```mermaid
flowchart TD
    INDEX["Knowledge Base (INDEX)"]
    T_01_OVERVIEW_AND_ADVANTAGES["Overview & Key Advantages"]
    INDEX --> T_01_OVERVIEW_AND_ADVANTAGES
    T_02_CORE_CONCEPTS["Core Concepts"]
    INDEX --> T_02_CORE_CONCEPTS
    T_03_ARCHITECTURE_AND_WIRING["Architecture & Wiring"]
    INDEX --> T_03_ARCHITECTURE_AND_WIRING
    T_04_INTEGRATION_GUIDE["Integration Guide"]
    INDEX --> T_04_INTEGRATION_GUIDE
    T_05_API_REFERENCE["API Reference"]
    INDEX --> T_05_API_REFERENCE
    T_ALONG_PROTOCOL["Along Protocol Reference"]
    INDEX --> T_ALONG_PROTOCOL
    T_ARCHITECTURE["Architecture"]
    INDEX --> T_ARCHITECTURE
    T_DOMAIN_MODEL["Domain Model"]
    INDEX --> T_DOMAIN_MODEL
    T_LICENSE["License"]
    INDEX --> T_LICENSE
    T_SETUP_AND_WORKFLOW["Setup And Workflow"]
    INDEX --> T_SETUP_AND_WORKFLOW
    T_01_OVERVIEW_AND_ADVANTAGES -.->|references| T_02_CORE_CONCEPTS
    T_01_OVERVIEW_AND_ADVANTAGES -.->|references| T_04_INTEGRATION_GUIDE
    T_02_CORE_CONCEPTS -.->|references| T_01_OVERVIEW_AND_ADVANTAGES
    T_02_CORE_CONCEPTS -.->|references| T_03_ARCHITECTURE_AND_WIRING
    T_02_CORE_CONCEPTS -.->|references| T_DOMAIN_MODEL
    T_03_ARCHITECTURE_AND_WIRING -.->|references| T_02_CORE_CONCEPTS
    T_03_ARCHITECTURE_AND_WIRING -.->|references| T_04_INTEGRATION_GUIDE
    T_04_INTEGRATION_GUIDE -.->|references| T_03_ARCHITECTURE_AND_WIRING
    T_04_INTEGRATION_GUIDE -.->|references| T_05_API_REFERENCE
    T_05_API_REFERENCE -.->|references| T_04_INTEGRATION_GUIDE
    T_05_API_REFERENCE -.->|references| T_DOMAIN_MODEL
    T_05_API_REFERENCE -.->|references| T_SETUP_AND_WORKFLOW
    T_ARCHITECTURE -.->|references| T_03_ARCHITECTURE_AND_WIRING
    T_ARCHITECTURE -.->|references| T_01_OVERVIEW_AND_ADVANTAGES
    T_ARCHITECTURE -.->|references| T_02_CORE_CONCEPTS
    T_ARCHITECTURE -.->|references| T_04_INTEGRATION_GUIDE
    T_ARCHITECTURE -.->|references| T_05_API_REFERENCE
    T_ARCHITECTURE -.->|references| T_DOMAIN_MODEL
    T_ARCHITECTURE -.->|references| T_SETUP_AND_WORKFLOW
    T_ARCHITECTURE -.->|references| T_LICENSE
    T_DOMAIN_MODEL -.->|references| T_ARCHITECTURE
    T_DOMAIN_MODEL -.->|references| T_02_CORE_CONCEPTS
    T_DOMAIN_MODEL -.->|references| T_05_API_REFERENCE
    T_SETUP_AND_WORKFLOW -.->|references| T_ARCHITECTURE
    T_SETUP_AND_WORKFLOW -.->|references| T_DOMAIN_MODEL
    T_SETUP_AND_WORKFLOW -.->|references| T_04_INTEGRATION_GUIDE
    T_SETUP_AND_WORKFLOW -.->|references| T_05_API_REFERENCE
    T_SETUP_AND_WORKFLOW -.->|references| T_LICENSE
```

---

## Articles

- **[Overview & Key Advantages](./topic--01-overview-and-advantages.md)** (topic) `01-overview-and-advantages`, `overview`, `websocket`, `transport`
- **[Core Concepts](./topic--02-core-concepts.md)** (topic) `02-core-concepts`, `frames`, `addressing`, `heartbeat`, `reconnect`, `auth`
- **[Architecture & Wiring](./topic--03-architecture-and-wiring.md)** (topic) `03-architecture-and-wiring`, `sequence`, `bridge`, `session`, `rpc`, `pubsub`
- **[Integration Guide](./topic--04-integration-guide.md)** (topic) `04-integration-guide`, `install`, `fastify`, `websocket`, `bridge`, `testing`
- **[API Reference](./topic--05-api-reference.md)** (topic) `05-api-reference`, `api`, `client`, `server`, `protocol`, `types`
- **[Along Protocol Reference](./topic--along-protocol.md)** (reference) `protocol`, `agents-md`, `checklist`, `routing`, `concurrency`, `along-team`, `conventions`
- **[Architecture](./topic--architecture.md)** (topic) `architecture`
- **[Domain Model](./topic--domain-model.md)** (topic) `domain-model`, `frames`, `protocol`, `contracts`
- **[License](./topic--license.md)** (license) `license`, `mit`
- **[Setup And Workflow](./topic--setup-and-workflow.md)** (topic) `setup-and-workflow`, `build`, `test`, `docs`, `monorepo`

---

## Related Context

- [AGENTS.md](../AGENTS.md): Active protocol conventions and rules.
- [Decisions (ADRs)](./decisions/INDEX.md): Architectural Decision Records.
- [Domain Model & Entity Ecosystem](./topic--domain-model.md): Specifications for active issues and project history.
