# MCP Skill Contract

This document defines the portable contract between:
- canonical workflow IDs
- MCP prompt/resource surfaces
- client-specific skill adapters (Cursor, Codex, and any skill.md-compatible client)

The canonical machine-readable source is:
- `docs/mcp-skill-contract.json`

## Contract Rules

- Adapter skills must reference exactly one `workflowId`.
- Adapter skills must call MCP prompts/resources rather than duplicating schema docs.
- Adapter skills should stay concise (target under 200 lines).
- Required output sections must match the workflow contract.
- Package-to-workflow mappings must be declared in `platformPackages` in `docs/mcp-skill-contract.json`.

## Design Decision: MCP Prompts as Source of Truth

MCP Prompts are the canonical home for workflow guidance in this repo. Skill adapters are a thin complementary layer, not a replacement.

**Why MCP Prompts stay:**

- **Protocol-level discoverability** — any MCP client can call `prompts/list` and `prompts/get` without knowing about skill.md files. This covers Claude Desktop, Open WebUI, LibreChat, and every other standards-compliant MCP host.
- **Zero vendor lock-in** — the MCP spec is an open standard. Workflow guidance encoded as MCP Prompts is portable to any conformant client today and in the future.
- **On-demand context cost** — prompts add 0KB baseline context. They are only loaded when an agent explicitly invokes them (see `docs/mcp-prompts-implementation.md` for the cost analysis).

**Where skill adapters add value:**

- **Client-native UX** — skill-aware clients (Cursor, Codex, Claude Code, etc.) can surface workflows in their own UI without requiring MCP prompt support.
- **Cross-server orchestration** — workflows like `mcp.troubleshoot.delivery` span multiple MCP servers. A skill adapter can orchestrate calls to both `dbm-mcp` and `dv360-mcp` in a single instruction set, while each server's MCP Prompts only cover their own scope.
- **Ecosystem breadth** — skill.md is understood by a wide range of AI agents and IDEs (see next section), making adapters portable across most of the developer tooling landscape.

**Contract rule:** adapter skills must call MCP prompts/resources rather than duplicating their content. The prompt is the source of truth; the adapter is a thin routing layer.

## skill.md Ecosystem Support

The skill.md format has broad adoption across AI agents, IDEs, and infrastructure tooling. Adapter skills are generated from canonical sources in `skills/canonical/` to 6 providers via `pnpm generate:skills`.

### AI Agents & Platforms

| Platform | skill.md Support | Notes |
|---|---|---|
| **Anthropic** (Claude Code, Claude API) | Native | `CLAUDE.md` + skill files in project root |
| **OpenAI** (Codex CLI, Responses API, ChatGPT) | Via agentskills.io / `.codex/skills/` | Codex CLI reads `.codex/skills/` natively |
| **GitHub Copilot** | Via `.github/copilot-instructions.md` + skill files | Copilot Chat and Workspace respect project-level instructions |
| **Google Gemini** | Via project context / `GEMINI.md` | Gemini Code Assist reads project instructions |
| **Manus** | Native skill.md consumption | Agent platform with built-in skill discovery |

### IDEs & Editors

| IDE | skill.md Location | Notes |
|---|---|---|
| **Cursor** | `.cursor/skills/` | First-class support; skills appear in agent context |
| **Windsurf** | `.windsurfrules` + skill files | Codeium's IDE reads project rules and skill docs |
| **Kiro** | Project-level instruction files | AWS-backed IDE with agent skill support |
| **Cline / Roo Code** | `.clinerules` + skill files | VS Code extensions with skill-aware agents |

### Infrastructure & Frameworks

| Tool | Integration | Notes |
|---|---|---|
| **Vercel** | `skills` CLI command | Auto-generates skill.md from project structure |
| **Mintlify** | Auto-generation from docs | Converts API docs into skill.md format |
| **LangChain** (`deepagents`) | Skill-based agent orchestration | Uses skill.md as agent capability definitions |
| **skillkit** | Local model support (Ollama) | Runs skill.md workflows on local LLMs |

### Actively Generated Providers

