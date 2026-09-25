// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * Pinterest Entity Duplication Workflow Prompt
 *
 * Guides AI agents through duplicating a campaign. Only campaigns support
 * duplication (`supportsDuplicate` in entity-mapping.ts), and the copy is the
 * campaign object alone: its ad groups and ads are not copied.
 */
export const pinterestEntityDuplicationWorkflowPrompt: Prompt = {
  name: "pinterest_entity_duplication_workflow",
  description:
    "Step-by-step guide for duplicating a Pinterest Ads campaign with pinterest_duplicate_entity: only campaigns can be copied, the copy keeps the source status unless overridden, and ad groups and ads are not copied.",
  arguments: [
    {
      name: "entityType",
      description: "Entity type to duplicate. Only campaign is supported.",
      required: true,
    },
    {
      name: "entityId",
      description: "Numeric ID of the entity to duplicate",
      required: true,
    },
    {
      name: "adAccountId",
      description: "Pinterest ad account ID",
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
Ad account ID: \`${adAccountId}\`

---

## Overview

\`pinterest_duplicate_entity\` copies a **campaign**. It is the only entity type that supports duplication, and the tool rejects \`adGroup\`, \`ad\` and \`creative\`.

Pinterest v5 has no copy API, so the server reads the source campaign, drops the system fields (\`id\`, \`created_time\`, \`updated_time\`, \`ad_account_id\`) and creates a new campaign from the rest. Anything in \`options\` is merged over the copy before it is created.

The copy keeps the campaign's objective, spend caps, schedule and status. **Its ad groups and ads are not copied.** The new campaign starts empty, and you build its ad groups and ads yourself.

⚠️ **CRITICAL GOTCHA: the copy keeps the source's status.** Duplicating an ACTIVE campaign creates an ACTIVE campaign. Pass \`"status": "PAUSED"\` in \`options\` unless you want it live immediately.

---

## Step 1: Review the source campaign

\`\`\`json
{
  "tool": "pinterest_get_entity",
  "params": {
    "entityType": "campaign",
    "adAccountId": "${adAccountId}",
    "entityId": "${entityId}"
  }
}
\`\`\`

Confirm it is the right campaign. Note its \`objective_type\`, spend caps and \`start_time\` / \`end_time\` (Unix seconds). A copy with an \`end_time\` in the past will not deliver.

---

## Step 2: Duplicate it, paused

\`\`\`json
{
  "tool": "pinterest_duplicate_entity",
  "params": {
    "entityType": "campaign",
    "adAccountId": "${adAccountId}",
    "entityId": "${entityId}",
    "options": {
      "name": "Copy of campaign ${entityId}",
      "status": "PAUSED"
    }
  }
}
\`\`\`

\`options\` keys are Pinterest campaign field names and go into the create request as they are, so only use real fields (\`name\`, \`status\`, \`daily_spend_cap\`, \`lifetime_spend_cap\`, \`start_time\`, \`end_time\`, …). The response includes the new campaign and its id.

Run it with \`"dry_run": true\` first to see the projected copy without creating anything.

---

## Step 3: Adjust the copy

Money is integer micro-currency, and times are Unix seconds.

\`\`\`json
{
  "tool": "pinterest_update_entity",
  "params": {
    "entityType": "campaign",
    "adAccountId": "${adAccountId}",
    "entityId": "{newCampaignId}",
    "data": {
      "daily_spend_cap": 150000000,
      "end_time": 1782863999
    }
  }
}
\`\`\`

\`150000000\` = 150.00 in the account currency. \`1782863999\` = 2026-06-30 23:59:59 UTC. \`objective_type\` can only change while a campaign is a draft.

---

## Step 4: Rebuild the ad groups and ads

Read the source campaign's ad groups (and then each ad group's ads, with \`entityType: "ad"\` and \`adGroupId\`):

\`\`\`json
{
  "tool": "pinterest_list_entities",
  "params": {
    "entityType": "adGroup",
    "adAccountId": "${adAccountId}",
    "campaignId": "${entityId}"
  }
}
\`\`\`

Then create each one under the new campaign with \`pinterest_create_entity\` or \`pinterest_bulk_create_entities\`:
- **Ad group**: copy \`name\`, \`billable_event\`, \`budget_in_micro_currency\`, \`budget_type\`, \`bid_strategy_type\`, \`bid_in_micro_currency\` and \`targeting_spec\`. Set \`campaign_id\` to the new campaign and \`status\` to \`PAUSED\`.
- **Ad**: copy \`creative_type\`, \`pin_id\`, \`name\` and \`destination_url\`. Set \`ad_group_id\` to the new ad group and \`status\` to \`PAUSED\`.

Pins are reusable, so a rebuilt ad can promote the same \`pin_id\` as the original.

---

## Step 5: Activate when ready

\`\`\`json
{
  "tool": "pinterest_bulk_update_status",
  "params": {
    "entityType": "campaign",
    "adAccountId": "${adAccountId}",
    "entityIds": ["{newCampaignId}"],
    "operationStatus": "ACTIVE"
  }
}
\`\`\`

Activate the new ad groups and ads the same way.

---

## Common Patterns

### A/B test on targeting
1. Duplicate the campaign, paused
2. Rebuild the ad groups under the copy with a different \`targeting_spec\` (UPPERCASE keys, see \`pinterest_targeting_discovery_workflow\`)
3. Activate both campaigns and compare with \`pinterest_get_report\`

### Creative test
You don't need a new campaign. Create a Pin with the alternative image or video (see the \`creative_upload_workflow\` prompt), then create a second ad in the same ad group with the new \`pin_id\`. An ad's creative is its Pin, so a creative test means a different \`pin_id\`, not an edited ad.

---

## Success Criteria

- [ ] Source campaign reviewed before duplication
- [ ] Copy created with \`"status": "PAUSED"\` (it keeps the source's status otherwise)
- [ ] Copy renamed to distinguish it from the original
- [ ] Schedule and spend caps checked on the copy
- [ ] Ad groups and ads rebuilt under the copy, paused
- [ ] Activated only after review
`;
}
