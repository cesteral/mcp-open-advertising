/**
 * DV360 Tool and Schema Exploration Workflow Prompt
 *
 * Context-efficient capability discovery for DV360 MCP server.
 */
import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const toolSchemaExplorationPrompt: Prompt = {
  name: "dv360_tool_schema_exploration",
  description:
    "Step-by-step workflow for exploring available DV360 MCP tools, prompts, and resources with minimal context usage",
  arguments: [
    {
      name: "objective",
      description:
        "Exploration objective (e.g., entity management, custom bidding, targeting, troubleshooting)",
      required: false,
    },
  ],
};

export function getToolSchemaExplorationMessage(
  args?: Record<string, string>
): string {
  const objective = args?.objective || "general capability discovery";

  return `# DV360 Tool and Schema Exploration

## Context
- Server: dv360-mcp (DV360 Campaign Management)
- Objective: ${objective}

Use this workflow to discover DV360 MCP capabilities while minimizing token usage.

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
| Create a full campaign structure | Prompt: \`full_campaign_setup_workflow\` |
| Troubleshoot underdelivery | Prompt: \`troubleshoot_underdelivery\` |
| Reallocate budgets | Prompt: \`budget_reallocation_workflow\` |
| Update entities safely | Prompt: \`entity_update_execution_workflow\` |
| Set up custom bidding | Prompt: \`custom_bidding_workflow\` |
| Understand entity fields | Resource: \`entity-schema://{entityType}\` |
| See CRUD examples | Resource: \`entity-examples://{entityType}\` |
| List updateMask field paths | Resource: \`entity-fields://{entityType}\` |

---

## Step 3: Fetch Targeted Resources

Prefer specific resources over aggregate ones:

| Need | Fetch |
|------|-------|
| Line item fields | \`entity-schema://lineItem\` (not \`://all\`) |
| IO examples | \`entity-examples://insertionOrder\` (not \`://all\`) |
| Campaign fields | \`entity-fields://campaign\` |
| Targeting options | \`entity-schema://assignedTargetingOption\` |

Only use \`://all\` resources when you need a cross-entity view.

---

## Step 4: Execute a Minimal Tool Call

Start with the simplest useful call:

| Action | Tool | Minimal Input |
|--------|------|---------------|
| Check an entity | \`dv360_get_entity\` | \`entityType\` + IDs |
| List entities | \`dv360_list_entities\` | \`entityType\` + \`advertiserId\` |
| Check targeting | \`dv360_list_assigned_targeting\` | \`entityType\` + IDs |
| Adjust bids | \`dv360_adjust_line_item_bids\` | \`advertiserId\` + \`adjustments\` |

Inspect the output, then iterate with more specific calls.

---

## Available Tools Summary (19 tools)

### Entity CRUD (9 tools)
| Tool | Purpose | Notes |
|------|---------|-------|
| \`dv360_list_entities\` | List entities with filters/paging | Supports all entity types |
| \`dv360_get_entity\` | Get a single entity by type/ID | Returns full entity |
| \`dv360_create_entity\` | Create any supported entity | Uses elicitation for missing fields |
| \`dv360_update_entity\` | Update entity with updateMask | Requires \`updateMask\` |
| \`dv360_delete_entity\` | Delete an entity | Permanent operation |
| \`dv360_adjust_line_item_bids\` | Batch adjust bids | Safe read-modify-write |
| \`dv360_bulk_update_status\` | Batch status updates | Enable/pause/archive |
| \`dv360_bulk_create_entities\` | Batch create up to 50 entities | Partial success model |
| \`dv360_bulk_update_entities\` | Batch update up to 50 entities | Requires \`updateMask\` per item |

### Custom Bidding (4 tools)
| Tool | Purpose | Notes |
|------|---------|-------|
| \`dv360_create_custom_bidding_algorithm\` | Create algorithm | Requires advertiser context |
| \`dv360_manage_custom_bidding_script\` | Upload/manage scripts | Script content as input |
| \`dv360_manage_custom_bidding_rules\` | Manage bidding rules | Rule configuration |
| \`dv360_list_custom_bidding_algorithms\` | List algorithms | Filter by advertiser |

### Targeting (5 tools)
| Tool | Purpose | Notes |
|------|---------|-------|
| \`dv360_list_assigned_targeting\` | List targeting assignments | For any entity type |
| \`dv360_get_assigned_targeting\` | Get specific assignment | By targeting type |
| \`dv360_create_assigned_targeting\` | Create targeting | Assign to entity |
| \`dv360_delete_assigned_targeting\` | Remove targeting | By targeting type |
| \`dv360_validate_targeting_config\` | Validate config | Dry-run check |

### Validation (1 tool)
| Tool | Purpose | Notes |
|------|---------|-------|
| \`dv360_validate_entity\` | Client-side schema validation | No API call, readOnly |

---

## Context-Minimization Rules

- Summarize fetched resources in your own words instead of pasting full content
- Reuse facts from previous tool calls instead of re-fetching
- Start with one tool call, inspect results, then decide next steps
- Avoid requesting \`://all\` resources unless you need a complete overview

## Suggested Next Steps
- For campaign setup: invoke \`full_campaign_setup_workflow\` prompt
- For troubleshooting: invoke \`troubleshoot_underdelivery\` prompt
- For budget work: invoke \`budget_reallocation_workflow\` prompt
- For entity updates: invoke \`entity_update_execution_workflow\` prompt
- For targeting: invoke \`targeting_management_workflow\` prompt
- For custom bidding: invoke \`custom_bidding_workflow\` prompt
`;
}
