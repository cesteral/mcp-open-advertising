// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * AmazonDsp Entity Update Workflow Prompt
 *
 * Guides AI agents through safely updating Amazon DSP entities on the Unified
 * API (#234). Field updates and status changes both go to
 * `POST /adsApi/v1/update/{resource}`; `amazon_dsp_bulk_update_status` is the
 * batch form for state-only changes.
 */
export const amazonDspEntityUpdateWorkflowPrompt: Prompt = {
  name: "amazon_dsp_entity_update_workflow",
  description:
    "Step-by-step guide for safely updating Amazon DSP entities on the Unified API — field updates vs status changes, Unified budget shape, and verification.",
  arguments: [
    {
      name: "entityType",
      description: "Entity type to update: order, lineItem, creative, or creativeAssociation",
      required: true,
    },
    {
      name: "entityId",
      description: "ID of the entity to update (campaignId / adGroupId / adId / adAssociationId)",
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

export function getAmazonDspEntityUpdateWorkflowMessage(args?: Record<string, string>): string {
  const entityType = args?.entityType || "{entityType}";
  const entityId = args?.entityId || "{entityId}";
  const profileId = args?.profileId || "{profileId}";
  const accountId = args?.accountId || "{accountId}";

  return `# Amazon DSP Entity Update Workflow (Unified API)

Entity Type: \`${entityType}\`
Entity ID: \`${entityId}\`
Profile ID: \`${profileId}\`
Advertiser (accountId): \`${accountId}\`

---

## Step 1: Fetch Current State

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

Save the current values for rollback. Targets cannot be read by ID — list them with \`amazon_dsp_list_entities\` and \`filters.adGroupId\`.

**Resource reference:** \`entity-schema://amazonDsp/${entityType}\` (fields, read-only fields) and \`entity-examples://amazonDsp/${entityType}\`.

---

## Step 2: Update Entity Fields

\`amazon_dsp_update_entity\` sends \`POST /adsApi/v1/update/{resource}\` with \`[{ <id>: entityId, ...data }]\` — only the fields you send change. Pass \`dry_run: true\` first to see the validated payload's effect.

### Order (campaign)

\`\`\`json
{
  "tool": "amazon_dsp_update_entity",
  "params": {
    "entityType": "order",
    "profileId": "${profileId}",
    "accountId": "${accountId}",
    "entityId": "${entityId}",
    "data": {
      "name": "Updated Campaign Name",
      "budgets": [
        {
          "budgetType": "MONETARY",
          "budgetValue": { "monetaryBudgetValue": { "monetaryBudget": { "value": 5000 } } },
          "recurrenceTimePeriod": "LIFETIME"
        }
      ]
    }
  }
}
\`\`\`

### Line Item (ad group)

\`\`\`json
{
  "tool": "amazon_dsp_update_entity",
  "params": {
    "entityType": "lineItem",
    "profileId": "${profileId}",
    "accountId": "${accountId}",
    "entityId": "${entityId}",
    "data": {
      "name": "Updated Ad Group",
      "bid": { "baseBid": 2.5 },
      "optimization": { "bidStrategy": "SPEND_BUDGET_IN_FULL" }
    }
  }
}
\`\`\`

For bid-only changes across many line items, \`amazon_dsp_adjust_bids\` reads each ad group and sets \`bid.baseBid\`.

---

## Step 3: Update Status

\`\`\`json
{
  "tool": "amazon_dsp_bulk_update_status",
  "params": {
    "entityType": "${entityType}",
    "profileId": "${profileId}",
    "accountId": "${accountId}",
    "entityIds": ["${entityId}"],
    "operationStatus": "ENABLED"
  }
}
\`\`\`

Valid operationStatus values: \`"ENABLED"\`, \`"PAUSED"\`. ARCHIVED is not an update state on the Unified API.

---

## Step 4: Verify Changes

Re-run \`amazon_dsp_get_entity\` (Step 1) and compare. \`amazon_dsp_update_entity\` also returns \`before\` / \`after\` snapshots for orders and line items.

---

## Gotchas

- **Removal is permanent**: \`amazon_dsp_delete_entity\` deletes targets / creative associations and archives orders / line items through a legacy call — none of it can be undone.
- **Budget values are major currency units**, not micros; the currency is the advertiser account's.
- **Read-only fields are rejected**: IDs, \`creationDateTime\`, \`lastUpdatedDateTime\`, \`status\` and a campaign's \`startDateTime\` / \`endDateTime\` (set dates on \`flights[]\`).
- **Line items cannot change \`campaignId\` or \`inventoryType\`** (absent from the Unified ad group update).
- **Targets cannot be updated** — delete and recreate them.

---

## Rollback

Send the original values back with \`amazon_dsp_update_entity\`:

\`\`\`json
{
  "tool": "amazon_dsp_update_entity",
  "params": {
    "entityType": "${entityType}",
    "profileId": "${profileId}",
    "accountId": "${accountId}",
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
