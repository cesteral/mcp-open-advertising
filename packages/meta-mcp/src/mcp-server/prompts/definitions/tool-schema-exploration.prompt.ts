import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const toolSchemaExplorationPrompt: Prompt = {
  name: "meta_tool_schema_exploration",
  description:
    "Guide for discovering and understanding Meta MCP tools, resources, and schemas",
  arguments: [
    {
      name: "objective",
      description:
        "Exploration objective (e.g., campaign management, insights, targeting, bulk operations)",
      required: false,
    },
  ],
};

export function getToolSchemaExplorationMessage(
  args?: Record<string, string>
): string {
  const objective = args?.objective || "general capability discovery";
  return `# Meta MCP Tool & Schema Exploration Guide

## Context
- Server: meta-mcp (Meta Ads Campaign Management)
- Objective: ${objective}

Use this workflow to discover Meta MCP capabilities while minimizing token usage.

---

## Available MCP Resources

Fetch these resources for detailed schema information:

| Resource URI | Content |
|-------------|---------|
| \`entity-hierarchy://all\` | Entity relationships, API patterns, creation order |
| \`entity-schema://all\` | All entity field schemas |
| \`entity-schema://campaign\` | Campaign fields |
| \`entity-schema://adSet\` | Ad Set fields + targeting spec |
| \`entity-schema://ad\` | Ad fields |
| \`entity-schema://adCreative\` | Creative fields |
| \`entity-schema://customAudience\` | Custom Audience fields |
| \`entity-examples://all\` | All entity examples |
| \`entity-examples://{type}\` | Examples for specific type |
| \`insights-reference://all\` | Metrics, breakdowns, date presets |
| \`targeting-reference://all\` | Targeting spec structure |

## Tool Categories

### Read Operations
- \`meta_list_ad_accounts\` — Discover accessible accounts
- \`meta_list_entities\` — List entities with filters
- \`meta_get_entity\` — Get single entity

### Write Operations
- \`meta_create_entity\` — Create entity
- \`meta_update_entity\` — Update entity (PATCH semantics)
- \`meta_delete_entity\` — Delete entity

### Insights
- \`meta_get_insights\` — Performance metrics
- \`meta_get_insights_breakdowns\` — Metrics with dimensional breakdowns

### Bulk Operations
- \`meta_bulk_update_status\` — Batch status updates
- \`meta_bulk_create_entities\` — Batch creation
- \`meta_bulk_update_entities\` — Batch updates with individual data
- \`meta_adjust_bids\` — Batch adjust ad set bids

### Targeting
- \`meta_search_targeting\` — Search interests, locations, etc.
- \`meta_get_targeting_options\` — Browse targeting categories

### Specialized
- \`meta_duplicate_entity\` — Copy campaigns/adSets/ads
- \`meta_get_delivery_estimate\` — Audience size estimation
- \`meta_get_ad_previews\` — Ad preview HTML

### Media Uploads
- \`meta_upload_image\` — Upload image from URL to ad images library (returns imageHash)
- \`meta_upload_video\` — Upload video from URL to ad videos library (polls until ready)

### Validation
- \`meta_validate_entity\` — Client-side entity validation

## Workflow Prompts

| Task | Prompt |
|------|--------|
| Create a full campaign structure | \`meta_campaign_setup_workflow\` |
| Research audiences & build targeting | \`meta_targeting_discovery_workflow\` |
| Update entities safely | \`meta_entity_update_workflow\` |
| Duplicate campaigns/ad sets/ads | \`meta_entity_duplication_workflow\` |
| Bulk create/update/status/bids | \`meta_bulk_operations_workflow\` |
| Performance insights & breakdowns | \`meta_insights_reporting_workflow\` |
| Troubleshoot entity issues | \`meta_troubleshoot_entity\` |

## Recommended Exploration Order

1. Start with \`meta_list_ad_accounts\` to find your account
2. Fetch \`entity-hierarchy://all\` for API patterns
3. Fetch \`entity-schema://{type}\` for field details
4. Fetch \`entity-examples://{type}\` for payload templates
`;
}
