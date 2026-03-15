// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * Entity Update Workflow Prompt
 *
 * Guides AI agents through safely updating Meta Ads entities:
 * campaigns, ad sets, ads, ad creatives, and custom audiences.
 */
export const entityUpdateWorkflowPrompt: Prompt = {
  name: "meta_entity_update_workflow",
  description:
    "Step-by-step guide for safely updating Meta Ads entities: fetch current state, build partial update payload, execute update, and verify changes. Covers campaigns, ad sets, ads, ad creatives, and custom audiences.",
  arguments: [
    {
      name: "entityType",
      description:
        "Entity type to update: campaign, adSet, ad, adCreative, or customAudience",
      required: true,
    },
    {
      name: "entityId",
      description: "ID of the entity to update",
      required: true,
    },
  ],
};

export function getEntityUpdateWorkflowMessage(
  args?: Record<string, string>,
): string {
  const entityType = args?.entityType || "{entityType}";
  const entityId = args?.entityId || "{entityId}";

  return `# Meta Ads Entity Update Workflow

Entity Type: \`${entityType}\`
Entity ID: \`${entityId}\`

---

## Step 1: Fetch Current State

Before updating, always read the entity's current configuration:

\`\`\`json
{
  "tool": "meta_get_entity",
  "params": {
    "entityType": "${entityType}",
    "entityId": "${entityId}"
  }
}
\`\`\`

Review the current values to understand what you're changing. Save the current state mentally for rollback reference.

**Resource reference:** Fetch \`entity-schema://${entityType}\` for the full field schema and \`entity-examples://${entityType}\` for common update patterns.

---

## Step 2: Build Update Payload

Meta uses POST with PATCH semantics — only include the fields you want to change. Unspecified fields remain unchanged.

### Campaign Updates

\`\`\`json
{
  "tool": "meta_update_entity",
  "params": {
    "entityType": "campaign",
    "entityId": "${entityId}",
    "data": {
      "name": "Updated Campaign Name",
      "daily_budget": 5000,
      "status": "PAUSED"
    }
  }
}
\`\`\`

### Ad Set Updates

\`\`\`json
{
  "tool": "meta_update_entity",
  "params": {
    "entityType": "adSet",
    "entityId": "${entityId}",
    "data": {
      "daily_budget": 3000,
      "bid_amount": 250,
      "targeting": {
        "geo_locations": {
          "countries": ["US", "GB"]
        },
        "age_min": 25,
        "age_max": 55
      }
    }
  }
}
\`\`\`

### Ad Updates

\`\`\`json
{
  "tool": "meta_update_entity",
  "params": {
    "entityType": "ad",
    "entityId": "${entityId}",
    "data": {
      "name": "Updated Ad Name",
      "status": "ACTIVE"
    }
  }
}
\`\`\`

---

## Step 3: Execute and Verify

After the update call succeeds, verify the changes took effect:

\`\`\`json
{
  "tool": "meta_get_entity",
  "params": {
    "entityType": "${entityType}",
    "entityId": "${entityId}"
  }
}
\`\`\`

Compare the returned values with what you set in Step 2.

---

## Gotchas

- **Budget values are in cents**: \`daily_budget: 5000\` means $50.00 USD, not $5,000.
- **Targeting replaces entirely**: When updating \`targeting\`, the entire targeting spec is replaced, not merged. Always include all targeting fields you want to keep.
- **No updateMask**: Unlike DV360/Google Ads, Meta doesn't use an updateMask. Just send the fields you want to change.
- **status field**: Use \`ACTIVE\`, \`PAUSED\`, or \`ARCHIVED\`. Archiving is irreversible.
- **effective_status vs status**: \`status\` is what you set. \`effective_status\` reflects the actual delivery state (may differ if parent is paused). Always check \`effective_status\` after updates.
- **special_ad_categories**: Cannot be changed after campaign creation. Must delete and recreate.
- **48-hour reporting lag**: Performance data may take up to 48 hours to fully populate after changes.

---

## Rollback

If an update causes issues, reverse it by sending the original values:

\`\`\`json
{
  "tool": "meta_update_entity",
  "params": {
    "entityType": "${entityType}",
    "entityId": "${entityId}",
    "data": {
      "field_that_was_changed": "{original_value}"
    }
  }
}
\`\`\`

Report the rollback hint (original values) whenever you make a change so the user can revert if needed.
`;
}