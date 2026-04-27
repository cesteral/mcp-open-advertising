// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * TTD Tool and Schema Exploration Workflow Prompt
 *
 * Context-efficient capability discovery for TTD MCP server.
 */
import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const toolSchemaExplorationPrompt: Prompt = {
  name: "ttd_tool_schema_exploration",
  description:
    "Step-by-step workflow for exploring available TTD MCP tools, prompts, and resources with minimal context usage",
  arguments: [
    {
      name: "objective",
      description: "Exploration objective (e.g., entity management, reporting, troubleshooting)",
      required: false,
    },
  ],
};

export function getToolSchemaExplorationMessage(args?: Record<string, string>): string {
  const objective = args?.objective || "general capability discovery";

  return `# TTD Tool and Schema Exploration

## Context
- Server: ttd-mcp (The Trade Desk)
- Objective: ${objective}

Use this workflow to discover TTD MCP capabilities while minimizing token usage.

---

## Step 1: List Capabilities

Run these three calls to see what's available:
1. \`tools/list\` — See all available tools
2. \`prompts/list\` — See workflow prompts
3. \`resources/list\` — See on-demand documentation resources

Do **not** fetch large resources before narrowing your scope.

---

## Step 2: Identify Your Task Path

Pick one immediate action:

| Task | Start Here |
|------|-----------|
| Create a campaign structure | Prompt: \`ttd_campaign_setup_workflow\` |
| Generate a report | Prompt: \`ttd_report_generation_workflow\` |
| Debug an entity issue | Prompt: \`ttd_troubleshoot_entity\` |
| Understand entity fields | Resource: \`entity-schema://{entityType}\` |
| See CRUD examples | Resource: \`entity-examples://{entityType}\` |
| Learn entity relationships | Resource: \`entity-hierarchy://all\` |
| Find report dimensions/metrics | Resource: \`report-reference://all\` |

---

## Step 3: Fetch Targeted Resources

Prefer specific resources over aggregate ones:

| Need | Fetch |
|------|-------|
| Campaign fields | \`entity-schema://campaign\` (not \`://all\`) |
| Ad group examples | \`entity-examples://adGroup\` (not \`://all\`) |
| Report metrics | \`report-reference://all\` (only one resource) |

Only use \`://all\` resources when you need a cross-entity view.

---

## Step 4: Execute a Minimal Tool Call

Start with the simplest useful call:

| Action | Tool | Minimal Input |
|--------|------|---------------|
| Check an entity | \`ttd_get_entity\` | \`entityType\` + \`entityId\` |
| List entities | \`ttd_list_entities\` | \`entityType\` + \`filters\` |
| Quick report | \`ttd_get_report\` | \`reportName\` + \`dateRange\` + \`advertiserIds\` |

Inspect the output, then iterate with more specific calls.

---

## Available Tools Summary (55 tools)

### Context
| Tool | Purpose | Read/Write |
|------|---------|-----------|
| \`ttd_get_context\` | Get partner IDs accessible with current credentials (cold-start) | Read |

### Workflows Utility
| Tool | Purpose | Read/Write |
|------|---------|-----------|
| \`ttd_rest_request\` | Execute generic Workflows REST requests | Read/Write |
| \`ttd_get_job_status\` | Check a standard Workflows job status | Read |
| \`ttd_get_first_party_data_job\` | Submit advertiser first-party data jobs | Write |
| \`ttd_get_third_party_data_job\` | Submit partner third-party data jobs | Write |
| \`ttd_get_campaign_version\` | Fetch a campaign's workflow version payload | Read |

### Core CRUD
| Tool | Purpose | Read/Write |
|------|---------|-----------|
| \`ttd_list_entities\` | List entities with filters | Read |
| \`ttd_get_entity\` | Get a single entity | Read |
| \`ttd_create_entity\` | Create an entity | Write |
| \`ttd_update_entity\` | Update an entity (PUT) | Write |
| \`ttd_delete_entity\` | Delete an entity | Write |
| \`ttd_validate_entity\` | Dry-run entity validation | Read/Write |

### Workflow Entity Operations
| Tool | Purpose | Read/Write |
|------|---------|-----------|
| \`ttd_create_campaign_workflow\` | Create campaigns with workflow-oriented payloads | Write |
| \`ttd_update_campaign_workflow\` | PATCH campaigns with workflow-oriented payloads | Write |
| \`ttd_create_campaigns_job\` | Submit async bulk campaign create jobs | Write |
| \`ttd_update_campaigns_job\` | Submit async bulk campaign update jobs | Write |
| \`ttd_create_ad_group_workflow\` | Create ad groups with workflow-oriented payloads | Write |
| \`ttd_update_ad_group_workflow\` | PATCH ad groups with workflow-oriented payloads | Write |
| \`ttd_create_ad_groups_job\` | Submit async bulk ad group create jobs | Write |
| \`ttd_update_ad_groups_job\` | Submit async bulk ad group update jobs | Write |

### Reporting
| Tool | Purpose | Read/Write |
|------|---------|-----------|
| \`ttd_get_report\` | Generate and retrieve reports (blocking) | Read |
| \`ttd_download_report\` | Download report CSV and return bounded views | Read |
| \`ttd_submit_report\` | Submit report without waiting (non-blocking) | Write |
| \`ttd_check_report_status\` | Check status of submitted report | Read |

### Bulk Operations
| Tool | Purpose | Read/Write |
|------|---------|-----------|
| \`ttd_bulk_create_entities\` | Batch create (campaigns/ad groups) | Write |
| \`ttd_bulk_update_entities\` | Batch update (campaigns/ad groups) | Write |
| \`ttd_bulk_update_status\` | Batch pause/resume/archive | Write |
| \`ttd_archive_entities\` | Batch archive (soft-delete) | Write |
| \`ttd_adjust_bids\` | Batch bid adjustments | Write |

### Advanced
| Tool | Purpose | Read/Write |
|------|---------|-----------|
| \`ttd_graphql_query\` | GraphQL query/mutation passthrough | Read/Write |

### GraphQL Bulk Operations
| Tool | Purpose | Read/Write |
|------|---------|-----------|
| \`ttd_graphql_query_bulk\` | Execute bulk GraphQL queries | Read |
| \`ttd_graphql_mutation_bulk\` | Execute bulk GraphQL mutations | Write |
| \`ttd_graphql_bulk_job\` | Check async bulk GraphQL job status | Read |
| \`ttd_graphql_cancel_bulk_job\` | Cancel running bulk job | Write |

### Ad Previews (1 tool)
| Tool | Purpose | Read/Write |
|------|---------|-----------|
| \`ttd_get_ad_preview\` | Get preview URL for a creative | Read |

### Report Schedule Management
| Tool | Purpose | Read/Write |
|------|---------|-----------|
| \`ttd_create_report_template\` | Create a MyReports template via GraphQL | Write |
| \`ttd_update_report_template\` | Replace an existing MyReports template via GraphQL | Write |
| \`ttd_get_report_template\` | Retrieve full MyReports template structure | Read |
| \`ttd_create_template_schedule\` | Schedule a MyReports template via GraphQL | Write |
| \`ttd_create_report_schedule\` | Create a recurring or one-time report schedule (legacy REST wrapper) | Write |
| \`ttd_update_report_schedule\` | Enable or disable a report schedule via GraphQL | Write |
| \`ttd_list_report_schedules\` | List existing report schedules | Read |
| \`ttd_get_report_schedule\` | Get a specific report schedule | Read |
| \`ttd_delete_report_schedule\` | Delete a report schedule | Write |
| \`ttd_cancel_report_execution\` | Cancel an in-progress report execution via GraphQL | Write |
| \`ttd_rerun_report_schedule\` | Trigger a fresh execution from an existing schedule | Write |
| \`ttd_get_report_executions\` | Retrieve execution history and download links | Read |
| \`ttd_list_report_templates\` | List MyReports template headers | Read |

### GQL Entity Reports
| Tool | Purpose | Read/Write |
|------|---------|-----------|
| \`ttd_execute_entity_report\` | Execute immediate entity-level report via GraphQL | Write |
| \`ttd_get_entity_report_types\` | Discover available report types for an entity | Read |
| \`ttd_list_report_types\` | List all catalog report types | Read |
| \`ttd_get_report_type_schema\` | Get columns/dimensions for a report type | Read |

### Bid Lists & Seeds
| Tool | Purpose | Read/Write |
|------|---------|-----------|
| \`ttd_manage_bid_list\` | Create/get/update a single bid list | Read/Write |
| \`ttd_bulk_manage_bid_lists\` | Batch get/update bid lists (up to 50) | Read/Write |
| \`ttd_manage_seed\` | Manage audience seeds via GraphQL | Read/Write |

### Supported REST Entity Types (5)
\`advertiser\`, \`campaign\`, \`adGroup\`, \`creative\`, \`conversionTracker\`

**GraphQL-only entities:** Ads (adGroup + creative), deals, bid lists, and publisher lists (site lists) must be managed via \`ttd_graphql_query\`.

---

## Context-Minimization Rules

- Summarize fetched resources in your own words instead of pasting full content
- Reuse facts from previous tool calls instead of re-fetching
- Start with one tool call, inspect results, then decide next steps
- Avoid requesting \`://all\` resources unless you need a complete overview

## Suggested Next Steps
- For campaign setup: invoke \`ttd_campaign_setup_workflow\` prompt
- For reporting: invoke \`ttd_report_generation_workflow\` prompt
- For debugging: invoke \`ttd_troubleshoot_entity\` prompt
- For bulk operations: use \`ttd_bulk_create_entities\` or \`ttd_bulk_update_entities\`
- For rich entity queries: use \`ttd_graphql_query\` for nested data
- For bid optimization: use \`ttd_adjust_bids\` for safe read-modify-write
`;
}
