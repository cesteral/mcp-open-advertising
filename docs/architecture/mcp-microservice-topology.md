# MCP Microservice Topology

This document defines the target service-access pattern for Cesteral MCP servers and the near-term hardening steps for scale.

## Goals

- Keep each MCP server independently deployable and consumable as a microservice.
- Enable AI clients to orchestrate workflows across multiple MCP servers in one session.
- Support optional server-side orchestration for policy-heavy, high-volume workflows.

## Access Patterns

### 1) Direct Client Orchestration (Default)

Clients connect directly to one or more MCP servers:

- `dbm-mcp`
- `dv360-mcp`
- `ttd-mcp`
- `gads-mcp`
- `meta-mcp`

Use this mode when clients can manage multi-step logic and retries.

### 2) Optional Server-Side Orchestration

A dedicated orchestration service (or optimization MCP) may call multiple MCP servers internally and return one consolidated result.

Use this mode when centralized guardrails are required:

- policy enforcement
- retry/circuit-breaker behavior
- cross-server correlation and auditing

## Contract and URI Guidance

- Keep workflow IDs portable and server-agnostic.

### Current Resource URIs

Each server exposes its own resource URI patterns. These diverge by platform:

| Server | Resource URIs | Notes |
|--------|--------------|-------|
| `dv360-mcp` | `entity-schema://{entityType}`, `entity-fields://{entityType}`, `entity-examples://{entityType}` | Dynamic entity discovery via schema introspection |
| `ttd-mcp` | `entity-schema://{entityType}`, `entity-examples://{entityType}`, `entity-hierarchy://all`, `report-reference://all` | Includes hierarchy and report reference resources |
| `gads-mcp` | `entity-schema://{entityType}`, `entity-examples://{entityType}`, `entity-hierarchy://gads`, `gaql-reference://syntax` | Includes GAQL reference and entity examples |
| `meta-mcp` | `entity-schema://{entityType}`, `entity-examples://{entityType}` | Meta entity resources |
| `dbm-mcp` | `metric-types://`, `filter-types://`, `query-examples://all`, `report-types://all`, `compatibility-rules://all` | Reporting-oriented — no entity-schema resources |

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

- Align CI/CD and Terraform to deploy all five MCP servers independently.
  - **Status**: ✅ Complete — `cloudbuild.yaml`, `cloudbuild-manual.yaml`, and Terraform now cover `dbm-mcp`, `dv360-mcp`, `ttd-mcp`, `gads-mcp`, and `meta-mcp`.
- Keep docs and architecture diagrams consistent with actual deployable services.

### P1

- Add namespaced resource URI aliases while preserving legacy URIs.
- Standardize service compatibility metadata exposed to clients.
- Ensure per-service telemetry identity (`service.name`) and cross-server trace propagation conventions.

### P2

- Introduce optional orchestration service for complex cross-server workflows.
- Add explicit tenant/scope enforcement strategy across servers.
