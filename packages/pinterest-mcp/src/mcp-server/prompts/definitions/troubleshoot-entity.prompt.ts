// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const pinterestTroubleshootEntityPrompt: Prompt = {
  name: "pinterest_troubleshoot_entity",
  description: "Diagnostic workflow for troubleshooting Pinterest Ads entity issues",
  arguments: [
    {
      name: "entityType",
      description: "Entity type (campaign, adGroup, ad, creative)",
      required: true,
    },
    {
      name: "entityId",
      description: "Numeric entity ID to troubleshoot",
      required: true,
    },
    {
      name: "adAccountId",
      description: "Pinterest ad account ID",
      required: true,
    },
  ],
};

export function getPinterestTroubleshootEntityMessage(args?: Record<string, string>): string {
  const entityType = args?.entityType || "{entityType}";
  const entityId = args?.entityId || "{entityId}";
  const adAccountId = args?.adAccountId || "{adAccountId}";

  return `# Pinterest Entity Troubleshoot Workflow

## Target: ${entityType} ${entityId} (ad account: ${adAccountId})

## Step 1: Fetch the entity

\`\`\`json
pinterest_get_entity({
  "entityType": "${entityType}",
  "adAccountId": "${adAccountId}",
  "entityId": "${entityId}"
})
\`\`\`

Check these fields:

| Entity | Fields |
|--------|--------|
| campaign | \`status\` (the setting you control: \`ACTIVE\`, \`PAUSED\`, \`ARCHIVED\`, \`DRAFT\`, \`DELETED_DRAFT\`), \`summary_status\` (the delivery state: \`RUNNING\`, \`PAUSED\`, \`NOT_STARTED\`, \`COMPLETED\`, \`ADVERTISER_DISABLED\`, \`ARCHIVED\`, \`DRAFT\`, \`DELETED_DRAFT\`), \`start_time\` / \`end_time\` (Unix seconds), \`daily_spend_cap\` / \`lifetime_spend_cap\` (micros) |
| adGroup | \`status\`, \`summary_status\` (same values as campaign), \`budget_in_micro_currency\`, \`bid_in_micro_currency\`, \`bid_strategy_type\`, \`targeting_spec\`, \`start_time\` / \`end_time\` |
| ad | \`status\`, \`review_status\` (\`PENDING\`, \`APPROVED\`, \`REJECTED\`, \`OTHER\`), \`rejected_reasons\`, \`rejection_labels\`, \`summary_status\` (\`APPROVED\`, \`PAUSED\`, \`PENDING\`, \`REJECTED\`, \`ADVERTISER_DISABLED\`, \`ARCHIVED\`, \`DRAFT\`, \`DELETED_DRAFT\`), \`pin_id\` |
| creative (Pin) | \`media\`, \`link\`, \`board_id\`. A Pin has no ad status. Check the ads that promote it. |

## Step 2: Check recent performance

\`\`\`json
pinterest_get_report({
  "adAccountId": "${adAccountId}",
  "type": "CAMPAIGN",
  "columns": ["CAMPAIGN_ID", "IMPRESSION_1", "CLICKTHROUGH_1", "SPEND_IN_DOLLAR", "TOTAL_CONVERSIONS"],
  "campaignIds": ["{campaign_id}"],
  "granularity": "DAY",
  "datePreset": "LAST_7_DAYS"
})
\`\`\`

Use \`type: "AD_GROUP"\` with \`adGroupIds\`, or \`type: "AD"\` with \`adIds\`, to narrow to the entity itself.

## Step 3: Check the parents

An ad group or ad only delivers when its parents do. Read the ad group (\`campaign_id\` is on it) and the campaign:

\`\`\`json
pinterest_get_entity({
  "entityType": "campaign",
  "adAccountId": "${adAccountId}",
  "entityId": "{campaign_id}"
})
\`\`\`

## Common Issues

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| No delivery, \`status: PAUSED\` | Entity paused | Set \`status\` to \`ACTIVE\` |
| No delivery, entity \`ACTIVE\` | Parent campaign or ad group paused | Activate the parent |
| \`summary_status: NOT_STARTED\` | \`start_time\` is in the future | Wait, or move \`start_time\` |
| \`summary_status: COMPLETED\` | \`end_time\` has passed or the lifetime budget is spent | Extend \`end_time\` or raise the budget |
| \`summary_status: ADVERTISER_DISABLED\` | Account-level problem, such as billing | Resolve it in Pinterest Ads Manager. No tool here can fix it. |
| Ad \`review_status: PENDING\` | Pinterest ad review in progress | Wait for review |
| Ad \`review_status: REJECTED\` | Policy violation | Read \`rejected_reasons\` and \`rejection_labels\`, then fix the Pin or create a new ad |
| Budget looks 1,000,000× too big or small | Micros misread | Money fields are micro-currency: \`50000000\` = 50.00 |
| Low reach | Narrow \`targeting_spec\` | Check the delivery estimate (Step 4) and broaden it |
| \`status: ARCHIVED\` | Entity was archived | Archiving is permanent. Duplicate the campaign or create a new entity. |

## Step 4: Delivery estimate

\`\`\`json
pinterest_get_delivery_estimate({
  "adAccountId": "${adAccountId}",
  "targetingConfig": { "LOCATION": ["US"], "AGE_BUCKET": ["25-34"], "GENDER": ["female"] }
})
\`\`\`

Pass the ad group's \`targeting_spec\` as \`targetingConfig\`. Keys are UPPERCASE.

## Status changes

Status is an ordinary field on Pinterest's PATCH endpoints, so either tool works:

\`\`\`json
pinterest_update_entity({
  "entityType": "${entityType}",
  "adAccountId": "${adAccountId}",
  "entityId": "${entityId}",
  "data": { "status": "ACTIVE" }
})
\`\`\`

\`\`\`json
pinterest_bulk_update_status({
  "entityType": "${entityType}",
  "adAccountId": "${adAccountId}",
  "entityIds": ["${entityId}"],
  "operationStatus": "ACTIVE"
})
\`\`\`

These apply to campaigns, ad groups and ads. A Pin has no status.
`;
}
