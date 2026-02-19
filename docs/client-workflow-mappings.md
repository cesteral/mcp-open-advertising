# Client Workflow Mappings

This document shows how each client should consume the same canonical workflows.

## Mapping Table

| Workflow ID | Cursor | Codex | Copilot | Windsurf | Cline | Continue | Claude (MCP client) |
|---|---|---|---|---|---|---|---|
| `mcp.explore.tools_and_schemas` | `.cursor/skills/cesteral-tool-explorer/SKILL.md` | `.codex/skills/cesteral-tool-explorer/SKILL.md` | Section in `.github/copilot-instructions.md` | `.windsurf/rules/cesteral-tool-explorer.md` | `.clinerules/cesteral-tool-explorer.md` | `.continue/rules/cesteral-tool-explorer.md` | Call prompt `tool_schema_exploration_workflow`, `gads_tool_schema_exploration`, or `ttd_tool_schema_exploration` directly |
| `mcp.execute.dv360_entity_update` | `.cursor/skills/dv360-entity-updater/SKILL.md` | `.codex/skills/dv360-entity-updater/SKILL.md` | Section in `.github/copilot-instructions.md` | `.windsurf/rules/dv360-entity-updater.md` | `.clinerules/dv360-entity-updater.md` | `.continue/rules/dv360-entity-updater.md` | Call prompt `entity_update_execution_workflow` directly |
| `mcp.execute.dv360_budget_reallocation` | `.cursor/skills/dv360-budget-rebalancer/SKILL.md` | `.codex/skills/dv360-budget-rebalancer/SKILL.md` | Section in `.github/copilot-instructions.md` | `.windsurf/rules/dv360-budget-rebalancer.md` | `.clinerules/dv360-budget-rebalancer.md` | `.continue/rules/dv360-budget-rebalancer.md` | Call prompt `budget_reallocation_workflow` directly |
| `mcp.execute.ttd_entity_update` | `.cursor/skills/ttd-entity-updater/SKILL.md` | `.codex/skills/ttd-entity-updater/SKILL.md` | Section in `.github/copilot-instructions.md` | `.windsurf/rules/ttd-entity-updater.md` | `.clinerules/ttd-entity-updater.md` | `.continue/rules/ttd-entity-updater.md` | Call prompt `ttd_campaign_setup_workflow` for guided flow, or use TTD CRUD tools directly |
| `mcp.execute.ttd_campaign_setup` | `.cursor/skills/ttd-campaign-builder/SKILL.md` | `.codex/skills/ttd-campaign-builder/SKILL.md` | Section in `.github/copilot-instructions.md` | `.windsurf/rules/ttd-campaign-builder.md` | `.clinerules/ttd-campaign-builder.md` | `.continue/rules/ttd-campaign-builder.md` | Call prompt `ttd_campaign_setup_workflow` directly |
| `mcp.execute.ttd_report` | `.cursor/skills/ttd-report-builder/SKILL.md` | `.codex/skills/ttd-report-builder/SKILL.md` | Section in `.github/copilot-instructions.md` | `.windsurf/rules/ttd-report-builder.md` | `.clinerules/ttd-report-builder.md` | `.continue/rules/ttd-report-builder.md` | Call prompt `ttd_report_generation_workflow` directly |
| `mcp.troubleshoot.ttd_entity` | `.cursor/skills/ttd-troubleshooter/SKILL.md` | `.codex/skills/ttd-troubleshooter/SKILL.md` | Section in `.github/copilot-instructions.md` | `.windsurf/rules/ttd-troubleshooter.md` | `.clinerules/ttd-troubleshooter.md` | `.continue/rules/ttd-troubleshooter.md` | Call prompt `ttd_troubleshoot_entity` directly |
| `mcp.execute.dbm_custom_query` | `.cursor/skills/dbm-report-builder/SKILL.md` | `.codex/skills/dbm-report-builder/SKILL.md` | Section in `.github/copilot-instructions.md` | `.windsurf/rules/dbm-report-builder.md` | `.clinerules/dbm-report-builder.md` | `.continue/rules/dbm-report-builder.md` | Call prompt `custom_query_workflow` directly |
| `mcp.execute.gads_query` | `.cursor/skills/gads-query-builder/SKILL.md` | `.codex/skills/gads-query-builder/SKILL.md` | Section in `.github/copilot-instructions.md` | `.windsurf/rules/gads-query-builder.md` | `.clinerules/gads-query-builder.md` | `.continue/rules/gads-query-builder.md` | Call prompt `gads_tool_schema_exploration` then `gaql_reporting_workflow` |
| `mcp.execute.gads_entity_management` | `.cursor/skills/gads-entity-manager/SKILL.md` | `.codex/skills/gads-entity-manager/SKILL.md` | Section in `.github/copilot-instructions.md` | `.windsurf/rules/gads-entity-manager.md` | `.clinerules/gads-entity-manager.md` | `.continue/rules/gads-entity-manager.md` | Call `gads_campaign_setup_workflow` or `gads_troubleshoot_entity` as needed, then execute tools |
| `mcp.execute.gads_bulk_operations` | `.cursor/skills/gads-bulk-operator/SKILL.md` | `.codex/skills/gads-bulk-operator/SKILL.md` | Section in `.github/copilot-instructions.md` | `.windsurf/rules/gads-bulk-operator.md` | `.clinerules/gads-bulk-operator.md` | `.continue/rules/gads-bulk-operator.md` | Use `gads_campaign_setup_workflow` guidance and execute bulk tools with verification |
| `mcp.troubleshoot.delivery` | `.cursor/skills/dv360-delivery-troubleshooter/SKILL.md` | `.codex/skills/dv360-delivery-troubleshooter/SKILL.md` | Section in `.github/copilot-instructions.md` | `.windsurf/rules/dv360-delivery-troubleshooter.md` | `.clinerules/dv360-delivery-troubleshooter.md` | `.continue/rules/dv360-delivery-troubleshooter.md` | Call `troubleshoot_underdelivery` and/or `troubleshoot_report` |
| `mcp.improve.learnings_review` | `.cursor/skills/learnings-reviewer/SKILL.md` | `.codex/skills/learnings-reviewer/SKILL.md` | Section in `.github/copilot-instructions.md` | `.windsurf/rules/learnings-reviewer.md` | `.clinerules/learnings-reviewer.md` | `.continue/rules/learnings-reviewer.md` | Read learnings resources directly, use `submit_learning` tool |

