// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * Pinterest Entity Duplication Workflow Prompt
 *
 * Guides AI agents through duplicating campaigns, ad groups, and ads
 * for A/B testing, scaling, and templating.
 */
export const pinterestEntityDuplicationWorkflowPrompt: Prompt = {
  name: "pinterest_entity_duplication_workflow",
  description:
    "Step-by-step guide for duplicating Pinterest Ads campaigns, ad groups, and ads using pinterest_duplicate_entity — covers A/B testing, scaling, and common patterns.",
  arguments: [
    {
      name: "entityType",
      description: "Entity type to duplicate: campaign, adGroup, or ad",
      required: true,
    },
    {
      name: "entityId",
      description: "Numeric ID of the entity to duplicate",
      required: true,
    },
    {
      name: "adAccountId",
      description: "Pinterest Advertiser ID",
      required: true,
    },
  ],
};

export function getPinterestEntityDuplicationWorkflowMessage(
  args?: Record<string, string>
): string {
  const entityType = args?.entityType || "{entityType}";
  const entityId = args?.entityId || "{entityId}";
  const adAccountId = args?.adAccountId || "{adAccountId}";

  return `# Pinterest Entity Duplication Workflow

Entity Type: \`${entityType}\`
Entity ID: \`${entityId}\`
Advertiser ID: \`${adAccountId}\`

---

## Overview

\`pinterest_duplicate_entity\` creates a copy of a campaign, ad group, or ad with all settings preserved.

| What Gets Copied | Details |
|------------------|---------|
| **Campaign** | Structure, budget mode, objective |
| **Ad Group** | Targeting, bid, schedule, budget |
| **Ad** | Creative reference, copy, CTA, landing page |

---

## Step 1: Review the Source Entity

Before duplicating, inspect the entity you're copying:

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

Confirm this is the right entity and note its current state.

---

## Step 2: Duplicate the Entity

\`\`\`json
{
  "tool": "pinterest_duplicate_entity",
  "params": {
    "entityType": "${entityType}",
    "adAccountId": "${adAccountId}",
    "entityId": "${entityId}",
    "options": {
      "newName": "Copy of ${entityType} ${entityId}"
    }
  }
}
\`\`\`

The response includes the new entity ID.

⚠️ **GOTCHA**: Duplicated entities are created in **DISABLE** status by default. Enable only after review.

---

## Step 3: Customize the Copy

Use the returned entity ID to modify the copy:

### Update Name and Budget

\`\`\`json
{
  "tool": "pinterest_update_entity",
  "params": {
    "entityType": "${entityType}",
    "adAccountId": "${adAccountId}",
    "entityId": "{newEntityId}",
    "data": {
      "campaign_name": "Campaign B - Broad Targeting Test",
      "budget": 150
    }
  }
}
\`\`\`

### Update Targeting (Ad Group)

\`\`\`json
{
  "tool": "pinterest_update_entity",
  "params": {
    "entityType": "adGroup",
    "adAccountId": "${adAccountId}",
    "entityId": "{newAdGroupId}",
    "data": {
      "age": ["AGE_35_44", "AGE_45_54"],
      "gender": ["GENDER_FEMALE"],
      "location_ids": ["GB", "CA"]
    }
  }
}
\`\`\`

⚠️ **GOTCHA**: Budget values are in **account currency** — \`budget: 150\` means $150.00.

---

## Step 4: Activate When Ready

After reviewing and customizing the copy:

\`\`\`json
{
  "tool": "pinterest_bulk_update_status",
  "params": {
    "entityType": "${entityType}",
    "adAccountId": "${adAccountId}",
    "entityIds": ["{newEntityId}"],
    "operationStatus": "ENABLE"
  }
}
\`\`\`

---

## Common Patterns

### A/B Testing

1. Duplicate the ad group
2. Change targeting or bid on the copy
3. Enable both and compare via \`pinterest_get_report\`

### Scaling to New Geos

1. Duplicate a proven ad group
2. Update \`location_ids\` on the copy
3. Adjust budget for the new market
4. Enable

### Creative Testing

1. Duplicate an ad
2. Update \`ad_text\` or CTA on the copy
3. Run both ads in the same ad group

⚠️ **GOTCHA**: Video IDs are immutable — you cannot change the video on an existing ad. Create a new ad instead of duplicating if you want different video creative.

---

## Verification

After duplication, verify the copy:

\`\`\`json
{
  "tool": "pinterest_get_entity",
  "params": {
    "entityType": "${entityType}",
    "adAccountId": "${adAccountId}",
    "entityId": "{newEntityId}"
  }
}
\`\`\`

## Success Criteria

- [ ] Source entity reviewed before duplication
- [ ] Copy created (check DISABLE status)
- [ ] Copy renamed to distinguish from original
- [ ] Desired changes applied (targeting, budget, creative)
- [ ] Copy verified via \`pinterest_get_entity\`
- [ ] Enabled only after review via \`pinterest_bulk_update_status\`
`;
}
