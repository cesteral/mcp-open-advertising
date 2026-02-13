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
      description:
        "Exploration objective (e.g., entity management, reporting, troubleshooting)",
      required: false,
    },
  ],
};

export function getToolSchemaExplorationMessage(
  args?: Record<string, string>
): string {
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

## Available Tools Summary

| Tool | Purpose | Read/Write |
|------|---------|-----------|
| \`ttd_list_entities\` | List entities with filters | Read |
| \`ttd_get_entity\` | Get a single entity | Read |
| \`ttd_create_entity\` | Create an entity | Write |
| \`ttd_update_entity\` | Update an entity (PUT) | Write |
| \`ttd_delete_entity\` | Delete an entity | Write |
| \`ttd_get_report\` | Generate and retrieve reports | Read |

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
`;
}
