import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * TikTok Entity Update Workflow Prompt
 *
 * Guides AI agents through safely updating TikTok Ads entities.
 * Key distinction: field updates use tiktok_update_entity,
 * status changes use tiktok_bulk_update_status (separate endpoint).
 */
export const tiktokEntityUpdateWorkflowPrompt: Prompt = {
  name: "tiktok_entity_update_workflow",
  description:
    "Step-by-step guide for safely updating TikTok Ads entities — covers field updates vs status changes (separate endpoints), budget values in account currency, and verification.",
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
      name: "advertiserId",
      description: "TikTok Advertiser ID",
      required: true,
    },
  ],
};

export function getTiktokEntityUpdateWorkflowMessage(
  args?: Record<string, string>,
): string {
  const entityType = args?.entityType || "{entityType}";
  const entityId = args?.entityId || "{entityId}";
  const advertiserId = args?.advertiserId || "{advertiserId}";

  return `# TikTok Ads Entity Update Workflow

Entity Type: \`${entityType}\`
Entity ID: \`${entityId}\`
Advertiser ID: \`${advertiserId}\`

---

## Step 1: Fetch Current State

Before updating, always read the entity's current configuration:

\`\`\`json
{
  "tool": "tiktok_get_entity",
  "params": {
    "entityType": "${entityType}",
    "advertiserId": "${advertiserId}",
    "entityId": "${entityId}"
  }
}
\`\`\`

Review the current values. Save the current state for rollback reference.

**Resource reference:** Fetch \`entity-schema://tiktok/${entityType}\` for the full field schema and \`entity-examples://tiktok/${entityType}\` for common update patterns.

---

## Step 2: Update Entity Fields

Use \`tiktok_update_entity\` for **field changes** (name, budget, bid, targeting):

### Campaign Updates

\`\`\`json
{
  "tool": "tiktok_update_entity",
  "params": {
    "entityType": "campaign",
    "advertiserId": "${advertiserId}",
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
  "tool": "tiktok_update_entity",
  "params": {
    "entityType": "adGroup",
    "advertiserId": "${advertiserId}",
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
  "tool": "tiktok_update_entity",
  "params": {
    "entityType": "ad",
    "advertiserId": "${advertiserId}",
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

⚠️ **CRITICAL GOTCHA**: TikTok uses a **separate endpoint** for status changes. Do NOT include \`operation_status\` in \`tiktok_update_entity\` — it won't work.

Use \`tiktok_bulk_update_status\` for all status changes:

\`\`\`json
{
  "tool": "tiktok_bulk_update_status",
  "params": {
    "entityType": "${entityType}",
    "advertiserId": "${advertiserId}",
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
  "tool": "tiktok_get_entity",
  "params": {
    "entityType": "${entityType}",
    "advertiserId": "${advertiserId}",
    "entityId": "${entityId}"
  }
}
\`\`\`

---

## Gotchas

- **Status changes use a different tool**: Never use \`tiktok_update_entity\` for enabling/disabling entities — use \`tiktok_bulk_update_status\`.
- **Budget values are in account currency**: \`budget: 100\` means $100.00 (not cents, not micros).
- **Targeting replaces on ad group**: When updating targeting fields on an ad group, include all targeting you want to keep.
- **Video IDs are immutable**: You cannot change the video on an existing ad. Delete and recreate instead.
- **Ad review re-triggered**: Updating ad copy or creative may trigger a new review cycle (24-48h).

---

## Rollback

If an update causes issues, reverse it by sending the original values:

\`\`\`json
{
  "tool": "tiktok_update_entity",
  "params": {
    "entityType": "${entityType}",
    "advertiserId": "${advertiserId}",
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
