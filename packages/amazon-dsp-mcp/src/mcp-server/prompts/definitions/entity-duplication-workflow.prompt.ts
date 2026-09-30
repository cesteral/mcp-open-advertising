// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * AmazonDsp Entity Duplication Workflow Prompt
 *
 * Guides AI agents through duplicating orders, line items, creatives and
 * creative associations on the Unified API (#234) — read the source, create a
 * PAUSED copy, customize, activate.
 */
export const amazonDspEntityDuplicationWorkflowPrompt: Prompt = {
  name: "amazon_dsp_entity_duplication_workflow",
  description:
    "Step-by-step guide for duplicating Amazon DSP orders, line items and creatives using amazon_dsp_duplicate_entity — covers A/B testing, scaling, and common patterns.",
  arguments: [
    {
      name: "entityType",
      description: "Entity type to duplicate: order, lineItem, creative, or creativeAssociation",
      required: true,
    },
    {
      name: "entityId",
      description: "ID of the entity to duplicate",
      required: true,
    },
    {
      name: "profileId",
      description: "Amazon Ads profile ID bound to the session",
      required: true,
    },
    {
      name: "accountId",
      description: "DSP advertiser ID (advertiserId from amazon_dsp_list_advertisers)",
      required: false,
    },
  ],
};

export function getAmazonDspEntityDuplicationWorkflowMessage(
  args?: Record<string, string>
): string {
  const entityType = args?.entityType || "{entityType}";
  const entityId = args?.entityId || "{entityId}";
  const profileId = args?.profileId || "{profileId}";
  const accountId = args?.accountId || "{accountId}";

  return `# Amazon DSP Entity Duplication Workflow (Unified API)

Entity Type: \`${entityType}\`
Entity ID: \`${entityId}\`
Profile ID: \`${profileId}\`
Advertiser (accountId): \`${accountId}\`

---

## Overview

The Unified API has no copy operation. \`amazon_dsp_duplicate_entity\` reads the source (\`POST /adsApi/v1/query/…\`) and creates a copy (\`POST /adsApi/v1/create/…\`) from the source's create-schema fields. Children are not copied, and targets cannot be duplicated (they cannot be read by ID).

| What Gets Copied | Details |
|------------------|---------|
| **Order** | Name, countries, flights (dates + budgets, new flight IDs), frequencies, optimizations, budgets, fees, tags |
| **Line Item** | Name, parent \`campaignId\`, inventory type, bid, optimization, pacing, targeting settings, budgets, dates |
| **Creative** | Ad type, creative, marketplaces, tags |
| **Creative Association** | Ad group, ad, dates, weight |

Read-only fields (IDs, timestamps, \`status\`, currency codes) are dropped.

---

## Step 1: Review the Source Entity

\`\`\`json
{
  "tool": "amazon_dsp_get_entity",
  "params": {
    "entityType": "${entityType}",
    "profileId": "${profileId}",
    "accountId": "${accountId}",
    "entityId": "${entityId}"
  }
}
\`\`\`

---

## Step 2: Duplicate the Entity

\`\`\`json
{
  "tool": "amazon_dsp_duplicate_entity",
  "params": {
    "entityType": "${entityType}",
    "profileId": "${profileId}",
    "accountId": "${accountId}",
    "entityId": "${entityId}",
    "options": {
      "name": "Copy of ${entityType} ${entityId}"
    }
  }
}
\`\`\`

Pass \`dry_run: true\` first to see the copy's expected state. The response's \`newEntity\` carries the new ID (\`campaignId\` / \`adGroupId\` / \`adId\` / \`adAssociationId\`).

⚠️ **GOTCHA**: Copies are created **PAUSED**. Orders and line items can only be created PAUSED, so \`options.state\` other than PAUSED is refused.

---

## Step 3: Customize the Copy

\`\`\`json
{
  "tool": "amazon_dsp_update_entity",
  "params": {
    "entityType": "lineItem",
    "profileId": "${profileId}",
    "accountId": "${accountId}",
    "entityId": "{newAdGroupId}",
    "data": {
      "name": "Ad Group B - Higher Bid Test",
      "bid": { "baseBid": 3.0 }
    }
  }
}
\`\`\`

Then recreate targets on the copy with \`amazon_dsp_create_entity\` (\`entityType: "target"\`, \`adGroupId\` = the copy) and link ads with \`creativeAssociation\`.

⚠️ **GOTCHA**: Budget values are major currency units, not micros. The currency is the advertiser account's.

---

## Step 4: Activate When Ready

\`\`\`json
{
  "tool": "amazon_dsp_bulk_update_status",
  "params": {
    "entityType": "${entityType}",
    "profileId": "${profileId}",
    "accountId": "${accountId}",
    "entityIds": ["{newEntityId}"],
    "operationStatus": "ENABLED"
  }
}
\`\`\`

---

## Common Patterns

### A/B Testing
1. Duplicate the line item into the same order
2. Change bid or targeting settings on the copy, add its targets and creative associations
3. Enable both and compare via \`amazon_dsp_get_report\`

### Creative Testing
1. Duplicate a creative (ad) and change its \`creative\` settings or name
2. Associate both ads with the same line item (\`creativeAssociation\`)

---

## Success Criteria

- [ ] Source entity reviewed before duplication
- [ ] Copy created PAUSED and renamed
- [ ] Targets / associations recreated on the copy where needed
- [ ] Copy verified via \`amazon_dsp_get_entity\`
- [ ] Enabled only after review via \`amazon_dsp_bulk_update_status\`
`;
}
