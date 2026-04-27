// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const snapchatToolSchemaExplorationPrompt: Prompt = {
  name: "snapchat_tool_schema_exploration",
  description: "Guide for discovering and understanding Snapchat MCP tools, resources, and schemas",
  arguments: [
    {
      name: "objective",
      description:
        "Exploration objective (e.g., campaign management, reporting, targeting, bulk operations)",
      required: false,
    },
  ],
};

export function getSnapchatToolSchemaExplorationMessage(args?: Record<string, string>): string {
  const objective = args?.objective || "general capability discovery";

  return `# Snapchat MCP Tool & Schema Exploration Guide

## Context
- Server: snapchat-mcp (Snapchat Ads Campaign Management)
- Objective: ${objective}

Use this workflow to discover Snapchat MCP capabilities while minimizing token usage.

---

## Available MCP Resources

Fetch these resources for detailed schema information:

| Resource URI | Content |
|-------------|---------|
| \`entity-hierarchy://snapchat/all\` | Entity relationships, API patterns, creation order |
| \`entity-schema://snapchat/campaign\` | Campaign fields |
| \`entity-schema://snapchat/adGroup\` | Ad Group fields + targeting |
| \`entity-schema://snapchat/ad\` | Ad fields |
| \`entity-schema://snapchat/creative\` | Creative fields |
| \`entity-examples://snapchat/all\` | All entity examples |
| \`entity-examples://snapchat/{type}\` | Examples for specific type |
| \`reporting-reference://snapchat\` | Metrics, dimensions, and breakdown options |

## Tool Categories

### Read Operations
- \`snapchat_list_ad_accounts\` — List accessible advertiser accounts
- \`snapchat_list_entities\` — List entities with page pagination
- \`snapchat_get_entity\` — Get single entity by ID

### Write Operations
- \`snapchat_create_entity\` — Create entity
- \`snapchat_update_entity\` — Update entity fields
- \`snapchat_delete_entity\` — Delete entities

### Reporting (Async)
- \`snapchat_get_report\` — Submit async report and download results
- \`snapchat_get_report_breakdowns\` — Report with breakdown dimensions

### Bulk Operations
- \`snapchat_bulk_update_status\` — Batch enable/disable/delete entities
- \`snapchat_bulk_create_entities\` — Batch creation (up to 50)
- \`snapchat_bulk_update_entities\` — Batch updates (up to 50)
- \`snapchat_adjust_bids\` — Batch adjust ad group bid prices

### Targeting
- \`snapchat_search_targeting\` — Search interest categories, behaviors, demographics
- \`snapchat_get_targeting_options\` — Browse targeting categories

### Specialized
- \`snapchat_get_audience_estimate\` — Audience size estimation
- \`snapchat_get_ad_preview\` — Ad preview for video/image ads

### Validation
- \`snapchat_validate_entity\` — Client-side entity validation

## Workflow Prompts

| Task | Prompt |
|------|--------|
| Create a full campaign structure | \`snapchat_campaign_setup_workflow\` |
| Research audiences & build targeting | \`snapchat_targeting_discovery_workflow\` |
| Update entities safely | \`snapchat_entity_update_workflow\` |
| Bulk create/update/status/bids | \`snapchat_bulk_operations_workflow\` |
| Async reporting & breakdowns | \`snapchat_reporting_workflow\` |
| Troubleshoot entity issues | \`snapchat_troubleshoot_entity\` |

## Recommended Exploration Order

1. Start with \`snapchat_list_ad_accounts\` to find your account
2. Fetch \`entity-hierarchy://snapchat/all\` for API patterns
3. Fetch \`entity-schema://snapchat/{type}\` for field details
4. Fetch \`entity-examples://snapchat/{type}\` for payload templates
`;
}
