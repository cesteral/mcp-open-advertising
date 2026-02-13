# MCP Microservice Topology

This document defines the target service-access pattern for BidShifter MCP servers and the near-term hardening steps for scale.

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

Use this mode when clients can manage multi-step logic and retries.

### 2) Optional Server-Side Orchestration

A dedicated orchestration service (or optimization MCP) may call multiple MCP servers internally and return one consolidated result.

Use this mode when centralized guardrails are required:

- policy enforcement
- retry/circuit-breaker behavior
- cross-server correlation and auditing

## Contract and URI Guidance

- Keep workflow IDs portable and server-agnostic.
- Continue supporting current unscoped entity resources for compatibility:
  - `entity-schema://{entityType}`
  - `entity-fields://{entityType}`
  - `entity-examples://{entityType}`
- Add namespaced aliases for future-proofing:
  - `dv360:entity-schema://{entityType}`
  - `dv360:entity-fields://{entityType}`
  - `dv360:entity-examples://{entityType}`
  - `ttd:entity-schema://{entityType}`
  - `ttd:entity-examples://{entityType}`

## Versioning and Compatibility

- Contract versioning follows semantic versioning in `docs/governance/contract-versioning.md`.
- Server runtime versions should be exposed from package metadata (not hardcoded constants).
- Breaking URI/resource changes require a major contract version and migration notes.

## Near-Term Hardening Checklist

### P0

- Align CI/CD and Terraform to deploy all three MCP servers independently.
- Keep docs and architecture diagrams consistent with actual deployable services.

### P1

- Add namespaced resource URI aliases while preserving legacy URIs.
- Standardize service compatibility metadata exposed to clients.
- Ensure per-service telemetry identity (`service.name`) and cross-server trace propagation conventions.

### P2

- Introduce optional orchestration service for complex cross-server workflows.
- Add explicit tenant/scope enforcement strategy across servers.
