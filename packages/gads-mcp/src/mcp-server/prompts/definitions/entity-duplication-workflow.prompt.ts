// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Google Ads Entity Duplication Workflow Prompt
 *
 * Guides AI agents through duplicating Google Ads entities using the get-then-create
 * pattern. Google Ads has no native "duplicate" API, so duplication requires reading
 * the source entity, stripping immutable/ID fields, and creating a new entity.
 */
import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const entityDuplicationWorkflowPrompt: Prompt = {
  name: "gads_entity_duplication_workflow",
  description:
    "Step-by-step guide for duplicating Google Ads entities (campaigns, adGroups, ads, keywords) using the get-then-create pattern. Covers field stripping, naming conventions, and budget handling.",
  arguments: [
    {
      name: "customerId",
      description: "Google Ads customer ID (no dashes)",
      required: true,
    },
    {
      name: "entityType",
      description: "Entity type to duplicate: campaign, adGroup, ad, or keyword",
      required: true,
    },
    {
      name: "sourceEntityId",
      description: "ID of the source entity to copy from",
      required: true,
    },
  ],
};

export function getEntityDuplicationWorkflowMessage(args?: Record<string, string>): string {
  const customerId = args?.customerId || "{customerId}";
  const entityType = args?.entityType || "{entityType}";
  const sourceEntityId = args?.sourceEntityId || "{sourceEntityId}";

  return `# Google Ads Entity Duplication Workflow

## Context
- Customer ID: \`${customerId}\`
- Entity Type: \`${entityType}\`
- Source Entity ID: \`${sourceEntityId}\`
- Platform: Google Ads API v23

Google Ads has no native "duplicate" endpoint. Duplication is done by reading the source entity and creating a new one with adjusted fields.

---

## Step 1: Fetch the Source Entity

Retrieve the full source entity using GAQL to get all relevant fields:

\`\`\`
Tool: gads_get_entity
Input: {
  "entityType": "${entityType}",
  "customerId": "${customerId}",
  "entityId": "${sourceEntityId}"
}
\`\`\`

**Save the full response** — you will use it as the template for the new entity.

---

## Step 2: Strip Immutable and ID Fields

Before creating the copy, remove the following fields from the response:
- \`id\` — auto-assigned by the API
- \`resource_name\` — auto-assigned by the API
- \`status\` — set explicitly to \`PAUSED\` for safety

### Fields to strip by entity type

| Entity Type | Fields to Remove |
|-------------|-----------------|
| campaign | \`id\`, \`resource_name\`, \`campaign_budget\` (recreate separately) |
| adGroup | \`id\`, \`resource_name\` |
| ad | \`id\`, \`resource_name\`, \`ad.id\` |
| keyword | \`id\`, \`resource_name\` |

---

## Step 3: Adjust Name and Settings

Update the \`name\` to distinguish the copy from the original. Common conventions:
- Append " — Copy" (e.g., \`"Q1 Search Campaign — Copy"\`)
- Append a date or variant label (e.g., \`"Q1 Search Campaign — Q2"\`)

Set \`status\` to \`"PAUSED"\` initially — enable after verifying the copy is correct.

---

## Step 4: Handle Campaign Budget (Campaign Duplication Only)

⚠️ **GOTCHA**: Campaigns cannot share a \`campaignBudget\` resource directly — each campaign needs its own budget resource or should link to an existing shared budget.

If duplicating a **campaign**, first create a new budget:

\`\`\`
Tool: gads_create_entity
Input: {
  "entityType": "campaignBudget",
  "customerId": "${customerId}",
  "data": {
    "name": "Q2 Search Campaign Budget — Copy",
    "amountMicros": "{original amountMicros}",
    "deliveryMethod": "STANDARD"
  }
}
\`\`\`

Save the returned resource name — you will reference it in the campaign creation step.

---

## Step 5: Create the Duplicate

Create the new entity with the cleaned payload:

### Duplicate a Campaign
\`\`\`
Tool: gads_create_entity
Input: {
  "entityType": "campaign",
  "customerId": "${customerId}",
  "data": {
    "name": "{original name} — Copy",
    "advertisingChannelType": "{original advertisingChannelType}",
    "status": "PAUSED",
    "campaignBudget": "customers/${customerId}/campaignBudgets/{newBudgetId}",
    "startDate": "{desired start date}",
    "networkSettings": "{original networkSettings}",
    "biddingStrategyType": "{original biddingStrategyType}"
  }
}
\`\`\`

### Duplicate an Ad Group
\`\`\`
Tool: gads_create_entity
Input: {
  "entityType": "adGroup",
  "customerId": "${customerId}",
  "data": {
    "name": "{original name} — Copy",
    "campaign": "customers/${customerId}/campaigns/{targetCampaignId}",
    "status": "PAUSED",
    "type": "{original type}",
    "cpcBidMicros": "{original cpcBidMicros}"
  }
}
\`\`\`

### Duplicate an Ad
\`\`\`
Tool: gads_create_entity
Input: {
  "entityType": "ad",
  "customerId": "${customerId}",
  "data": {
    "adGroup": "customers/${customerId}/adGroups/{targetAdGroupId}",
    "status": "PAUSED",
    "ad": {
      "responsiveSearchAd": {
        "headlines": "{original headlines}",
        "descriptions": "{original descriptions}"
      },
      "finalUrls": "{original finalUrls}"
    }
  }
}
\`\`\`

---

## Step 6: Duplicate Child Entities (if needed)

When duplicating a campaign or ad group, you may also want to copy its children:

1. **Campaign → Ad Groups**: List all ad groups under the source campaign, then duplicate each
2. **Ad Group → Ads**: List all ads under the source ad group, then duplicate each
3. **Ad Group → Keywords**: List all keywords under the source ad group, then duplicate each

\`\`\`
Tool: gads_list_entities
Input: {
  "entityType": "adGroup",
  "customerId": "${customerId}",
  "filters": {
    "ad_group.campaign": "= 'customers/${customerId}/campaigns/${sourceEntityId}'"
  }
}
\`\`\`

---

## Step 7: Verify the Duplicate

Confirm the new entity was created correctly:

\`\`\`
Tool: gads_list_entities
Input: {
  "entityType": "${entityType}",
  "customerId": "${customerId}"
}
\`\`\`

Review the new entity's name, status, and settings. Enable it when satisfied.

---

## Success Checklist

- [ ] Source entity fetched and saved
- [ ] ID/resource_name fields stripped from template
- [ ] Name updated to distinguish copy from original
- [ ] Status set to PAUSED for initial creation
- [ ] For campaigns: new budget created separately and linked
- [ ] New entity created via \`gads_create_entity\`
- [ ] Child entities duplicated if needed (ad groups, ads, keywords)
- [ ] Duplicate verified via \`gads_list_entities\`
- [ ] Duplicate enabled when ready

## Related Resources
- \`entity-schema://${entityType}\` — Full field reference for this entity type
- \`entity-hierarchy://gads\` — Entity parent-child relationships
- \`entity-examples://${entityType}\` — Example create payloads
`;
}
