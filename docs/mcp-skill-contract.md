# MCP Skill Contract

This document defines the portable contract between:
- canonical workflow IDs
- MCP prompt/resource surfaces
- client-specific skill adapters (Cursor/Codex)

The canonical machine-readable source is:
- `docs/mcp-skill-contract.json`

## Contract Rules

- Adapter skills must reference exactly one `workflowId`.
- Adapter skills must call MCP prompts/resources rather than duplicating schema docs.
- Adapter skills should stay concise (target under 200 lines).
- Required output sections must match the workflow contract.
- Package-to-workflow mappings must be declared in `platformPackages` in `docs/mcp-skill-contract.json`.

## Canonical Workflows

| Workflow ID | Purpose | Primary Prompt(s) |
|---|---|---|
| `mcp.explore.tools_and_schemas` | Discover capabilities with minimal context use | `tool_schema_exploration_workflow` (dbm-mcp) |
| `mcp.execute.dv360_entity_update` | Perform safe schema-first DV360 updates | `entity_update_execution_workflow` (dv360-mcp) |
| `mcp.execute.ttd_entity_update` | Perform safe schema-first TTD updates | currently tool-first (no canonical prompt yet) |
| `mcp.execute.dbm_custom_query` | Compose and run custom reporting queries | `custom_query_workflow` (dbm-mcp) |
| `mcp.troubleshoot.delivery` | Diagnose and fix underdelivery | `troubleshoot_underdelivery` (dv360-mcp), `troubleshoot_report` (dbm-mcp) |

## Multi-Server Access Model

- Default model: clients connect directly to one or more MCP servers and orchestrate calls client-side.
- Optional model: a dedicated orchestration service may call multiple MCP servers internally for policy-heavy workflows.
- Contract implication: workflow IDs remain server-agnostic and portable across both access models.

## Platform Package Mapping

Canonical package ownership is defined in `docs/mcp-skill-contract.json` under `platformPackages`.

- `dbm-mcp` -> `dv360-reporting`
- `dv360-mcp` -> `dv360-management`
- `ttd-mcp` -> `ttd`

Any new platform package must:

1. Add a `platformPackages` entry.
2. Declare `requiredWorkflowIds`.
3. Add client mapping rows in `docs/client-workflow-mappings.md`.

## Resource URI Conventions

- Scoped docs first:
  - `filter-types://category/{slug}`
  - `metric-types://category/{slug}`
- Full docs only when needed:
  - `filter-types://all`
  - `metric-types://all`
- DV360 schema/update resources:
  - `entity-schema://{entityType}`
  - `entity-fields://{entityType}`
  - `entity-examples://{entityType}`

### Future-safe URI Namespacing (Recommended)

To avoid ambiguity when multiple platform servers expose similar resource families, adopt namespaced URI forms in a compatible rollout:

- DV360:
  - `dv360:entity-schema://{entityType}`
  - `dv360:entity-fields://{entityType}`
  - `dv360:entity-examples://{entityType}`
- TTD:
  - `ttd:entity-schema://{entityType}`
  - `ttd:entity-examples://{entityType}`

Migration guidance:

1. Keep current unscoped URIs for compatibility.
2. Add namespaced aliases.
3. Update adapters to prefer namespaced URIs.
4. Remove unscoped URIs only in a major contract version.

## Required Output Sections by Workflow

Defined in `docs/mcp-skill-contract.json` under:
- `workflows.<workflowId>.requiredOutputSections`

Adapters should preserve section names exactly to keep cross-client behavior aligned.
