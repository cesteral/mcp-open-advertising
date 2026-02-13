---
name: mcp-ttd-workflow-executor
description: Execute tool-first, schema-disciplined TTD entity update workflows.
---

# MCP TTD Workflow Executor

Workflow ID: `mcp.execute.ttd_entity_update`

## Use When

- You need to create/update/delete TTD entities safely.
- No canonical prompt is available and tool-first flow is required.
- You need explicit payload diff and verification output.

## Steps

1. Discover available TTD tools with `tools/list`.
2. Retrieve baseline entity state with `ttd_get_entity` (or `ttd_list_entities`).
3. Build minimal payload change for `ttd_create_entity` or `ttd_update_entity`.
4. Execute the write operation.
5. Verify with `ttd_get_entity` and summarize the delta.

## Required Output Sections

- `ChangePlan`
- `PayloadDiff`
- `VerificationResult`

## Constraints

- Prefer one scoped change per call.
- Avoid broad payload rewrites.
- Always include a verification step after writes.
