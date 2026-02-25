---
name: meta-campaign-builder
description: Create complete Meta Ads campaign structures with creation-order enforcement and verification.
---

# Meta Ads Campaign Builder

Workflow ID: `mcp.execute.meta_campaign_setup`

## Use When

- You need to create a new Meta Ads campaign structure (Campaign → Ad Set → Ad).
- You need schema-guided entity creation with validation.
- You need explicit payload diff and verification output.

## Steps

1. Invoke prompt:
   - `meta_campaign_setup_workflow` with `adAccountId`
2. Read required resources:
   - `entity-hierarchy://all`
   - `entity-schema://{entityType}` (for each entity in the hierarchy)
   - `entity-examples://{entityType}`
3. Build entity payloads following the creation order.
4. Execute `meta_create_entity` for each entity in sequence.
5. Verify each created entity with `meta_get_entity`.

## Required Output Sections

- `ChangePlan`
- `PayloadDiff`
- `VerificationResult`

## Constraints

- Create entities in hierarchy order: Custom Audience (optional) → Ad Creative → Campaign → Ad Set → Ad.
- `objective` is required on campaign creation.
- The special ad categories field is required on campaign creation (use empty array if none apply).
- Budgets are in cents (e.g. $10.00 = 1000).
- Always include a verification step after each creation.