| Provider | Format | Output Location | Status |
|---|---|---|---|
| **Cursor** | skill-per-directory | `.cursor/skills/{name}/SKILL.md` | Generated |
| **Codex** | skill-per-directory | `.codex/skills/{name}/SKILL.md` | Generated |
| **GitHub Copilot** | single-concatenated | `.github/copilot-instructions.md` | Generated |
| **Windsurf** | file-per-skill | `.windsurf/rules/{name}.md` | Generated |
| **Cline / Roo Code** | file-per-skill | `.clinerules/{name}.md` | Generated |
| **Continue.dev** | file-per-skill | `.continue/rules/{name}.md` | Generated |

All 6 providers are generated from `skills/canonical/` via `pnpm generate:skills`. The provider registry at `skills/providers.json` defines the output format and paths for each provider. Adding a new provider requires only a single entry in the registry.

The MCP Prompts underneath remain the single source of truth regardless of which client invokes the workflow.

## Canonical Workflows

| Workflow ID | Purpose | Primary Prompt(s) |
|---|---|---|
| `mcp.explore.tools_and_schemas` | Discover capabilities with minimal context use | `tool_schema_exploration_workflow` (dbm-mcp), `gads_tool_schema_exploration` (gads-mcp), `ttd_tool_schema_exploration` (ttd-mcp), `meta_tool_schema_exploration` (meta-mcp) |
| `mcp.execute.dv360_entity_update` | Perform safe schema-first DV360 updates | `entity_update_execution_workflow` (dv360-mcp) |
| `mcp.execute.dv360_budget_reallocation` | Analyze and reallocate DV360 budgets | `budget_reallocation_workflow` (dv360-mcp) |
| `mcp.execute.ttd_entity_update` | Perform safe schema-first TTD updates | `ttd_campaign_setup_workflow` (ttd-mcp) |
| `mcp.execute.ttd_campaign_setup` | Create complete TTD campaign structures | `ttd_campaign_setup_workflow` (ttd-mcp) |
| `mcp.execute.ttd_report` | Build and execute TTD MyReports V3 reports | `ttd_report_generation_workflow` (ttd-mcp) |
| `mcp.troubleshoot.ttd_entity` | Diagnose and fix TTD entity issues | `ttd_troubleshoot_entity` (ttd-mcp) |
| `mcp.execute.dbm_custom_query` | Compose and run custom reporting queries | `custom_query_workflow` (dbm-mcp) |
| `mcp.execute.gads_query` | Build and execute GAQL reporting queries | `gaql_reporting_workflow` (gads-mcp) |
| `mcp.execute.gads_entity_management` | Safe Google Ads entity CRUD | `gads_campaign_setup_workflow` (gads-mcp) |
| `mcp.execute.gads_bulk_operations` | Batch Google Ads mutate operations | `gads_campaign_setup_workflow` (gads-mcp) |
| `mcp.troubleshoot.delivery` | Diagnose and fix underdelivery | `troubleshoot_underdelivery` (dv360-mcp), `troubleshoot_report` (dbm-mcp) |
| `mcp.execute.meta_campaign_setup` | Create complete Meta Ads campaign structures | `meta_campaign_setup_workflow` (meta-mcp) |
| `mcp.execute.meta_insights` | Build and execute Meta Ads insights queries | `meta_insights_reporting_workflow` (meta-mcp) |
| `mcp.troubleshoot.meta_entity` | Diagnose and fix Meta Ads entity issues | `meta_troubleshoot_entity` (meta-mcp) |

## Multi-Server Access Model

- Default model: clients connect directly to one or more MCP servers and orchestrate calls client-side.
- Optional model: a dedicated orchestration service may call multiple MCP servers internally for policy-heavy workflows.
- Contract implication: workflow IDs remain server-agnostic and portable across both access models.

## Platform Package Mapping

Canonical package ownership is defined in `docs/mcp-skill-contract.json` under `platformPackages`.

- `dbm-mcp` -> `dv360-reporting`
- `dv360-mcp` -> `dv360-management`
- `ttd-mcp` -> `ttd`
- `gads-mcp` -> `google-ads`
- `meta-mcp` -> `meta-ads`

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
- Meta:
  - `meta:entity-schema://{entityType}`
  - `meta:entity-examples://{entityType}`

Migration guidance:

1. Keep current unscoped URIs for compatibility.
2. Add namespaced aliases.
3. Update adapters to prefer namespaced URIs.
4. Remove unscoped URIs only in a major contract version.

## Required Output Sections by Workflow

Defined in `docs/mcp-skill-contract.json` under:
- `workflows.<workflowId>.requiredOutputSections`

Adapters should preserve section names exactly to keep cross-client behavior aligned.
