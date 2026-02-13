---
name: mcp-tool-explorer
description: Explore MCP tools, prompts, and resources with minimal context usage. Use when discovering capabilities, planning schema lookups, or narrowing which tool/resource to call first.
---

# MCP Tool Explorer

Workflow ID: `mcp.explore.tools_and_schemas`

## Use When

- You need to discover available MCP capabilities.
- You are unsure which prompt/resource/tool to call.
- You want to minimize context bloat during exploration.

## Steps

1. List capabilities:
   - `tools/list`
   - `prompts/list`
   - `resources/list`
2. Invoke prompt:
   - `tool_schema_exploration_workflow`
3. Fetch only scoped resources first:
   - `filter-types://category/{slug}`
   - `metric-types://category/{slug}`
4. Fetch `://all` resources only if scoped resources are insufficient.

## Required Output Sections

- `Scope`
- `SelectedResources`
- `NextToolCall`

## Constraints

- Do not paste full schema/resource blobs into chat unless requested.
- Prefer concise text summaries and structured outputs.
- Keep recommendations to one smallest-viable next action.
