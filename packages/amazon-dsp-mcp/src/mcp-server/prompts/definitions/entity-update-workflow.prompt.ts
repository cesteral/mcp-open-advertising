// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

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
      description: "Entity type to update: order, lineItem, or creative",
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

export function getAmazonDspEntityUpdateWorkflowMessage(args?: Record<string, string>): string {
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

Use \`amazon_dsp_update_entity\` for **field changes** (name, budget, bidding):

### Order Updates

\`\`\`json
{
  "tool": "amazon_dsp_update_entity",
  "params": {
    "entityType": "order",
    "profileId": "${profileId}",
    "entityId": "${entityId}",
    "data": {
      "name": "Updated Order Name",
      "budget": 5000
    }
  }
}
\`\`\`

### Line Item Updates

\`\`\`json
{
  "tool": "amazon_dsp_update_entity",
  "params": {
    "entityType": "lineItem",
    "profileId": "${profileId}",
    "entityId": "${entityId}",
    "data": {
      "name": "Updated Line Item",
      "budget": { "budgetType": "DAILY", "budget": 1000 },
      "bidding": {
        "bidOptimization": "MANUAL",
        "bidAmount": 2.50
      }
    }
  }
}
\`\`\`

### Creative Updates

\`\`\`json
{
  "tool": "amazon_dsp_update_entity",
  "params": {
    "entityType": "creative",
    "profileId": "${profileId}",
    "entityId": "${entityId}",
    "data": {
      "name": "Updated Creative Name",
      "clickThroughUrl": "https://example.com/new-landing-page"
    }
  }
}
\`\`\`

---

## Step 3: Update Status (via state field)

⚠️ **GOTCHA**: Amazon DSP uses the \`state\` field in the entity body to change delivery status. Use \`amazon_dsp_bulk_update_status\` for batch status changes:

\`\`\`json
{
  "tool": "amazon_dsp_bulk_update_status",
  "params": {
    "entityType": "${entityType}",
    "profileId": "${profileId}",
    "entityIds": ["${entityId}"],
    "operationStatus": "ENABLED"
  }
}
\`\`\`

Valid operationStatus values: \`"ENABLED"\`, \`"PAUSED"\`, \`"ARCHIVED"\`

---

## Step 4: Verify Changes

After the update call succeeds, verify the changes:

\`\`\`json
{
  "tool": "amazon_dsp_get_entity",
  "params": {
    "entityType": "${entityType}",
    "advertiserId": "${profileId}",
    "entityId": "${entityId}"
  }
}
\`\`\`

---

## Gotchas

- **Archive is permanent**: Setting \`state: "ARCHIVED"\` via \`amazon_dsp_delete_entity\` cannot be undone — there is no DELETE endpoint, only soft-archive.
- **Budget values are numeric, not micros**: confirm the advertiser account currency before assuming USD semantics.
- **Line item budget cannot exceed order budget**: Validate parent order budget before updating.
- **Creative updates may trigger re-review**: Updating creative assets or click URLs may restart review cycles.

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
