# Client Workflow Mappings

This document shows how each client should consume the same canonical workflows.

## Mapping Table

| Workflow ID | Cursor | Codex | Claude (MCP client) |
|---|---|---|---|
| `mcp.explore.tools_and_schemas` | Use `.cursor/skills/cesteral-tool-explorer/SKILL.md` adapter | Use `.codex/skills/cesteral-tool-explorer/SKILL.md` adapter | Call prompt `tool_schema_exploration_workflow` directly |
| `mcp.execute.dv360_entity_update` | Use `.cursor/skills/dv360-entity-updater/SKILL.md` adapter | Use `.codex/skills/dv360-entity-updater/SKILL.md` adapter | Call prompt `entity_update_execution_workflow` directly |
| `mcp.execute.ttd_entity_update` | Use `.cursor/skills/ttd-entity-updater/SKILL.md` adapter (tool-first until prompt is added) | Use `.codex/skills/ttd-entity-updater/SKILL.md` adapter (tool-first until prompt is added) | Use TTD CRUD tools directly with schema-first validation |
| `mcp.execute.dbm_custom_query` | Use `.cursor/skills/dbm-report-builder/SKILL.md` adapter | Use `.codex/skills/dbm-report-builder/SKILL.md` adapter | Call prompt `custom_query_workflow` directly |
| `mcp.execute.gads_query` | Use `gads_gaql_search` with `gaql-reference://syntax` and entity resources | Use `gads_gaql_search` with `gaql-reference://syntax` and entity resources | Start from prompt `gads_tool_schema_exploration`, then execute `gads_gaql_search` |
| `mcp.execute.gads_entity_management` | Use schema-first `gads_*_entity` CRUD tools with focused resources | Use schema-first `gads_*_entity` CRUD tools with focused resources | Call `gads_campaign_setup_workflow` or `gads_troubleshoot_entity` as needed, then execute tools |
| `mcp.execute.gads_bulk_operations` | Use `gads_bulk_mutate` / `gads_bulk_update_status` with batched payloads | Use `gads_bulk_mutate` / `gads_bulk_update_status` with batched payloads | Use `gads_campaign_setup_workflow` guidance and execute bulk tools with verification |
| `mcp.troubleshoot.delivery` | Use `.cursor/skills/dv360-delivery-troubleshooter/SKILL.md` adapter | Use `.codex/skills/dv360-delivery-troubleshooter/SKILL.md` adapter | Call `troubleshoot_underdelivery` and/or `troubleshoot_report` |

## Guidance

- Keep core logic in MCP prompts/resources.
- Keep adapters thin and client-specific.
- Prefer prompt + targeted resource reads over embedding long instructions.
- Preserve required output section names from `docs/mcp-skill-contract.json`.

## Onboarding Rule for New Platform Packages

Before a new platform package is considered production-ready:

1. Add canonical workflow IDs to `docs/mcp-skill-contract.json`.
2. Add mapping rows in this document for each workflow.
3. Ensure `scripts/validate-skill-adapters.mjs` includes the package in validation coverage.
