# Cesteral Docs

Navigation index for the `docs/` directory. For day-to-day development, the primary reference is [`CLAUDE.md`](../CLAUDE.md) in the repo root — this folder contains supplementary design docs and guides.

> [!IMPORTANT]
> **Start here for development:** [`../CLAUDE.md`](../CLAUDE.md) covers architecture, commands, tool patterns, and everything needed to contribute.

---

## Quick Links

| Document                                                                         | Why you'd open it                              |
| -------------------------------------------------------------------------------- | ---------------------------------------------- |
| [`CLAUDE.md`](../CLAUDE.md)                                                      | Primary developer guide (repo root)            |
| [`guides/ENV-VARIABLES-GUIDE.md`](guides/ENV-VARIABLES-GUIDE.md)                 | Environment variable reference for all servers |
| [`CROSS_SERVER_CONTRACT.md`](CROSS_SERVER_CONTRACT.md)                           | Standards all management servers must follow   |
| [`guides/mcp-prompts-quick-reference.md`](guides/mcp-prompts-quick-reference.md) | Catalog of all 61 MCP prompts                  |
| [`guides/platform-mapping.md`](guides/platform-mapping.md)                       | Platform-to-package mapping and rules          |

---

## Navigation by Audience

### Developers

| Document                                                                                 | Description                                           |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| [`repository-structure.md`](repository-structure.md)                                     | Detailed repo layout guide                            |
| [`CROSS_SERVER_CONTRACT.md`](CROSS_SERVER_CONTRACT.md)                                   | Standards all management MCP servers must follow      |
| [`guides/ENV-VARIABLES-GUIDE.md`](guides/ENV-VARIABLES-GUIDE.md)                         | Environment configuration reference for all servers   |
| [`guides/platform-mapping.md`](guides/platform-mapping.md)                               | Platform-to-package mapping and naming rules          |
| [`guides/adding-a-new-server.md`](guides/adding-a-new-server.md)                         | Step-by-step guide for adding a new MCP server        |
| [`architecture/mcp-microservice-topology.md`](architecture/mcp-microservice-topology.md) | Service topology and inter-server access patterns     |

### Contributors & Feature Design

| Document                                                                                   | Description                                                   |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| [`features/mcp-prompts-implementation.md`](features/mcp-prompts-implementation.md)         | MCP Prompts design doc                                        |
| [`features/openapi-schema-extraction-spec.md`](features/openapi-schema-extraction-spec.md) | OpenAPI schema extraction spec — **PLANNED, not implemented** |
| [`guides/mcp-prompts-quick-reference.md`](guides/mcp-prompts-quick-reference.md)           | Catalog of all available MCP prompts                          |

> [!NOTE]
> [`features/openapi-schema-extraction-spec.md`](features/openapi-schema-extraction-spec.md) is a forward-looking spec and has not been implemented.

### Operations & Governance

| Document                                                                         | Description                                 |
| -------------------------------------------------------------------------------- | ------------------------------------------- |
| [`governance/GOVERNANCE-OVERVIEW.md`](governance/GOVERNANCE-OVERVIEW.md)         | Governance scope and operating model         |
| [`governance/telemetry-governance.md`](governance/telemetry-governance.md)       | Telemetry contract for tool execution spans |

### Deployment & Operations

| Document                                                                                   | Description                                           |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| [`guides/deployment-instructions.md`](guides/deployment-instructions.md)                   | Self-hosting deployment guide                         |
| [`guides/deployment-readiness-checklist.md`](guides/deployment-readiness-checklist.md)     | Pre-deployment checklist                              |
| [`guides/secret-collection-sheet.md`](guides/secret-collection-sheet.md)                   | Secret Manager values reference                       |

---
