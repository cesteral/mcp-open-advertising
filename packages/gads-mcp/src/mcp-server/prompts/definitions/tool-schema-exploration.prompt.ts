/**
 * Google Ads Tool and Schema Exploration Workflow Prompt
 *
 * Context-efficient capability discovery for Google Ads MCP server.
 */
import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const toolSchemaExplorationPrompt: Prompt = {
  name: "gads_tool_schema_exploration",
  description:
    "Step-by-step workflow for exploring available Google Ads MCP tools, prompts, and resources with minimal context usage",
  arguments: [
    {
      name: "objective",
      description:
        "Exploration objective (e.g., entity management, GAQL reporting, troubleshooting)",
      required: false,
    },
  ],
};

export function getToolSchemaExplorationMessage(
  args?: Record<string, string>
): string {
  const objective = args?.objective || "general capability discovery";

  return `# Google Ads Tool and Schema Exploration

## Context
- Server: gads-mcp (Google Ads)
- Objective: ${objective}

Use this workflow to discover Google Ads MCP capabilities while minimizing token usage.

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
| Create a campaign structure | Prompt: \`gads_campaign_setup_workflow\` |
| Debug an entity issue | Prompt: \`gads_troubleshoot_entity\` |
| Understand entity fields | Resource: \`entity-schema://{entityType}\` |
| See CRUD examples | Resource: \`entity-examples://{entityType}\` |
| Learn entity relationships | Resource: \`entity-hierarchy://gads\` |
| Write GAQL queries | Resource: \`gaql-reference://syntax\` |

---

## Step 3: Fetch Targeted Resources

Prefer specific resources over aggregate ones:

| Need | Fetch |
|------|-------|
| Campaign fields | \`entity-schema://campaign\` (not \`://all\`) |
| Ad group examples | \`entity-examples://adGroup\` (not \`://all\`) |
| Keyword examples | \`entity-examples://keyword\` |
| GAQL syntax | \`gaql-reference://syntax\` |

Only use \`://all\` resources when you need a cross-entity view.

---

## Step 4: Execute a Minimal Tool Call

Start with the simplest useful call:

| Action | Tool | Minimal Input |
|--------|------|---------------|
| Check an entity | \`gads_get_entity\` | \`entityType\` + \`customerId\` + \`entityId\` |
| List entities | \`gads_list_entities\` | \`entityType\` + \`customerId\` |
| Run a GAQL query | \`gads_gaql_search\` | \`customerId\` + \`query\` |
| List accounts | \`gads_list_accounts\` | _(no arguments needed)_ |

Inspect the output, then iterate with more specific calls.

---

## Available Tools Summary (11 tools)

### Read Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| \`gads_gaql_search\` | Execute GAQL queries for ad-hoc reporting | Most flexible read tool |
| \`gads_list_accounts\` | List accessible customer accounts | No arguments needed |
| \`gads_get_entity\` | Get a single entity by type/ID | Returns full entity |
| \`gads_list_entities\` | List entities with optional GAQL filters | Supports pagination |

### Write Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| \`gads_create_entity\` | Create a new entity | Returns resource name |
| \`gads_update_entity\` | Update an entity | Requires \`updateMask\` |
| \`gads_remove_entity\` | Remove an entity | Sets status to REMOVED (permanent) |
| \`gads_bulk_mutate\` | Batch create/update/remove | Up to 5000 operations |
| \`gads_bulk_update_status\` | Batch enable/pause/remove | Convenience wrapper |
| \`gads_adjust_bids\` | Batch adjust ad group bids | Safe read-modify-write |
| \`gads_validate_entity\` | Dry-run validate entity payload | Returns validation errors |

### Supported Entity Types (6)
\`campaign\`, \`adGroup\`, \`ad\`, \`keyword\`, \`campaignBudget\`, \`asset\`

---

## Context-Minimization Rules

- Summarize fetched resources in your own words instead of pasting full content
- Reuse facts from previous tool calls instead of re-fetching
- Start with one tool call, inspect results, then decide next steps
- Avoid requesting \`://all\` resources unless you need a complete overview

## Suggested Next Steps
- For campaign setup: invoke \`gads_campaign_setup_workflow\` prompt
- For debugging: invoke \`gads_troubleshoot_entity\` prompt
- For ad-hoc reporting: use \`gads_gaql_search\` directly
- For bulk operations: use \`gads_bulk_mutate\` or \`gads_bulk_update_status\`
`;
}