## Supported Clients

The adapter skills in this repo are generated from canonical sources (`skills/canonical/`) to 6 provider-specific formats. Any additional skill.md-compatible client can consume them with minimal path adjustment.

| Category | Client | How It Consumes Skills |
|---|---|---|
| **MCP-native** | Claude Desktop, Open WebUI, LibreChat | Calls MCP Prompts directly — no skill adapter needed |
| **AI Agents** | Claude Code, Codex CLI, GitHub Copilot, Gemini Code Assist, Manus | Reads skill.md from project directory |
| **IDEs** | Cursor, Windsurf, Kiro, Cline/Roo Code, Continue.dev | Reads provider-specific directory (see mapping table) |
| **Infrastructure** | Vercel (`skills` CLI), Mintlify, LangChain `deepagents`, skillkit | Generates or consumes skill.md programmatically |

**Key point:** MCP Prompts are the source of truth. Skill adapters are thin routing layers that call MCP prompts/resources. Clients that support MCP natively can skip the adapter entirely and invoke prompts directly (see the "Claude (MCP client)" column in the mapping table above).

For the full ecosystem breakdown, see `docs/mcp-skill-contract.md` § "skill.md Ecosystem Support".

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

## Adding a New Provider

To add a new provider (e.g., a new IDE or AI agent):

1. Add an entry to `skills/providers.json` with the output format and paths.
2. Run `pnpm generate:skills` to generate the adapter files.
3. Run `pnpm validate:skills --check-freshness` to verify.
4. Add the provider column to the mapping table above.
