// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * Entity Activation Workflow Prompt
 *
 * Guides AI agents through the safe activation sequence for DV360 entities.
 * Critical ordering: IO → Line Items → Campaign.
 */
export const entityActivationPrompt: Prompt = {
  name: "entity_activation_workflow",
  description:
    "Safe step-by-step guide for activating DV360 entities in the correct order: validate budgets, activate Insertion Orders first, then Line Items, then Campaign. Includes pre-flight checks and rollback guidance.",
  arguments: [
    {
      name: "advertiserId",
      description: "DV360 Advertiser ID",
      required: true,
    },
    {
      name: "campaignId",
      description: "Campaign ID to activate (or whose children to activate)",
      required: true,
    },
  ],
};

export function getEntityActivationPromptMessage(
  args?: Record<string, string>,
): string {
  const advertiserId = args?.advertiserId || "{advertiserId}";
  const campaignId = args?.campaignId || "{campaignId}";

  return `# DV360 Entity Activation Workflow

Advertiser: \`${advertiserId}\`
Campaign: \`${campaignId}\`

---

## Why Order Matters

DV360 enforces a strict entity hierarchy:

\`\`\`
Campaign (PAUSED or ACTIVE — never DRAFT)
  └── Insertion Order (must be ACTIVE before children can serve)
        └── Line Item(s) (must be ACTIVE to serve)
              └── Targeting Options
\`\`\`

**Activation must proceed bottom-up within each IO**: IO first, then its Line Items. The Campaign can be activated last (or may already be ACTIVE if created in PAUSED state).

**Deactivation is the reverse**: Campaign first (or skip), then Line Items, then IO.

---

## Step 1: Pre-Flight Validation

### 1a. Fetch Campaign and Children

\`\`\`json
{
  "tool": "dv360_get_entity",
  "params": {
    "entityType": "campaign",
    "advertiserId": "${advertiserId}",
    "campaignId": "${campaignId}"
  }
}
\`\`\`

\`\`\`json
{
  "tool": "dv360_list_entities",
  "params": {
    "entityType": "insertionOrder",
    "advertiserId": "${advertiserId}",
    "campaignId": "${campaignId}"
  }
}
\`\`\`

For each IO, list its line items:

\`\`\`json
{
  "tool": "dv360_list_entities",
  "params": {
    "entityType": "lineItem",
    "advertiserId": "${advertiserId}",
    "insertionOrderId": "{ioId}"
  }
}
\`\`\`

### 1b. Validate Budget Hierarchy

Check that budgets are consistent:

- **Campaign budget** ≥ sum of all IO budgets
- **IO budget** ≥ sum of its Line Item budgets
- All budget amounts and date ranges are correctly configured

### 1c. Validate Targeting

Run the targeting validation tool to catch issues before activation:

\`\`\`json
{
  "tool": "dv360_validate_targeting_config",
  "params": {
    "advertiserId": "${advertiserId}",
    "insertionOrderIds": ["{ioId1}", "{ioId2}"],
    "lineItemIds": ["{liId1}", "{liId2}"]
  }
}
\`\`\`

Fix any **error**-severity issues before proceeding. **Warning**-severity issues should be reviewed but don't block activation.

### 1d. Pre-Flight Checklist

- [ ] Campaign exists and is in PAUSED or ACTIVE status
- [ ] All IOs are in DRAFT status (ready to activate)
- [ ] All Line Items are in DRAFT status (ready to activate)
- [ ] Budget hierarchy is valid (Campaign ≥ IO ≥ Line Items)
- [ ] Flight dates are set and not in the past
- [ ] Targeting validation has no error-severity issues
- [ ] Creatives are assigned to Line Items (if applicable)

---

## Step 2: Activate Insertion Orders

Activate each IO from DRAFT → ACTIVE:

\`\`\`json
{
  "tool": "dv360_update_entity",
  "params": {
    "entityType": "insertionOrder",
    "advertiserId": "${advertiserId}",
    "insertionOrderId": "{ioId}",
    "data": {
      "entityStatus": "ENTITY_STATUS_ACTIVE"
    },
    "updateMask": "entityStatus"
  }
}
\`\`\`

For multiple IOs, use bulk:

\`\`\`json
{
  "tool": "dv360_bulk_update_status",
  "params": {
    "entityType": "insertionOrder",
    "advertiserId": "${advertiserId}",
    "entityIds": ["{ioId1}", "{ioId2}"],
    "status": "ENTITY_STATUS_ACTIVE",
    "reason": "Activating IOs for campaign launch"
  }
}
\`\`\`

### Verify IO Activation

\`\`\`json
{
  "tool": "dv360_get_entity",
  "params": {
    "entityType": "insertionOrder",
    "advertiserId": "${advertiserId}",
    "insertionOrderId": "{ioId}"
  }
}
\`\`\`

Confirm \`entityStatus\` is \`ENTITY_STATUS_ACTIVE\` before proceeding.

⚠️ **GOTCHA**: Wait 5-10 seconds after IO activation before activating Line Items. DV360 has eventual consistency delays.

---

## Step 3: Activate Line Items

Once IOs are active, activate their Line Items:

\`\`\`json
{
  "tool": "dv360_bulk_update_status",
  "params": {
    "entityType": "lineItem",
    "advertiserId": "${advertiserId}",
    "entityIds": ["{liId1}", "{liId2}", "{liId3}"],
    "status": "ENTITY_STATUS_ACTIVE",
    "reason": "Activating line items for campaign launch"
  }
}
\`\`\`

### Verify Line Item Activation

Check the results for any failures. Common failure reasons:
- Parent IO not yet active (wait and retry)
- Missing required fields (bid strategy, pacing, frequency cap)
- Invalid targeting configuration

---

## Step 4: Activate Campaign (If Needed)

If the campaign was created as PAUSED, activate it last:

\`\`\`json
{
  "tool": "dv360_update_entity",
  "params": {
    "entityType": "campaign",
    "advertiserId": "${advertiserId}",
    "campaignId": "${campaignId}",
    "data": {
      "entityStatus": "ENTITY_STATUS_ACTIVE"
    },
    "updateMask": "entityStatus"
  }
}
\`\`\`

⚠️ **GOTCHA**: Campaigns cannot use DRAFT status. They must be either PAUSED or ACTIVE. If the campaign is already ACTIVE, skip this step.

---

## Step 5: Post-Activation Monitoring

After activation, monitor delivery:

1. Wait 2-4 hours for delivery to ramp up
2. Check pacing via **dbm-mcp**: \`dbm_get_pacing_status\`
3. Check performance via **dbm-mcp**: \`dbm_get_performance_metrics\`

If delivery is not starting after 4 hours, invoke the \`troubleshoot_underdelivery\` prompt.

---

## Rollback: Emergency Deactivation

If you need to quickly pause everything:

### Quick Pause (Campaign Level)

Pausing the campaign effectively stops all delivery (children inherit paused state):

\`\`\`json
{
  "tool": "dv360_update_entity",
  "params": {
    "entityType": "campaign",
    "advertiserId": "${advertiserId}",
    "campaignId": "${campaignId}",
    "data": {
      "entityStatus": "ENTITY_STATUS_PAUSED"
    },
    "updateMask": "entityStatus"
  }
}
\`\`\`

### Granular Rollback (Individual Entities)

To pause specific line items without affecting the whole campaign:

\`\`\`json
{
  "tool": "dv360_bulk_update_status",
  "params": {
    "entityType": "lineItem",
    "advertiserId": "${advertiserId}",
    "entityIds": ["{liId1}", "{liId2}"],
    "status": "ENTITY_STATUS_PAUSED",
    "reason": "Emergency pause due to {reason}"
  }
}
\`\`\`

---

## Activation Summary Template

| Entity | ID | Previous Status | New Status | Result |
|--------|----|----------------|------------|--------|
| Campaign | ${campaignId} | {status} | ACTIVE | {ok/skip} |
| IO | {ioId} | DRAFT | ACTIVE | {ok/fail} |
| Line Item | {liId} | DRAFT | ACTIVE | {ok/fail} |

**Total activated:** {n} IOs, {n} Line Items
**Delivery expected by:** {timestamp + 4 hours}
`;
}