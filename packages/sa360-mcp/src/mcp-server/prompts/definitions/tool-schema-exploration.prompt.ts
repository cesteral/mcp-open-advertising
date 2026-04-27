// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const toolSchemaExplorationPrompt: Prompt = {
  name: "sa360_tool_schema_exploration",
  description: "Guide for discovering and understanding SA360 MCP tools, resources, and schemas",
  arguments: [
    {
      name: "objective",
      description:
        "Exploration objective (e.g., cross-engine reporting, conversion upload, field discovery)",
      required: false,
    },
  ],
};

export function getToolSchemaExplorationMessage(args?: Record<string, string>): string {
  const objective = args?.objective || "general capability discovery";
  return `# SA360 MCP Tool & Schema Exploration Guide

## Context
- Server: sa360-mcp (Search Ads 360 Reporting & Conversions)
- Objective: ${objective}

Use this workflow to discover SA360 MCP capabilities while minimizing token usage.

---

## Available MCP Resources

Fetch these resources for detailed schema information:

| Resource URI | Content |
|-------------|---------|
| \`entity-hierarchy://all\` | Entity relationships and account structure |
| \`entity-schema://all\` | All entity query field schemas |
| \`entity-schema://customer\` | Customer fields |
| \`entity-schema://campaign\` | Campaign fields |
| \`entity-schema://adGroup\` | Ad Group fields |
| \`entity-schema://adGroupAd\` | Ad fields |
| \`entity-schema://adGroupCriterion\` | Ad Group Criterion fields |
| \`entity-schema://campaignCriterion\` | Campaign Criterion fields |
| \`entity-schema://biddingStrategy\` | Bidding Strategy fields |
| \`entity-schema://conversionAction\` | Conversion Action fields |
| \`entity-examples://all\` | All entity query examples |
| \`entity-examples://{type}\` | Query examples for specific type |
| \`query-reference://all\` | SA360 query language syntax and operators |
| \`conversion-reference://all\` | Conversion upload payload structure and validation |
| \`insights-reference://all\` | Available metrics, segments, entity types, and date range options |

## Tool Categories

### Account Discovery
- \`sa360_list_accounts\` — List accessible SA360 customer accounts

### Read Operations
- \`sa360_search\` — Execute arbitrary SA360 query language queries
- \`sa360_get_entity\` — Get single entity by type and ID
- \`sa360_list_entities\` — List entities with query filters
- \`sa360_search_fields\` — Search available SA360 query fields
- \`sa360_list_report_columns\` — List field groups for a resource (live + static fallback)

### Insights
- \`sa360_get_insights\` — Performance insights with preset or custom date ranges
- \`sa360_get_insights_breakdowns\` — Metrics with segment breakdowns

### Async Reporting (v2 API)
- \`sa360_submit_report\` — Submit async report request (returns report ID)
- \`sa360_check_report_status\` — Poll report status until ready
- \`sa360_download_report\` — Download completed report as parsed CSV

### Custom Columns
- \`sa360_list_custom_columns\` — List custom columns for an account

### Conversion Upload (v2 API)
- \`sa360_insert_conversions\` — Insert offline conversions
- \`sa360_update_conversions\` — Update existing conversions

### Validation
- \`sa360_validate_conversion\` — Validate conversion payload (no API call)

### Audit
- \`sa360_get_change_history\` — Get change history for SA360 entities

## Workflow Prompts

| Task | Prompt |
|------|--------|
| Write SA360 queries | \`sa360_query_language_workflow\` |
| Upload offline conversions | \`sa360_conversion_upload_workflow\` |
| Cross-engine reporting | \`sa360_cross_engine_reporting_workflow\` |
| Troubleshoot issues | \`sa360_troubleshoot_entity\` |

## Recommended Exploration Order

1. Start with \`sa360_list_accounts\` to discover accessible accounts
2. Use \`sa360_search_fields\` to explore available query fields
3. Fetch \`query-reference://all\` for query language syntax
4. Fetch \`entity-schema://{type}\` for entity field details
5. Use \`sa360_search\` for flexible queries
`;
}
