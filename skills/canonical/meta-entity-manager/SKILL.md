---
name: meta-entity-manager
description: Execute schema-first Meta Ads entity CRUD with verification.
---

# Meta Ads Entity Manager

Workflow ID: `mcp.execute.meta_entity_update`

## Use When

- You need to create, update, or delete Meta Ads entities safely.
- You need prompt-guided workflow for entity mutations.
- You need explicit payload diff and verification output.

## Steps

1. Invoke prompt based on context:
   - Setup/update flow: `meta_campaign_setup_workflow`
   - Troubleshooting: `meta_troubleshoot_entity`
2. Read required resources:
   - `entity-hierarchy://all`
   - `entity-schema://{entityType}`
   - `entity-examples://{entityType}`
3. Build minimal payload for the target operation.
4. Execute the appropriate tool:
   - `meta_create_entity`, `meta_update_entity`, `meta_delete_entity`, or `meta_get_entity`
5. Verify with `meta_get_entity` and summarize the delta.

## Required Output Sections

- `ChangePlan`
- `PayloadDiff`
- `VerificationResult`

## Constraints

- Budgets are in cents (e.g. $10.00 = 1000).
- The special ad categories field is required on campaign creation (use empty array if none apply).
- Targeting fields are full-replace on update; always send the complete targeting spec.
- ARCHIVED status is permanent and cannot be reversed.
- Always include a verification step after writes.
