// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const tiktokToolSchemaExplorationPrompt: Prompt = {
  name: "tiktok_tool_schema_exploration",
  description: "Guide for discovering and understanding TikTok MCP tools, resources, and schemas",
  arguments: [
    {
      name: "objective",
      description:
        "Exploration objective (e.g., campaign management, reporting, targeting, bulk operations)",
      required: false,
    },
  ],
};

export function getTiktokToolSchemaExplorationMessage(args?: Record<string, string>): string {
  const objective = args?.objective || "general capability discovery";

  return `# TikTok MCP Tool & Schema Exploration Guide

## Context
- Server: tiktok-mcp (TikTok Ads Campaign Management)
- Objective: ${objective}

Use this workflow to discover TikTok MCP capabilities while minimizing token usage.

---

## Available MCP Resources

Fetch these resources for detailed schema information:

| Resource URI | Content |
|-------------|---------|
| \`entity-hierarchy://tiktok/all\` | Entity relationships, API patterns, creation order |
| \`entity-schema://tiktok/campaign\` | Campaign fields |
| \`entity-schema://tiktok/adGroup\` | Ad Group fields + targeting |
| \`entity-schema://tiktok/ad\` | Ad fields |
| \`entity-schema://tiktok/creative\` | Creative fields |
| \`entity-examples://tiktok/all\` | All entity examples |
| \`entity-examples://tiktok/{type}\` | Examples for specific type |
| \`reporting-reference://tiktok\` | Metrics, dimensions, and breakdown options |

## Tool Categories

### Read Operations
- \`tiktok_list_advertisers\` — List accessible advertiser accounts
- \`tiktok_list_entities\` — List entities with page pagination
- \`tiktok_get_entity\` — Get single entity by ID

### Write Operations
- \`tiktok_create_entity\` — Create entity
- \`tiktok_update_entity\` — Update entity fields
- \`tiktok_delete_entity\` — Delete entities

### Reporting (Async)
- \`tiktok_get_report\` — Submit async report and download results
- \`tiktok_get_report_breakdowns\` — Report with breakdown dimensions

### Bulk Operations
- \`tiktok_bulk_update_status\` — Batch enable/disable/delete entities
- \`tiktok_bulk_create_entities\` — Batch creation (up to 50)
- \`tiktok_bulk_update_entities\` — Batch updates (up to 50)
- \`tiktok_adjust_bids\` — Batch adjust ad group bid prices

### Targeting
- \`tiktok_search_targeting\` — Search interest categories, behaviors, demographics
- \`tiktok_get_targeting_options\` — Browse targeting categories

### Specialized
- \`tiktok_duplicate_entity\` — Copy campaigns, ad groups, ads
- \`tiktok_get_audience_estimate\` — Audience size estimation
- \`tiktok_get_ad_preview\` — Ad preview for video/image ads

### Validation
- \`tiktok_validate_entity\` — Client-side entity validation

## Workflow Prompts

| Task | Prompt |
|------|--------|
| Create a full campaign structure | \`tiktok_campaign_setup_workflow\` |
| Research audiences & build targeting | \`tiktok_targeting_discovery_workflow\` |
| Update entities safely | \`tiktok_entity_update_workflow\` |
| Duplicate campaigns/ad groups/ads | \`tiktok_entity_duplication_workflow\` |
| Bulk create/update/status/bids | \`tiktok_bulk_operations_workflow\` |
| Async reporting & breakdowns | \`tiktok_reporting_workflow\` |
| Troubleshoot entity issues | \`tiktok_troubleshoot_entity\` |

## Recommended Exploration Order

1. Start with \`tiktok_list_advertisers\` to find your account
2. Fetch \`entity-hierarchy://tiktok/all\` for API patterns
3. Fetch \`entity-schema://tiktok/{type}\` for field details
4. Fetch \`entity-examples://tiktok/{type}\` for payload templates
`;
}
