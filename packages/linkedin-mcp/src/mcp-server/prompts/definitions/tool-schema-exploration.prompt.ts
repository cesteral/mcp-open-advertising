import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const linkedInToolSchemaExplorationPrompt: Prompt = {
  name: "linkedin_tool_schema_exploration",
  description:
    "Guide for discovering and understanding LinkedIn MCP tools, resources, and schemas",
  arguments: [
    {
      name: "objective",
      description:
        "Exploration objective (e.g., campaign management, analytics, targeting, bulk operations)",
      required: false,
    },
  ],
};

export function getLinkedInToolSchemaExplorationMessage(
  args?: Record<string, string>,
): string {
  const objective = args?.objective || "general capability discovery";

  return `# LinkedIn MCP Tool & Schema Exploration Guide

## Context
- Server: linkedin-mcp (LinkedIn Ads Campaign Management)
- Objective: ${objective}

Use this workflow to discover LinkedIn MCP capabilities while minimizing token usage.

---

## Available MCP Resources

Fetch these resources for detailed schema information:

| Resource URI | Content |
|-------------|---------|
| \`entity-hierarchy://linkedin/all\` | Entity relationships, API patterns, creation order |
| \`entity-schema://adAccount\` | Ad Account fields |
| \`entity-schema://campaignGroup\` | Campaign Group fields |
| \`entity-schema://campaign\` | Campaign fields + targeting criteria |
| \`entity-schema://creative\` | Creative fields |
| \`entity-schema://conversionRule\` | Conversion Rule fields |
| \`entity-examples://all\` | All entity examples |
| \`entity-examples://{type}\` | Examples for specific type |
| \`analytics-reference://all\` | Metrics, pivots, time granularities |
| \`targeting-reference://all\` | Targeting facets and URN formats |

## Tool Categories

### Read Operations
- \`linkedin_list_ad_accounts\` — Discover accessible accounts
- \`linkedin_list_entities\` — List entities with offset pagination
- \`linkedin_get_entity\` — Get single entity by URN

### Write Operations
- \`linkedin_create_entity\` — Create entity
- \`linkedin_update_entity\` — Update entity (PATCH semantics)
- \`linkedin_delete_entity\` — Delete entity

### Analytics
- \`linkedin_get_analytics\` — Delivery metrics via /v2/adAnalytics
- \`linkedin_get_analytics_breakdowns\` — Metrics with dimensional breakdowns

### Bulk Operations
- \`linkedin_bulk_update_status\` — Batch status updates
- \`linkedin_bulk_create_entities\` — Batch creation (up to 50)
- \`linkedin_bulk_update_entities\` — Batch updates (up to 50)
- \`linkedin_adjust_bids\` — Batch adjust campaign bids

### Targeting
- \`linkedin_search_targeting\` — Search audience facets (skills, companies, locations)
- \`linkedin_get_targeting_options\` — Browse targeting categories

### Specialized
- \`linkedin_duplicate_entity\` — Copy campaign groups, campaigns, creatives
- \`linkedin_get_delivery_forecast\` — Audience/delivery forecast
- \`linkedin_get_ad_previews\` — Ad preview rendering

### Validation
- \`linkedin_validate_entity\` — Client-side entity validation

## Workflow Prompts

| Task | Prompt |
|------|--------|
| Create a full campaign structure | \`linkedin_campaign_setup_workflow\` |
| Research audiences & build targeting | \`linkedin_targeting_discovery_workflow\` |
| Update entities safely | \`linkedin_entity_update_workflow\` |
| Duplicate campaigns/groups/creatives | \`linkedin_entity_duplication_workflow\` |
| Bulk create/update/status/bids | \`linkedin_bulk_operations_workflow\` |
| Analytics & breakdowns reporting | \`linkedin_analytics_reporting_workflow\` |
| Troubleshoot entity issues | \`linkedin_troubleshoot_entity\` |

## Recommended Exploration Order

1. Start with \`linkedin_list_ad_accounts\` to find your account
2. Fetch \`entity-hierarchy://linkedin/all\` for API patterns and URN formats
3. Fetch \`entity-schema://{type}\` for field details
4. Fetch \`entity-examples://{type}\` for payload templates
`;
}
