# MCP Microservice Topology

This document defines the service-access pattern for the open-source Cesteral MCP servers and how that connector fleet relates to the hosted `Cesteral Intelligence` product.

## Goals

- Keep each MCP server independently deployable and consumable as a microservice.
- Preserve a fully self-hostable OSS connector fleet.
- Enable AI clients or higher-order systems to orchestrate workflows across multiple MCP servers.
- Make the hosted product layer additive rather than a replacement for the connector architecture.

## Access Patterns

### 1) Direct Client Orchestration (Default)

Clients connect directly to one or more MCP servers:

- `dbm-mcp`
- `dv360-mcp`
- `ttd-mcp`
- `gads-mcp`
- `meta-mcp`
- `linkedin-mcp`
- `tiktok-mcp`
- `cm360-mcp`
- `sa360-mcp`
- `pinterest-mcp`
- `snapchat-mcp`
- `amazon-dsp-mcp`
- `msads-mcp`

Use this mode when clients can manage multi-step logic and retries.

### 2) Hosted Product Orchestration

`Cesteral Intelligence` may call multiple MCP servers internally and return one consolidated result to the hosted product experience.

Use this mode when centralized guardrails are required:

- policy enforcement
- retry/circuit-breaker behavior
- cross-server correlation and auditing
- tenant-aware connector configuration
- approval and governance workflows

At launch, this hosted-product mode is based on a **Cesteral-operated MCP fleet**. Customer-hosted MCP servers remain valid in OSS, but are out of scope for the initial hosted product surface.

## Contract and URI Guidance

- Keep workflow IDs portable and server-agnostic.

### Current Resource URIs

Each server exposes its own resource URI patterns. These diverge by platform:

| Server           | Resource URIs                                                                                                          | Notes                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `dv360-mcp`      | `entity-schema://{entityType}`, `entity-fields://{entityType}`, `entity-examples://{entityType}`                       | Dynamic entity discovery via schema introspection |
| `ttd-mcp`        | `entity-schema://{entityType}`, `entity-examples://{entityType}`, `entity-hierarchy://all`, `report-reference://all`   | Includes hierarchy and report reference resources |
| `gads-mcp`       | `entity-schema://{entityType}`, `entity-examples://{entityType}`, `entity-hierarchy://gads`, `gaql-reference://syntax` | Includes GAQL reference and entity examples       |
| `meta-mcp`       | `entity-schema://{entityType}`, `entity-examples://{entityType}`                                                       | Meta entity resources                             |
| `linkedin-mcp`   | `entity-schema://{entityType}`, `entity-examples://{entityType}`                                                       | LinkedIn entity resources                         |
| `tiktok-mcp`     | `entity-schema://{entityType}`, `entity-examples://{entityType}`                                                       | TikTok entity resources                           |
| `cm360-mcp`      | Platform-specific entity and reference resources                                                                       | CM360 schemas and examples                        |
| `sa360-mcp`      | Platform-specific entity and reporting resources                                                                       | SA360 query/reporting references                  |
| `pinterest-mcp`  | `entity-schema://{entityType}`, `entity-examples://{entityType}`                                                       | Pinterest entity resources                        |
| `snapchat-mcp`   | `entity-schema://{entityType}`, `entity-examples://{entityType}`                                                       | Snapchat entity resources                         |
| `amazon-dsp-mcp` | `entity-schema://{entityType}`, `entity-examples://{entityType}`                                                       | Amazon DSP entity resources                       |
| `msads-mcp`      | Platform-specific entity and reporting resources                                                                       | Microsoft Ads schemas and references              |
| `dbm-mcp`        | `metric-types://`, `filter-types://`, `query-examples://all`, `report-types://all`, `compatibility-rules://all`        | Reporting-oriented — no entity-schema resources   |

### Planned Namespaced URI Aliases

For future multi-server disambiguation, namespaced URI aliases are planned but **not yet implemented** — only the unscoped URIs above are currently registered:

- `dv360:entity-schema://{entityType}`
- `dv360:entity-fields://{entityType}`
- `dv360:entity-examples://{entityType}`
- `ttd:entity-schema://{entityType}`
- `ttd:entity-examples://{entityType}`
- `meta:entity-schema://{entityType}`
- `meta:entity-examples://{entityType}`

## Versioning and Compatibility

- Server runtime versions should be exposed from package metadata (not hardcoded constants).
- Breaking URI/resource changes require migration notes and versioning.

## Near-Term Hardening Checklist

### P0

- Align CI/CD and Terraform to deploy all 13 MCP servers independently.
  - **Status**: ✅ Complete — deployment coverage now includes the full 13-server fleet.
- Keep docs and architecture diagrams consistent with actual deployable services and the OSS vs hosted-product split.

### P1

- 🚧 Not started — Add namespaced resource URI aliases while preserving legacy URIs.
- 🚧 Not started — Standardize service compatibility metadata exposed to clients.
- 🚧 Not started — Ensure per-service telemetry identity (`service.name`) and cross-server trace propagation conventions.

### P2

- Standardize how `Cesteral Intelligence` interacts with the hosted MCP fleet without changing the OSS connector contract.
- Add explicit tenant/scope enforcement strategy at the hosted product layer, with lightweight connector-side authorization where needed.
