# MCP Prompts Quick Reference

## What Are MCP Prompts?

MCP Prompts are **on-demand workflow guides** that AI agents can invoke when they need step-by-step instructions for complex operations.

## Context Cost Comparison

```
┌─────────────────┬──────────────┬─────────────────────────┐
│ Feature         │ Context Cost │ When Loaded             │
├─────────────────┼──────────────┼─────────────────────────┤
│ Tools           │ ~20KB        │ Always in context       │
│ Resources       │ 0KB          │ Only when fetched       │
│ Prompts         │ 0KB          │ Only when invoked       │
└─────────────────┴──────────────┴─────────────────────────┘
```

## Available Prompts by Server

### dbm-mcp (3 prompts)

| Prompt | Description | Key Arguments |
|--------|-------------|---------------|
| `tool_schema_exploration_workflow` | Discover DBM tools, resources, and capabilities | _(none)_ |
| `custom_query_workflow` | Build and execute custom Bid Manager reports | `reportType`, `timeRange` |
| `troubleshoot_report` | Diagnose report execution failures and data issues | `queryId` (optional) |

### dv360-mcp (4 prompts)

| Prompt | Description | Key Arguments |
|--------|-------------|---------------|
| `full_campaign_setup_workflow` | Complete campaign creation (Campaign → IO → Line Items → Targeting) | `advertiserId` (required), `includeTargeting` (optional) |
| `entity_update_execution_workflow` | Schema-first entity update with updateMask discipline | `entityType`, `advertiserId` |
| `troubleshoot_underdelivery` | Diagnose and remediate underdelivering campaigns/line items | `advertiserId`, `entityId` (optional) |
| `budget_reallocation_workflow` | Analyze and redistribute budgets across IOs and line items | `advertiserId` |

### ttd-mcp (4 prompts)

| Prompt | Description | Key Arguments |
|--------|-------------|---------------|
| `ttd_campaign_setup_workflow` | Complete TTD campaign creation (Campaign → Ad Group → Ad → Creative) | `advertiserId` (required) |
| `ttd_report_generation_workflow` | Build and execute TTD MyReports V3 async reports | `advertiserIds` |
| `ttd_troubleshoot_entity` | Diagnose misconfigured or rejected TTD entities | `entityType`, `entityId` |
| `ttd_tool_schema_exploration` | Discover TTD tools, resources, and capabilities | _(none)_ |

### gads-mcp (4 prompts)

| Prompt | Description | Key Arguments |
|--------|-------------|---------------|
| `gads_campaign_setup_workflow` | Complete Google Ads campaign creation with entity hierarchy | `customerId` (required) |
| `gads_tool_schema_exploration` | Discover Google Ads tools, GAQL syntax, and capabilities | _(none)_ |
| `gads_troubleshoot_entity` | Diagnose Google Ads entity issues and policy violations | `entityType`, `customerId` |
| `gaql_reporting_workflow` | Build and execute GAQL-based reporting queries | `customerId` |

## When to Use Prompts

### Use Prompts For:

- **Multi-step workflows** requiring specific ordering
  - Example: Campaign → IO → Line Items (must be sequential)

- **Platform-specific quirks** that AI agents might not know
  - Example: DV360 campaigns can't be DRAFT, but IOs must be DRAFT

- **Validation gates** between workflow steps
  - Example: "Save campaignId from Step 2 for use in Step 3"

- **Complex troubleshooting** sequences
  - Example: "If error X, check Y, then try Z"

### Don't Use Prompts For:

- **Simple operations** - Tool description is sufficient
  - Example: "Get a single entity" - just use `get_entity` tool

- **Reference documentation** - Use MCP Resources instead
  - Example: "What fields does Campaign have?" → `entity-schema://campaign`

- **Operations AI can figure out** from tool descriptions alone
  - Example: "List all campaigns" - obvious from `list_entities` tool

## Recommended Prompts to Add

Based on common workflows not yet covered:

1. **`entity_activation_workflow`** (dv360-mcp)
   - Safe activation sequence (IO → Line Items → Campaign)
   - Budget validation gates

2. **`targeting_discovery_workflow`** (dv360-mcp)
   - Finding valid targetingOptionIds
   - Building complex targeting logic

3. **`ttd_bulk_operations_workflow`** (ttd-mcp)
   - Batch create/update/archive with safety checks

4. **`gads_bulk_operations_workflow`** (gads-mcp)
   - Batch mutate with payload sizing guidance

## Key Metrics

**Current Prompts:** 15
**Average Size:** ~8KB when invoked
**Context Cost:** 0KB when not invoked
**Build Status:** ✅ Clean

---

**Quick Links:**
- Contract: `docs/mcp-skill-contract.json`
- Workflow Mappings: `docs/client-workflow-mappings.md`
- DBM Prompts: `packages/dbm-mcp/src/mcp-server/prompts/`
- DV360 Prompts: `packages/dv360-mcp/src/mcp-server/prompts/`
- TTD Prompts: `packages/ttd-mcp/src/mcp-server/prompts/`
- Google Ads Prompts: `packages/gads-mcp/src/mcp-server/prompts/`
