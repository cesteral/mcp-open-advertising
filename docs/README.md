# Cesteral Docs

Navigation index for the `docs/` directory. For day-to-day development, the primary reference is [`CLAUDE.md`](../CLAUDE.md) in the repo root — this folder contains supplementary design docs, plans, and business materials.

> [!IMPORTANT]
> **Start here for development:** [`../CLAUDE.md`](../CLAUDE.md) covers architecture, commands, tool patterns, and everything needed to contribute.

---

## Quick Links

| Document | Why you'd open it |
|---|---|
| [`CLAUDE.md`](../CLAUDE.md) | Primary developer guide (repo root) |
| [`guides/ENV-VARIABLES-GUIDE.md`](guides/ENV-VARIABLES-GUIDE.md) | Environment variable reference for all servers |
| [`CROSS_SERVER_CONTRACT.md`](CROSS_SERVER_CONTRACT.md) | Standards all management servers must follow |
| [`guides/mcp-prompts-quick-reference.md`](guides/mcp-prompts-quick-reference.md) | Catalog of all 41 MCP prompts |
| [`guides/platform-mapping.md`](guides/platform-mapping.md) | Platform-to-package mapping and rules |

---

## Navigation by Audience

### Developers

| Document | Description |
|---|---|
| [`repository-structure.md`](repository-structure.md) | Detailed repo layout guide |
| [`CROSS_SERVER_CONTRACT.md`](CROSS_SERVER_CONTRACT.md) | Standards all management MCP servers must follow |
| [`guides/ENV-VARIABLES-GUIDE.md`](guides/ENV-VARIABLES-GUIDE.md) | Environment configuration reference for all servers |
| [`guides/platform-mapping.md`](guides/platform-mapping.md) | Platform-to-package mapping and naming rules |
| [`guides/package-template.md`](guides/package-template.md) | Scaffold template for adding a new MCP server package |
| [`architecture/mcp-microservice-topology.md`](architecture/mcp-microservice-topology.md) | Service topology and inter-server access patterns |

### Contributors & Feature Design

| Document | Description |
|---|---|
| [`PRD.md`](PRD.md) | Product Requirements Document |
| [`features/mcp-prompts-implementation.md`](features/mcp-prompts-implementation.md) | MCP Prompts design doc |
| [`features/openapi-schema-extraction-spec.md`](features/openapi-schema-extraction-spec.md) | OpenAPI schema extraction spec — **PLANNED, not implemented** |
| [`guides/mcp-prompts-quick-reference.md`](guides/mcp-prompts-quick-reference.md) | Catalog of all available MCP prompts |

> [!NOTE]
> [`features/openapi-schema-extraction-spec.md`](features/openapi-schema-extraction-spec.md) is a forward-looking spec and has not been implemented.

### Business & Licensing

| Document | Description |
|---|---|
| [`business/cesteral-licensing-strategy.md`](business/cesteral-licensing-strategy.md) | Full BSL 1.1 licensing strategy |
| [`strategy/scaling-strategy-build-vs-buy.md`](strategy/scaling-strategy-build-vs-buy.md) | Build vs Buy analysis |
| [`strategy/registry-listings-draft.md`](strategy/registry-listings-draft.md) | Draft MCP registry listings |

### Operations & Governance

| Document | Status | Description |
|---|---|---|
| [`governance/GOVERNANCE-OVERVIEW.md`](governance/GOVERNANCE-OVERVIEW.md) | ✅ Active | Governance scope and operating model |
| [`governance/telemetry-governance.md`](governance/telemetry-governance.md) | ⚠️ Partially implemented | Telemetry contract (tool spans live; evaluator spans planned) |
| [`governance/playbook-delta.schema.json`](governance/playbook-delta.schema.json) | ✅ Active | JSON schema for playbook deltas |
| [`plans/future/refinement-governance.md`](plans/future/refinement-governance.md) | ⚠️ Future | LLM-MCP refinement lifecycle (not in production) |
| [`plans/future/phased-rollout.md`](plans/future/phased-rollout.md) | ⚠️ Future | Evaluator rollout plan (not in production) |

---

## Active Plans

Implementation plans currently in progress or recently completed:

| Document | Description |
|---|---|
| [`plans/2026-02-27-bsl-public-readiness.md`](plans/2026-02-27-bsl-public-readiness.md) | BSL 1.1 public release readiness checklist |
| [`plans/archive/`](plans/archive/) | Completed plans (OTEL observability, Meta MCP, pre-deploy security fixes) |

---
