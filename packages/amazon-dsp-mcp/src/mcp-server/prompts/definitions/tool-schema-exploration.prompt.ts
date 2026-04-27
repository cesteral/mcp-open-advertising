// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const amazonDspToolSchemaExplorationPrompt: Prompt = {
  name: "amazon_dsp_tool_schema_exploration",
  description:
    "Guide for discovering and understanding AmazonDsp MCP tools, resources, and schemas",
  arguments: [
    {
      name: "objective",
      description:
        "Exploration objective (e.g., campaign management, reporting, targeting, bulk operations)",
      required: false,
    },
  ],
};

export function getAmazonDspToolSchemaExplorationMessage(args?: Record<string, string>): string {
  const objective = args?.objective || "general capability discovery";

  return `# AmazonDsp MCP Tool & Schema Exploration Guide

## Context
- Server: amazon-dsp-mcp (AmazonDsp Ads Campaign Management)
- Objective: ${objective}

Use this workflow to discover AmazonDsp MCP capabilities while minimizing token usage.

---

## Available MCP Resources

Fetch these resources for detailed schema information:

| Resource URI | Content |
|-------------|---------|
| \`entity-hierarchy://amazonDsp/all\` | Entity relationships, API patterns, creation order |
| \`entity-schema://amazonDsp/campaign\` | Campaign fields |
| \`entity-schema://amazonDsp/adGroup\` | Ad Group fields + targeting |
| \`entity-schema://amazonDsp/ad\` | Ad fields |
| \`entity-schema://amazonDsp/creative\` | Creative fields |
| \`entity-examples://amazonDsp/all\` | All entity examples |
| \`entity-examples://amazonDsp/{type}\` | Examples for specific type |
| \`reporting-reference://amazonDsp\` | Metrics, dimensions, and breakdown options |

## Tool Categories

### Read Operations
- \`amazon_dsp_list_advertisers\` — List accessible advertiser accounts
- \`amazon_dsp_list_entities\` — List entities with page pagination
- \`amazon_dsp_get_entity\` — Get single entity by ID

### Write Operations
- \`amazon_dsp_create_entity\` — Create entity
- \`amazon_dsp_update_entity\` — Update entity fields
- \`amazon_dsp_delete_entity\` — Delete entities

### Reporting (Async)
- \`amazon_dsp_get_report\` — Submit async report and download results
- \`amazon_dsp_get_report_breakdowns\` — Report with breakdown dimensions

### Bulk Operations
- \`amazon_dsp_bulk_update_status\` — Batch enable/disable/delete entities
- \`amazon_dsp_bulk_create_entities\` — Batch creation (up to 50)
- \`amazon_dsp_bulk_update_entities\` — Batch updates (up to 50)
- \`amazon_dsp_adjust_bids\` — Batch adjust ad group bid prices

### Targeting
- \`amazon_dsp_search_targeting\` — Search interest categories, behaviors, demographics
- \`amazon_dsp_get_targeting_options\` — Browse targeting categories

### Specialized
- \`amazon_dsp_duplicate_entity\` — Copy campaigns, ad groups, ads
- \`amazon_dsp_get_audience_estimate\` — Audience size estimation
- \`amazon_dsp_get_ad_preview\` — Ad preview for video/image ads

### Validation
- \`amazon_dsp_validate_entity\` — Client-side entity validation

## Workflow Prompts

| Task | Prompt |
|------|--------|
| Create a full campaign structure | \`amazon_dsp_campaign_setup_workflow\` |
| Research audiences & build targeting | \`amazon_dsp_targeting_discovery_workflow\` |
| Update entities safely | \`amazon_dsp_entity_update_workflow\` |
| Duplicate campaigns/ad groups/ads | \`amazon_dsp_entity_duplication_workflow\` |
| Bulk create/update/status/bids | \`amazon_dsp_bulk_operations_workflow\` |
| Async reporting & breakdowns | \`amazon_dsp_reporting_workflow\` |
| Troubleshoot entity issues | \`amazon_dsp_troubleshoot_entity\` |

## Recommended Exploration Order

1. Start with \`amazon_dsp_list_advertisers\` to find your account
2. Fetch \`entity-hierarchy://amazonDsp/all\` for API patterns
3. Fetch \`entity-schema://amazonDsp/{type}\` for field details
4. Fetch \`entity-examples://amazonDsp/{type}\` for payload templates
`;
}
