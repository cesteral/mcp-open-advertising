// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * Snapchat Entity Update Workflow Prompt
 *
 * Guides AI agents through safely updating Snapchat Ads entities.
 * Key distinction: field updates use snapchat_update_entity,
 * status changes use snapchat_bulk_update_status (separate endpoint).
 */
export const snapchatEntityUpdateWorkflowPrompt: Prompt = {
  name: "snapchat_entity_update_workflow",
  description:
    "Step-by-step guide for safely updating Snapchat Ads entities — covers field updates vs status changes (separate endpoints), budget values in account currency, and verification.",
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
      description: "Snapchat Advertiser ID",
      required: true,
    },
  ],
};

export function getSnapchatEntityUpdateWorkflowMessage(args?: Record<string, string>): string {
  const entityType = args?.entityType || "{entityType}";
  const entityId = args?.entityId || "{entityId}";
  const adAccountId = args?.adAccountId || "{adAccountId}";

  return `# Snapchat Ads Entity Update Workflow

Entity Type: \`${entityType}\`
Entity ID: \`${entityId}\`
Advertiser ID: \`${adAccountId}\`

---

## Step 1: Fetch Current State

Before updating, always read the entity's current configuration:

\`\`\`json
{
  "tool": "snapchat_get_entity",
  "params": {
    "entityType": "${entityType}",
    "adAccountId": "${adAccountId}",
    "entityId": "${entityId}"
  }
}
\`\`\`

Review the current values. Save the current state for rollback reference.

**Resource reference:** Fetch \`entity-schema://snapchat/${entityType}\` for the full field schema and \`entity-examples://snapchat/${entityType}\` for common update patterns.

---

## Step 2: Update Entity Fields

Use \`snapchat_update_entity\` for **field changes** (name, budget, bid, targeting):

### Campaign Updates

\`\`\`json
{
  "tool": "snapchat_update_entity",
  "params": {
    "entityType": "campaign",
    "adAccountId": "${adAccountId}",
    "entityId": "${entityId}",
    "data": {
      "campaign_name": "Updated Campaign Name",
      "budget": 200,
      "budget_mode": "BUDGET_MODE_DAY"
    }
  }
}
\`\`\`

### Ad Group Updates

\`\`\`json
{
  "tool": "snapchat_update_entity",
  "params": {
    "entityType": "adGroup",
    "adAccountId": "${adAccountId}",
    "entityId": "${entityId}",
    "data": {
      "adgroup_name": "Updated Ad Group",
      "budget": 100,
      "bid_price": 0.8,
      "age": ["AGE_25_34", "AGE_35_44"],
      "gender": ["GENDER_UNLIMITED"],
      "location_ids": ["US", "GB"]
    }
  }
}
\`\`\`

### Ad Updates

\`\`\`json
{
  "tool": "snapchat_update_entity",
  "params": {
    "entityType": "ad",
    "adAccountId": "${adAccountId}",
    "entityId": "${entityId}",
    "data": {
      "ad_name": "Updated Ad Name",
      "ad_text": "New ad copy (max 100 chars)",
      "call_to_action": "SHOP_NOW",
      "landing_page_url": "https://example.com/new-page"
    }
  }
}
\`\`\`

---

## Step 3: Update Status (Separate Endpoint)

⚠️ **CRITICAL GOTCHA**: Snapchat uses a **separate endpoint** for status changes. Do NOT include \`operation_status\` in \`snapchat_update_entity\` — it won't work.

Use \`snapchat_bulk_update_status\` for all status changes:

\`\`\`json
{
  "tool": "snapchat_bulk_update_status",
  "params": {
    "entityType": "${entityType}",
    "adAccountId": "${adAccountId}",
    "entityIds": ["${entityId}"],
    "operationStatus": "ENABLE"
  }
}
\`\`\`

Valid status values: \`"ENABLE"\`, \`"DISABLE"\`, \`"DELETE"\`

---

## Step 4: Verify Changes

After the update call succeeds, verify the changes:

\`\`\`json
{
  "tool": "snapchat_get_entity",
  "params": {
    "entityType": "${entityType}",
    "adAccountId": "${adAccountId}",
    "entityId": "${entityId}"
  }
}
\`\`\`

---

## Gotchas

- **Status changes use a different tool**: Never use \`snapchat_update_entity\` for enabling/disabling entities — use \`snapchat_bulk_update_status\`.
- **Budget values are in account currency**: \`budget: 100\` means $100.00 (not cents, not micros).
- **Targeting replaces on ad group**: When updating targeting fields on an ad group, include all targeting you want to keep.
- **Video IDs are immutable**: You cannot change the video on an existing ad. Delete and recreate instead.
- **Ad review re-triggered**: Updating ad copy or creative may trigger a new review cycle (24-48h).

---

## Rollback

If an update causes issues, reverse it by sending the original values:

\`\`\`json
{
  "tool": "snapchat_update_entity",
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

Report the rollback hint (original values) whenever you make a change so the user can revert if needed.
`;
}
