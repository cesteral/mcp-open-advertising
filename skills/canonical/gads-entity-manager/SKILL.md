---
name: gads-entity-manager
description: Execute schema-first Google Ads entity CRUD with verification.
---

# Google Ads Entity Manager

Workflow ID: `mcp.execute.gads_entity_management`

## Use When

- You need to create, update, or remove Google Ads entities safely.
- You need prompt-guided troubleshooting for entity issues.
- You need explicit payload diff and verification output.

## Steps

1. Invoke prompt based on context:
   - Setup flow: `gads_campaign_setup_workflow`
   - Troubleshooting: `gads_troubleshoot_entity`
2. Read required resources:
   - `entity-schema://{entityType}`
   - `entity-examples://{entityType}`
3. Build minimal payload for the target operation.
4. Execute the appropriate tool:
   - `gads_create_entity`, `gads_update_entity`, `gads_remove_entity`, or `gads_get_entity`
5. Verify with `gads_get_entity` and summarize the delta.

## Required Output Sections

- `ChangePlan`
- `PayloadDiff`
- `VerificationResult`

## Constraints

- Prefer one scoped change per execution step.
- Use targeted `updateMask` values; avoid broad rewrites.
- Always include a verification step after writes.
