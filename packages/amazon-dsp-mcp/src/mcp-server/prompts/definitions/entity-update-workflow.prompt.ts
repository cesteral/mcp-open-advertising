import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * AmazonDsp Entity Update Workflow Prompt
 *
 * Guides AI agents through safely updating AmazonDsp Ads entities.
 * Key distinction: field updates use amazon_dsp_update_entity,
 * status changes use amazon_dsp_bulk_update_status (separate endpoint).
 */
export const amazonDspEntityUpdateWorkflowPrompt: Prompt = {
  name: "amazon_dsp_entity_update_workflow",
  description:
    "Step-by-step guide for safely updating AmazonDsp Ads entities — covers field updates vs status changes (separate endpoints), budget values in account currency, and verification.",
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
      name: "profileId",
      description: "AmazonDsp Advertiser ID",
      required: true,
    },
  ],
};

export function getTiktokEntityUpdateWorkflowMessage(
  args?: Record<string, string>,
): string {
  const entityType = args?.entityType || "{entityType}";
  const entityId = args?.entityId || "{entityId}";
  const profileId = args?.profileId || "{profileId}";

  return `# AmazonDsp Ads Entity Update Workflow

Entity Type: \`${entityType}\`
Entity ID: \`${entityId}\`
Advertiser ID: \`${profileId}\`

---

## Step 1: Fetch Current State

Before updating, always read the entity's current configuration:

\`\`\`json
{
  "tool": "amazon_dsp_get_entity",
  "params": {
    "entityType": "${entityType}",
    "profileId": "${profileId}",
    "entityId": "${entityId}"
  }
}
\`\`\`

Review the current values. Save the current state for rollback reference.

**Resource reference:** Fetch \`entity-schema://amazonDsp/${entityType}\` for the full field schema and \`entity-examples://amazonDsp/${entityType}\` for common update patterns.

---

## Step 2: Update Entity Fields

Use \`amazon_dsp_update_entity\` for **field changes** (name, budget, bid, targeting):

### Campaign Updates

\`\`\`json
{
  "tool": "amazon_dsp_update_entity",
  "params": {
    "entityType": "campaign",
    "profileId": "${profileId}",
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
  "tool": "amazon_dsp_update_entity",
  "params": {
    "entityType": "adGroup",
    "profileId": "${profileId}",
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
  "tool": "amazon_dsp_update_entity",
  "params": {
    "entityType": "ad",
    "profileId": "${profileId}",
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

⚠️ **CRITICAL GOTCHA**: AmazonDsp uses a **separate endpoint** for status changes. Do NOT include \`operation_status\` in \`amazon_dsp_update_entity\` — it won't work.

Use \`amazon_dsp_bulk_update_status\` for all status changes:

\`\`\`json
{
  "tool": "amazon_dsp_bulk_update_status",
  "params": {
    "entityType": "${entityType}",
    "profileId": "${profileId}",
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
  "tool": "amazon_dsp_get_entity",
  "params": {
    "entityType": "${entityType}",
    "profileId": "${profileId}",
    "entityId": "${entityId}"
  }
}
\`\`\`

---

## Gotchas

- **Status changes use a different tool**: Never use \`amazon_dsp_update_entity\` for enabling/disabling entities — use \`amazon_dsp_bulk_update_status\`.
- **Budget values are in account currency**: \`budget: 100\` means $100.00 (not cents, not micros).
- **Targeting replaces on ad group**: When updating targeting fields on an ad group, include all targeting you want to keep.
- **Video IDs are immutable**: You cannot change the video on an existing ad. Delete and recreate instead.
- **Ad review re-triggered**: Updating ad copy or creative may trigger a new review cycle (24-48h).

---

## Rollback

If an update causes issues, reverse it by sending the original values:

\`\`\`json
{
  "tool": "amazon_dsp_update_entity",
  "params": {
    "entityType": "${entityType}",
    "profileId": "${profileId}",
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
