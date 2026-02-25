import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const toolSchemaExplorationPrompt: Prompt = {
  name: "meta_tool_schema_exploration",
  description: "Guide for discovering and understanding Meta MCP tools, resources, and schemas",
};

export function getToolSchemaExplorationMessage(): string {
  return `# Meta MCP Tool & Schema Exploration Guide

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

### Targeting
- \`meta_search_targeting\` — Search interests, locations, etc.
- \`meta_get_targeting_options\` — Browse targeting categories

### Specialized
- \`meta_duplicate_entity\` — Copy campaigns/adSets/ads
- \`meta_get_delivery_estimate\` — Audience size estimation
- \`meta_get_ad_previews\` — Ad preview HTML

## Recommended Exploration Order

1. Start with \`meta_list_ad_accounts\` to find your account
2. Fetch \`entity-hierarchy://all\` for API patterns
3. Fetch \`entity-schema://{type}\` for field details
4. Fetch \`entity-examples://{type}\` for payload templates
`;
}
