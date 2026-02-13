# Client Workflow Mappings

This document shows how each client should consume the same canonical workflows.

## Mapping Table

| Workflow ID | Cursor | Codex | Claude (MCP client) |
|---|---|---|---|
| `mcp.explore.tools_and_schemas` | Use `.cursor/skills/mcp-tool-explorer/SKILL.md` adapter | Use `.codex/skills/mcp-tool-explorer/SKILL.md` adapter | Call prompt `tool_schema_exploration_workflow` directly |
| `mcp.execute.dv360_entity_update` | Use `.cursor/skills/mcp-workflow-executor/SKILL.md` adapter | Use `.codex/skills/mcp-workflow-executor/SKILL.md` adapter | Call prompt `entity_update_execution_workflow` directly |
| `mcp.execute.ttd_entity_update` | Use `.cursor/skills/mcp-ttd-workflow-executor/SKILL.md` adapter (tool-first until prompt is added) | Use `.codex/skills/mcp-ttd-workflow-executor/SKILL.md` adapter (tool-first until prompt is added) | Use TTD CRUD tools directly with schema-first validation |
| `mcp.execute.dbm_custom_query` | Use `.cursor/skills/mcp-custom-query-executor/SKILL.md` adapter | Use `.codex/skills/mcp-custom-query-executor/SKILL.md` adapter | Call prompt `custom_query_workflow` directly |
| `mcp.troubleshoot.delivery` | Use `.cursor/skills/mcp-delivery-troubleshooter/SKILL.md` adapter | Use `.codex/skills/mcp-delivery-troubleshooter/SKILL.md` adapter | Call `troubleshoot_underdelivery` and/or `troubleshoot_report` |

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
