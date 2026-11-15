// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * LinkedIn Entity Duplication Workflow Prompt
 *
 * Guides AI agents through duplicating campaign groups, campaigns, and creatives
 * for A/B testing, scaling, and templating.
 */
export const linkedInEntityDuplicationWorkflowPrompt: Prompt = {
  name: "linkedin_entity_duplication_workflow",
  description:
    "Step-by-step guide for duplicating LinkedIn Ads campaign groups, campaigns and conversion rules using linkedin_duplicate_entity — covers A/B testing, scaling, and common patterns.",
  arguments: [
    {
      name: "entityType",
      description: "Entity type to duplicate: campaignGroup, campaign, or conversionRule",
      required: true,
    },
    {
      name: "adAccountUrn",
      description:
        "URN of the ad account that owns the entity (required for every type except adAccount)",
      required: false,
    },
    {
      name: "entityUrn",
      description: "URN of the entity to duplicate",
      required: true,
    },
  ],
};

export function getLinkedInEntityDuplicationWorkflowMessage(args?: Record<string, string>): string {
  const entityType = args?.entityType || "{entityType}";
  const entityUrn = args?.entityUrn || "{entityUrn}";
  const adAccountUrn = args?.adAccountUrn || "{adAccountUrn}";

  return `# LinkedIn Entity Duplication Workflow

Entity Type: \`${entityType}\`
Entity URN: \`${entityUrn}\`

---

## Overview

\`linkedin_duplicate_entity\` reads one campaign group, campaign or conversion rule and creates a DRAFT copy of it in the same ad account. Only that entity is copied: a campaign group's campaigns and a campaign's creatives are not.

| What Gets Copied | Details |
|------------------|---------|
| **Campaign Group** | Its own settings (name, budget, schedule), not its campaigns |
| **Campaign** | Targeting, budget and bid settings, not its creatives |
| **Conversion Rule** | Its own settings |

Ad accounts cannot be duplicated, and creatives cannot be yet (their read and create are on different LinkedIn APIs).

---

## Step 1: Review the Source Entity

Before duplicating, inspect the entity you're copying:

\`\`\`json
{
  "tool": "linkedin_get_entity",
  "params": {
    "entityType": "${entityType}",
    "entityUrn": "${entityUrn}",
    "adAccountUrn": "${adAccountUrn}"
  }
}
\`\`\`

Confirm this is the right entity and note its current state.

---

## Step 2: Duplicate the Entity

\`\`\`json
{
  "tool": "linkedin_duplicate_entity",
  "params": {
    "entityType": "${entityType}",
    "entityUrn": "${entityUrn}",
    "adAccountUrn": "${adAccountUrn}",
    "options": {
      "copyCreatives": true
    }
  }
}
\`\`\`

The response includes the new entity URN.

⚠️ **GOTCHA**: Duplicated entities are created in **DRAFT** status by default. Review before activating.

---

## Step 3: Customize the Copy

Use the returned URN to modify the copy:

### Update Name

\`\`\`json
{
  "tool": "linkedin_update_entity",
  "params": {
    "entityType": "${entityType}",
    "entityUrn": "{newEntityUrn}",
    "adAccountUrn": "${adAccountUrn}",
    "data": {
      "name": "Campaign B - Senior Tech Leaders"
    }
  }
}
\`\`\`

### Update Targeting (Campaign)

\`\`\`json
{
  "tool": "linkedin_update_entity",
  "params": {
    "entityType": "campaign",
    "entityUrn": "{newCampaignUrn}",
    "adAccountUrn": "${adAccountUrn}",
    "data": {
      "targetingCriteria": {
        "include": {
          "and": [
            {
              "or": {
                "urn:li:adTargetingFacet:locations": ["urn:li:geo:101174742"]
              }
            }
          ]
        }
      }
    }
  }
}
\`\`\`

### Update Budget

\`\`\`json
{
  "tool": "linkedin_update_entity",
  "params": {
    "entityType": "campaign",
    "entityUrn": "{newCampaignUrn}",
    "adAccountUrn": "${adAccountUrn}",
    "data": {
      "dailyBudget": { "amount": "200.00", "currencyCode": "USD" }
    }
  }
}
\`\`\`

⚠️ **GOTCHA**: Budget is a CurrencyAmount object. The \`amount\` field is a string (e.g., \`"200.00"\`), not a number.

⚠️ **GOTCHA**: Targeting updates **replace entirely**. Always send the complete targetingCriteria object.

---

## Step 4: Activate When Ready

After reviewing and customizing the copy:

\`\`\`json
{
  "tool": "linkedin_bulk_update_status",
  "params": {
    "entityType": "${entityType}",
    "entityUrns": ["{newEntityUrn}"],
    "adAccountUrn": "${adAccountUrn}",
    "status": "ACTIVE"
  }
}
\`\`\`

---

## Common Patterns

### A/B Testing (Split Test)

1. Duplicate the campaign
2. Change one variable on the copy (targeting, creative, bid)
3. Activate both and compare via \`linkedin_get_analytics\`

\`\`\`
Original: "Brand Campaign - Tech Leaders" (targeting: senior engineers)
   Copy: "Brand Campaign - Marketing Leaders" (targeting: marketing managers)
\`\`\`

### Scaling to New Geos

1. Duplicate a proven campaign
2. Update geo targeting on the copy
3. Adjust budget for the new market
4. Activate

### Template Campaigns

1. Create a "template" campaign with desired settings (DRAFT)
2. Duplicate it for each new client/product
3. Update names, budgets, targeting on each copy
4. Activate when ready

---

## Verification

After duplication, verify the copy:

\`\`\`json
{
  "tool": "linkedin_get_entity",
  "params": {
    "entityType": "${entityType}",
    "entityUrn": "{newEntityUrn}",
    "adAccountUrn": "${adAccountUrn}"
  }
}
\`\`\`

## Success Criteria

- [ ] Source entity reviewed before duplication
- [ ] Copy created (check DRAFT status)
- [ ] Copy renamed to distinguish from original
- [ ] Desired changes applied (targeting, budget, creative)
- [ ] Copy verified via \`linkedin_get_entity\`
- [ ] Activated only after review
`;
}
