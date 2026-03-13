import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * AmazonDsp Entity Duplication Workflow Prompt
 *
 * Guides AI agents through duplicating campaigns, ad groups, and ads
 * for A/B testing, scaling, and templating.
 */
export const amazonDspEntityDuplicationWorkflowPrompt: Prompt = {
  name: "amazon_dsp_entity_duplication_workflow",
  description:
    "Step-by-step guide for duplicating AmazonDsp Ads campaigns, ad groups, and ads using amazon_dsp_duplicate_entity — covers A/B testing, scaling, and common patterns.",
  arguments: [
    {
      name: "entityType",
      description: "Entity type to duplicate: order, lineItem, or creative",
      required: true,
    },
    {
      name: "entityId",
      description: "Numeric ID of the entity to duplicate",
      required: true,
    },
    {
      name: "profileId",
      description: "AmazonDsp Advertiser ID",
      required: true,
    },
  ],
};

export function getAmazonDspEntityDuplicationWorkflowMessage(
  args?: Record<string, string>,
): string {
  const entityType = args?.entityType || "{entityType}";
  const entityId = args?.entityId || "{entityId}";
  const profileId = args?.profileId || "{profileId}";

  return `# AmazonDsp Entity Duplication Workflow

Entity Type: \`${entityType}\`
Entity ID: \`${entityId}\`
Advertiser ID: \`${profileId}\`

---

## Overview

\`amazon_dsp_duplicate_entity\` creates a copy of a campaign, ad group, or ad with all settings preserved.

| What Gets Copied | Details |
|------------------|---------|
| **Order** | Structure, budget, flight dates |
| **Line Item** | Targeting, bidding, schedule, budget |
| **Creative** | Creative type, assets, click URL |

---

## Step 1: Review the Source Entity

Before duplicating, inspect the entity you're copying:

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

Confirm this is the right entity and note its current state.

---

## Step 2: Duplicate the Entity

\`\`\`json
{
  "tool": "amazon_dsp_duplicate_entity",
  "params": {
    "entityType": "${entityType}",
    "profileId": "${profileId}",
    "entityId": "${entityId}",
    "options": {
      "newName": "Copy of ${entityType} ${entityId}"
    }
  }
}
\`\`\`

The response includes the new entity ID.

⚠️ **GOTCHA**: Duplicated entities are created in **paused** state by default. Enable only after review.

---

## Step 3: Customize the Copy

Use the returned entity ID to modify the copy:

### Update Name and Budget

\`\`\`json
{
  "tool": "amazon_dsp_update_entity",
  "params": {
    "entityType": "${entityType}",
    "profileId": "${profileId}",
    "entityId": "{newEntityId}",
    "data": {
      "name": "Order B - Broad Targeting Test",
      "budget": 5000
    }
  }
}
\`\`\`

### Update Targeting (Line Item)

\`\`\`json
{
  "tool": "amazon_dsp_update_entity",
  "params": {
    "entityType": "lineItem",
    "advertiserId": "${profileId}",
    "entityId": "{newLineItemId}",
    "data": {
      "name": "Line Item B - UK/CA Expansion",
      "budget": 1000,
      "targeting": {
        "geoLocations": [{ "id": "GB" }, { "id": "CA" }]
      }
    }
  }
}
\`\`\`

⚠️ **GOTCHA**: Budget values are in **USD** — \`budget: 1000\` means $1000.00.

---

## Step 4: Activate When Ready

After reviewing and customizing the copy:

\`\`\`json
{
  "tool": "amazon_dsp_bulk_update_status",
  "params": {
    "entityType": "${entityType}",
    "profileId": "${profileId}",
    "entityIds": ["{newEntityId}"],
    "state": "delivering"
  }
}
\`\`\`

---

## Common Patterns

### A/B Testing

1. Duplicate the line item
2. Change targeting or bidding on the copy
3. Set both to \`delivering\` and compare via \`amazon_dsp_get_report\`

### Scaling to New Geos

1. Duplicate a proven line item
2. Update \`targeting.geoLocations\` on the copy
3. Adjust budget for the new market
4. Set state to \`delivering\`

### Creative Testing

1. Duplicate a creative
2. Update the click URL or name on the copy
3. Associate both creatives with the same line item

⚠️ **GOTCHA**: Creative assets (images/videos) cannot be changed on an existing creative. Create a new creative instead if you need different media.

---

## Verification

After duplication, verify the copy:

\`\`\`json
{
  "tool": "amazon_dsp_get_entity",
  "params": {
    "entityType": "${entityType}",
    "profileId": "${profileId}",
    "entityId": "{newEntityId}"
  }
}
\`\`\`

## Success Criteria

- [ ] Source entity reviewed before duplication
- [ ] Copy created (check paused state)
- [ ] Copy renamed to distinguish from original
- [ ] Desired changes applied (targeting, budget, creative)
- [ ] Copy verified via \`amazon_dsp_get_entity\`
- [ ] Set to \`delivering\` only after review via \`amazon_dsp_bulk_update_status\`
`;
}
