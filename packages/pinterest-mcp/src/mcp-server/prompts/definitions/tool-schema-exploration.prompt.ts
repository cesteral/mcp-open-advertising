import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const pinterestToolSchemaExplorationPrompt: Prompt = {
  name: "pinterest_tool_schema_exploration",
  description:
    "Guide for discovering and understanding Pinterest MCP tools, resources, and schemas",
  arguments: [
    {
      name: "objective",
      description:
        "Exploration objective (e.g., campaign management, reporting, targeting, bulk operations)",
      required: false,
    },
  ],
};

export function getTiktokToolSchemaExplorationMessage(
  args?: Record<string, string>,
): string {
  const objective = args?.objective || "general capability discovery";

  return `# Pinterest MCP Tool & Schema Exploration Guide

## Context
- Server: pinterest-mcp (Pinterest Ads Campaign Management)
- Objective: ${objective}

Use this workflow to discover Pinterest MCP capabilities while minimizing token usage.

---

## Available MCP Resources

Fetch these resources for detailed schema information:

| Resource URI | Content |
|-------------|---------|
| \`entity-hierarchy://pinterest/all\` | Entity relationships, API patterns, creation order |
| \`entity-schema://pinterest/campaign\` | Campaign fields |
| \`entity-schema://pinterest/adGroup\` | Ad Group fields + targeting |
| \`entity-schema://pinterest/ad\` | Ad fields |
| \`entity-schema://pinterest/creative\` | Creative fields |
| \`entity-examples://pinterest/all\` | All entity examples |
| \`entity-examples://pinterest/{type}\` | Examples for specific type |
| \`reporting-reference://pinterest\` | Metrics, dimensions, and breakdown options |

## Tool Categories

### Read Operations
- \`pinterest_list_ad_accounts\` — List accessible advertiser accounts
- \`pinterest_list_entities\` — List entities with page pagination
- \`pinterest_get_entity\` — Get single entity by ID

### Write Operations
- \`pinterest_create_entity\` — Create entity
- \`pinterest_update_entity\` — Update entity fields
- \`pinterest_delete_entity\` — Delete entities

### Reporting (Async)
- \`pinterest_get_report\` — Submit async report and download results
- \`pinterest_get_report_breakdowns\` — Report with breakdown dimensions

### Bulk Operations
- \`pinterest_bulk_update_status\` — Batch enable/disable/delete entities
- \`pinterest_bulk_create_entities\` — Batch creation (up to 50)
- \`pinterest_bulk_update_entities\` — Batch updates (up to 50)
- \`pinterest_adjust_bids\` — Batch adjust ad group bid prices

### Targeting
- \`pinterest_search_targeting\` — Search interest categories, behaviors, demographics
- \`pinterest_get_targeting_options\` — Browse targeting categories

### Specialized
- \`pinterest_duplicate_entity\` — Copy campaigns, ad groups, ads
- \`pinterest_get_audience_estimate\` — Audience size estimation
- \`pinterest_get_ad_preview\` — Ad preview for video/image ads

### Validation
- \`pinterest_validate_entity\` — Client-side entity validation

## Workflow Prompts

| Task | Prompt |
|------|--------|
| Create a full campaign structure | \`pinterest_campaign_setup_workflow\` |
| Research audiences & build targeting | \`pinterest_targeting_discovery_workflow\` |
| Update entities safely | \`pinterest_entity_update_workflow\` |
| Duplicate campaigns/ad groups/ads | \`pinterest_entity_duplication_workflow\` |
| Bulk create/update/status/bids | \`pinterest_bulk_operations_workflow\` |
| Async reporting & breakdowns | \`pinterest_reporting_workflow\` |
| Troubleshoot entity issues | \`pinterest_troubleshoot_entity\` |

## Recommended Exploration Order

1. Start with \`pinterest_list_ad_accounts\` to find your account
2. Fetch \`entity-hierarchy://pinterest/all\` for API patterns
3. Fetch \`entity-schema://pinterest/{type}\` for field details
4. Fetch \`entity-examples://pinterest/{type}\` for payload templates
`;
}
