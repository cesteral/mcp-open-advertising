// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * Pinterest Entity Update Workflow Prompt
 *
 * Guides AI agents through safely updating Pinterest Ads entities.
 * Key distinction: field updates use pinterest_update_entity,
 * status changes use pinterest_bulk_update_status (separate endpoint).
 */
export const pinterestEntityUpdateWorkflowPrompt: Prompt = {
  name: "pinterest_entity_update_workflow",
  description:
    "Step-by-step guide for safely updating Pinterest Ads entities — covers field updates vs status changes (separate endpoints), budget values in account currency, and verification.",
  arguments: [
    {
      name: "entityType",
      description: "Entity type to update: campaign, adGroup, or ad",
      required: true,
    },
    {
      name: "entityId",
      description: "Numeric ID of the entity to update",
      required: true,
    },
    {
      name: "adAccountId",
      description: "Pinterest ad account ID",
      required: true,
    },
  ],
};

export function getPinterestEntityUpdateWorkflowMessage(args?: Record<string, string>): string {
  const entityType = args?.entityType || "{entityType}";
  const entityId = args?.entityId || "{entityId}";
  const adAccountId = args?.adAccountId || "{adAccountId}";

  return `# Pinterest Ads Entity Update Workflow

Entity Type: \`${entityType}\`
Entity ID: \`${entityId}\`
Ad account ID: \`${adAccountId}\`

---

## Step 1: Fetch Current State

Before updating, always read the entity's current configuration:

\`\`\`json
{
  "tool": "pinterest_get_entity",
  "params": {
    "entityType": "${entityType}",
    "adAccountId": "${adAccountId}",
    "entityId": "${entityId}"
  }
}
\`\`\`

Review the current values. Save the current state for rollback reference.

**Resource reference:** Fetch \`entity-schema://pinterest/${entityType}\` for the full field schema and \`entity-examples://pinterest/${entityType}\` for common update patterns.

---

## Step 2: Update Entity Fields

\`pinterest_update_entity\` sends a PATCH with only the fields you provide, using Pinterest's own field names (OpenAPI v5). The entity id and ad account are added for you.

### Campaign Updates

\`\`\`json
{
  "tool": "pinterest_update_entity",
  "params": {
    "entityType": "campaign",
    "adAccountId": "${adAccountId}",
    "entityId": "${entityId}",
    "data": {
      "name": "Updated Campaign Name",
      "end_time": 1798761599
    }
  }
}
\`\`\`

Campaign fields include \`name\`, \`status\`, \`start_time\` / \`end_time\` (Unix seconds), \`daily_spend_cap\` / \`lifetime_spend_cap\` (only one can be set, and one is required for campaign budget optimization) and \`tracking_urls\`. \`objective_type\` can only be changed on some campaigns.

### Ad Group Updates

\`\`\`json
{
  "tool": "pinterest_update_entity",
  "params": {
    "entityType": "adGroup",
    "adAccountId": "${adAccountId}",
    "entityId": "${entityId}",
    "data": {
      "name": "Updated Ad Group",
      "budget_in_micro_currency": 100000000,
      "bid_in_micro_currency": 800000,
      "targeting_spec": {
        "AGE_BUCKET": ["25-34", "35-44"],
        "LOCATION": ["US", "GB"]
      }
    }
  }
}
\`\`\`

\`targeting_spec\` replaces the whole spec, so include every dimension you want to keep. Use \`targeting_spec_operations\` for incremental changes instead. See \`pinterest_targeting_discovery_workflow\` for the keys.

To change bids across several ad groups, prefer \`pinterest_adjust_bids\`. It takes bids in account currency (\`1.5\` = 1.50), converts them to micros for you, and reports the previous bid.

### Ad Updates

\`\`\`json
{
  "tool": "pinterest_update_entity",
  "params": {
    "entityType": "ad",
    "adAccountId": "${adAccountId}",
    "entityId": "${entityId}",
    "data": {
      "name": "Updated Ad Name",
      "destination_url": "https://example.com/new-page",
      "customizable_cta_type": "SHOP_NOW"
    }
  }
}
\`\`\`

An ad's image, video and text come from its Pin (\`pin_id\`), not from fields on the ad. To change the copy, edit or replace the Pin.

---

## Step 3: Update Status

Status is an ordinary field on the same PATCH, so \`pinterest_update_entity\` with \`{"status": "PAUSED"}\` works. For one or many entities, \`pinterest_bulk_update_status\` is simpler, and it reports a result for each id:

\`\`\`json
{
  "tool": "pinterest_bulk_update_status",
  "params": {
    "entityType": "${entityType}",
    "adAccountId": "${adAccountId}",
    "entityIds": ["${entityId}"],
    "operationStatus": "PAUSED"
  }
}
\`\`\`

Valid values: \`"ACTIVE"\`, \`"PAUSED"\`, \`"ARCHIVED"\`.

⚠️ **ARCHIVED is Pinterest's soft delete, and no tool on this server unarchives.** Treat it as permanent. Use PAUSED to stop delivery reversibly.

---

## Step 4: Verify Changes

After the update call succeeds, verify the changes:

\`\`\`json
{
  "tool": "pinterest_get_entity",
  "params": {
    "entityType": "${entityType}",
    "adAccountId": "${adAccountId}",
    "entityId": "${entityId}"
  }
}
\`\`\`

---

## Gotchas

- **Money is in micro-currency** in \`pinterest_update_entity\`: \`budget_in_micro_currency: 100000000\` = 100.00 in the account currency. Only \`pinterest_adjust_bids\` takes plain currency units.
- **Times are Unix seconds** (\`start_time\`, \`end_time\`), not date strings.
- **Rejections come back as HTTP 200.** Pinterest returns per-item \`exceptions\`, and the tools report them as errors, so read the result rather than assuming success.
- **billable_event** can only be changed on a draft ad group.

---

## Rollback

If an update causes issues, reverse it by sending the original values:

\`\`\`json
{
  "tool": "pinterest_update_entity",
  "params": {
    "entityType": "${entityType}",
    "adAccountId": "${adAccountId}",
    "entityId": "${entityId}",
    "data": {
      "field_that_was_changed": "{original_value}"
    }
  }
}
\`\`\`

Report the rollback hint (original values) whenever you make a change so the user can revert if needed. An ARCHIVED entity cannot be rolled back this way.
`;
}
