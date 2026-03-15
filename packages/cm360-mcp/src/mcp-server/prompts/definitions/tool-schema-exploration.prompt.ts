// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const toolSchemaExplorationPrompt: Prompt = {
  name: "cm360_tool_schema_exploration",
  description: "Guide for discovering and understanding CM360 MCP tools, resources, and schemas",
  arguments: [
    {
      name: "objective",
      description: "Exploration objective (e.g., campaign management, reporting, floodlight setup)",
      required: false,
    },
  ],
};

export function getToolSchemaExplorationMessage(args?: Record<string, string>): string {
  const objective = args?.objective || "general capability discovery";
  return `# CM360 MCP Tool & Schema Exploration Guide

## Context
- Server: cm360-mcp (Campaign Manager 360 Management)
- Objective: ${objective}

Use this workflow to discover CM360 MCP capabilities while minimizing token usage.

---

## Available MCP Resources

Fetch these resources for detailed schema information:

| Resource URI | Content |
|-------------|---------|
| \`entity-hierarchy://all\` | Entity relationships, API patterns, creation order |
| \`entity-schema://all\` | All entity field schemas |
| \`entity-schema://campaign\` | Campaign fields |
| \`entity-schema://placement\` | Placement fields |
| \`entity-schema://ad\` | Ad fields |
| \`entity-schema://creative\` | Creative fields |
| \`entity-schema://site\` | Site fields |
| \`entity-schema://advertiser\` | Advertiser fields |
| \`entity-schema://floodlightActivity\` | Floodlight Activity fields |
| \`entity-schema://floodlightConfiguration\` | Floodlight Configuration fields |
| \`entity-examples://all\` | All entity examples |
| \`entity-examples://{type}\` | Examples for specific type |
| \`reporting-reference://all\` | Report types, dimensions, metrics |
| \`targeting-reference://all\` | Targeting option types |

## Tool Categories

### Account Discovery
- \`cm360_list_user_profiles\` — List accessible CM360 user profiles (discover your profileId)

### Read Operations
- \`cm360_list_entities\` — List entities with filters
- \`cm360_get_entity\` — Get single entity by ID

### Write Operations
- \`cm360_create_entity\` — Create entity
- \`cm360_update_entity\` — Update entity (PUT semantics — full object required)
- \`cm360_delete_entity\` — Delete entity (creative, floodlightActivity only)

### Reporting (Async)
- \`cm360_get_report\` — Submit report and wait for results (blocking)
- \`cm360_submit_report\` — Submit report without waiting (non-blocking)
- \`cm360_check_report_status\` — Check report execution status
- \`cm360_download_report\` — Download and parse report CSV

### Bulk Operations
- \`cm360_bulk_update_status\` — Batch status updates
- \`cm360_bulk_create_entities\` — Batch entity creation
- \`cm360_bulk_update_entities\` — Batch entity updates

### Specialized
- \`cm360_get_ad_preview\` — Ad preview URL
- \`cm360_list_targeting_options\` — Browse targeting option categories

### Validation
- \`cm360_validate_entity\` — Client-side entity validation (no API call)

## Workflow Prompts

| Task | Prompt |
|------|--------|
| Create a full campaign structure | \`cm360_campaign_setup_workflow\` |
| Update entities safely | \`cm360_entity_update_workflow\` |
| Bulk create/update/status | \`cm360_bulk_operations_workflow\` |
| Async reporting workflow | \`cm360_reporting_workflow\` |
| Troubleshoot entity issues | \`cm360_troubleshoot_entity\` |
| Targeting option discovery | \`cm360_targeting_discovery_workflow\` |
| Floodlight setup | \`cm360_floodlight_workflow\` |

## Recommended Exploration Order

1. Start with \`cm360_list_user_profiles\` to find your profileId
2. Fetch \`entity-hierarchy://all\` for entity relationships
3. Fetch \`entity-schema://{type}\` for field details
4. Fetch \`entity-examples://{type}\` for payload templates
`;
}