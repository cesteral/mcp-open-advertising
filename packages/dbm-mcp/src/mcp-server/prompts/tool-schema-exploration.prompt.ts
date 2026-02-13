/**
 * Tool and Schema Exploration Workflow Prompt
 *
 * Portable exploration workflow for discovering tools, prompts, and resources
 * while keeping context usage low.
 */
import type { Prompt } from "./types.js";

export const toolSchemaExplorationPrompt: Prompt = {
  name: "tool_schema_exploration_workflow",
  description:
    "Step-by-step workflow for exploring available MCP tools, prompts, and resources with minimal context usage.",
  arguments: [
    {
      name: "serverFocus",
      description:
        "Server to focus on: dbm-mcp, dv360-mcp, or both (default: both)",
      required: false,
    },
    {
      name: "objective",
      description:
        "Exploration objective (e.g. query planning, entity schema lookup, troubleshooting)",
      required: false,
    },
  ],
};

export function getToolSchemaExplorationMessage(args?: Record<string, string>): string {
  const serverFocus = args?.serverFocus || "both";
  const objective = args?.objective || "tool and schema discovery";

  return `# Tool and Schema Exploration Workflow

## Context
- Focus: ${serverFocus}
- Objective: ${objective}

Use this workflow to discover capabilities while minimizing token/context bloat.

## Step 1: List capabilities first
1. Call \`tools/list\`
2. Call \`prompts/list\`
3. Call \`resources/list\`

Do not fetch large resources before narrowing scope.

## Step 2: Narrow to one task path
Pick one immediate action:
- Build a custom reporting query
- Inspect DV360 entity schema/update fields
- Troubleshoot delivery/performance

## Step 3: Fetch only targeted resources
Prefer smallest resources first:
- For filters: \`filter-types://category/{slug}\`
- For metrics: \`metric-types://category/{slug}\`
- Use \`://all\` resources only when needed
- For DV360 entities: \`entity-schema://{entityType}\`, \`entity-fields://{entityType}\`, \`entity-examples://{entityType}\`

## Step 4: Validate compatibility before execution
- Confirm reportType/filter/metric compatibility via \`compatibility-rules://all\`
- Confirm DV360 updateMask fields via \`entity-fields://{entityType}\`

## Step 5: Execute one smallest-viable tool call
Start with one call, inspect output, then iterate.

## Context-minimization rules
- Keep text summaries concise; rely on structured output where available
- Avoid copying full JSON into chat unless requested
- Reuse fetched resource facts instead of re-fetching full docs

## Suggested next prompt
- For reporting query construction: \`custom_query_workflow\`
- For reporting troubleshooting: \`troubleshoot_report\`
- For DV360 budget/campaign setup: use corresponding dv360-mcp prompts
`;
}
