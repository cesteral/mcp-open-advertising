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

### dbm-mcp (5 prompts)

| Prompt | Description | Key Arguments |
|--------|-------------|---------------|
| `tool_schema_exploration_workflow` | Discover DBM tools, resources, and capabilities | _(none)_ |
| `custom_query_workflow` | Build and execute custom Bid Manager reports | `reportType`, `timeRange` |
| `troubleshoot_report` | Diagnose report execution failures and data issues | `queryId` (optional) |
| `pacing_performance_analysis_workflow` | Pacing assessment and performance deep-dive with trend analysis | `campaignId`, `advertiserId`, `focus` |
| `cross_platform_performance_comparison` | Compare performance across DV360, TTD, Google Ads, and Meta | `dateRange` |

### dv360-mcp (8 prompts)

| Prompt | Description | Key Arguments |
|--------|-------------|---------------|
| `full_campaign_setup_workflow` | Complete campaign creation (Campaign → IO → Line Items → Targeting) | `advertiserId` (required), `includeTargeting` (optional) |
| `entity_update_execution_workflow` | Schema-first entity update with updateMask discipline | `entityType`, `advertiserId` |
| `troubleshoot_underdelivery` | Diagnose and remediate underdelivering campaigns/line items | `advertiserId`, `entityId` (optional) |
| `budget_reallocation_workflow` | Analyze and redistribute budgets across IOs and line items | `advertiserId` |
| `tool_schema_exploration_workflow` | Discover DV360 tools, resources, and capabilities | _(none)_ |
| `targeting_management_workflow` | Manage targeting options: discover types, create/audit/delete assignments | `advertiserId`, `parentType`, `goal` |
| `bulk_operations_workflow` | Batch create, update, status change, and bid adjustments | `advertiserId`, `operation` |
| `cross_platform_performance_comparison` | Compare performance across DV360, TTD, Google Ads, and Meta | `dateRange` |

### ttd-mcp (5 prompts)

| Prompt | Description | Key Arguments |
|--------|-------------|---------------|
| `ttd_campaign_setup_workflow` | Complete TTD campaign creation (Campaign → Ad Group → Ad → Creative) | `advertiserId` (required) |
| `ttd_report_generation_workflow` | Build and execute TTD MyReports V3 async reports | `advertiserIds` |
| `ttd_troubleshoot_entity` | Diagnose misconfigured or rejected TTD entities | `entityType`, `entityId` |
| `ttd_tool_schema_exploration` | Discover TTD tools, resources, and capabilities | _(none)_ |
| `cross_platform_performance_comparison` | Compare performance across DV360, TTD, Google Ads, and Meta | `dateRange` |

### gads-mcp (5 prompts)

| Prompt | Description | Key Arguments |
|--------|-------------|---------------|
| `gads_campaign_setup_workflow` | Complete Google Ads campaign creation with entity hierarchy | `customerId` (required) |
| `gads_tool_schema_exploration` | Discover Google Ads tools, GAQL syntax, and capabilities | _(none)_ |
| `gads_troubleshoot_entity` | Diagnose Google Ads entity issues and policy violations | `entityType`, `customerId` |
| `gaql_reporting_workflow` | Build and execute GAQL-based reporting queries | `customerId` |
| `cross_platform_performance_comparison` | Compare performance across DV360, TTD, Google Ads, and Meta | `dateRange` |

### meta-mcp (7 prompts)

| Prompt | Description | Key Arguments |
|--------|-------------|---------------|
| `meta_campaign_setup_workflow` | Complete Meta Ads campaign creation (Campaign → Ad Set → Ad Creative → Ad) | `adAccountId` (required) |
| `meta_tool_schema_exploration` | Discover Meta MCP tools, resources, and schemas | _(none)_ |
| `meta_troubleshoot_entity` | Diagnose Meta Ads entity issues and delivery problems | `entityType`, `entityId` |
| `meta_insights_reporting_workflow` | Build and execute Meta Ads insights queries with breakdowns | `adAccountId` (required), `entityLevel` (optional) |
| `meta_entity_update_workflow` | Safe entity update with fetch-modify-verify pattern | `entityType`, `entityId` |
| `meta_bulk_operations_workflow` | Batch create, update, status change, and bid adjustments | `adAccountId`, `operation` |
| `cross_platform_performance_comparison` | Compare performance across DV360, TTD, Google Ads, and Meta | `dateRange` |

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

- **Cross-platform coordination**
  - Example: Compare performance across all platforms and reallocate budget

### Don't Use Prompts For:

- **Simple operations** - Tool description is sufficient
  - Example: "Get a single entity" - just use `get_entity` tool

- **Reference documentation** - Use MCP Resources instead
  - Example: "What fields does Campaign have?" → `entity-schema://campaign`

- **Operations AI can figure out** from tool descriptions alone
  - Example: "List all campaigns" - obvious from `list_entities` tool

## Key Metrics

**Current Prompts:** 30
**Average Size:** ~8KB when invoked
**Context Cost:** 0KB when not invoked
**Build Status:** ✅ Clean

---

**Quick Links:**
- DBM Prompts: `packages/dbm-mcp/src/mcp-server/prompts/`
- DV360 Prompts: `packages/dv360-mcp/src/mcp-server/prompts/`
- TTD Prompts: `packages/ttd-mcp/src/mcp-server/prompts/`
- Google Ads Prompts: `packages/gads-mcp/src/mcp-server/prompts/`
- Meta Prompts: `packages/meta-mcp/src/mcp-server/prompts/`
