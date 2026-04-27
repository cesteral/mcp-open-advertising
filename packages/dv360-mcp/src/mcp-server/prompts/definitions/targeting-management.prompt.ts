// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * Targeting Management Workflow Prompt
 *
 * Guides AI agents through discovering, creating, auditing, and managing
 * DV360 targeting options across Insertion Orders, Line Items, and Ad Groups.
 */
export const targetingManagementPrompt: Prompt = {
  name: "targeting_management_workflow",
  description:
    "Step-by-step guide for managing DV360 targeting options: discover available types, create assignments, audit configurations, and delete options. Covers geo, audience, device, content, and all 49 targeting types.",
  arguments: [
    {
      name: "advertiserId",
      description: "DV360 Advertiser ID",
      required: true,
    },
    {
      name: "parentType",
      description: "Parent entity type: insertionOrder, lineItem, or adGroup (default: lineItem)",
      required: false,
    },
    {
      name: "goal",
      description:
        "What you want to do: 'create', 'audit', 'remove', or 'discover' (default: discover)",
      required: false,
    },
  ],
};

export function getTargetingManagementPromptMessage(args?: Record<string, string>): string {
  const advertiserId = args?.advertiserId || "{advertiserId}";
  const parentType = args?.parentType || "lineItem";
  const goal = args?.goal || "discover";

  return `# DV360 Targeting Management Workflow

Advertiser: \`${advertiserId}\`
Parent Entity Type: \`${parentType}\`
Goal: \`${goal}\`

---

## Step 1: Discover Available Targeting Types

Fetch the targeting types reference to understand what's available:

**Resource:** \`targeting-types://\`

This returns all **49 targeting types** grouped by category:
- **Audience**: age range, gender, household income, parental status, custom audiences
- **Geographic**: geo region, regional location list, proximity location
- **Content**: channel, keyword, URL, category, digital content label
- **Device**: device type, device make/model, operating system, browser, environment
- **Inventory**: exchange, sub-exchange, authorized seller status
- **Viewability**: viewability (Active View thresholds)
- **Day & Time**: day and time scheduling

Each targeting type includes which parent entity types support it (insertionOrder, lineItem, adGroup).

---

## Step 2: Get Schema for Specific Targeting Type

Before creating a targeting option, fetch its schema:

**Resource:** \`targeting-schema://{targetingType}\`

Example: \`targeting-schema://TARGETING_TYPE_GEO_REGION\`

This returns:
- JSON Schema with all fields and constraints
- Example payload for the \`data\` parameter
- Documentation links

---

## Step 3: List Current Targeting (Audit Existing)

Check what targeting is already assigned:

\`\`\`json
{
  "tool": "dv360_list_assigned_targeting",
  "params": {
    "parentType": "${parentType}",
    "advertiserId": "${advertiserId}",
    "${parentType}Id": "{entityId}",
    "targetingType": "TARGETING_TYPE_GEO_REGION"
  }
}
\`\`\`

Repeat for each targeting type you want to audit. Common types to check:
- \`TARGETING_TYPE_GEO_REGION\` — Geographic targeting
- \`TARGETING_TYPE_CHANNEL\` — Channel inclusion/exclusion
- \`TARGETING_TYPE_KEYWORD\` — Keyword targeting
- \`TARGETING_TYPE_DIGITAL_CONTENT_LABEL_EXCLUSION\` — Brand safety
- \`TARGETING_TYPE_SENSITIVE_CATEGORY_EXCLUSION\` — Sensitive content exclusion

---

## Step 4: Create Targeting Options

After fetching the schema from Step 2, create targeting:

### Example: Geographic Targeting (Geo Region)

\`\`\`json
{
  "tool": "dv360_create_assigned_targeting",
  "params": {
    "parentType": "${parentType}",
    "advertiserId": "${advertiserId}",
    "${parentType}Id": "{entityId}",
    "targetingType": "TARGETING_TYPE_GEO_REGION",
    "data": {
      "geoRegionDetails": {
        "targetingOptionId": "2840",
        "negative": false
      }
    }
  }
}
\`\`\`

### Example: Channel Exclusion

\`\`\`json
{
  "tool": "dv360_create_assigned_targeting",
  "params": {
    "parentType": "insertionOrder",
    "advertiserId": "${advertiserId}",
    "insertionOrderId": "{ioId}",
    "targetingType": "TARGETING_TYPE_CHANNEL",
    "data": {
      "channelDetails": {
        "channelId": "{channelId}",
        "negative": true
      }
    }
  }
}
\`\`\`

### Example: Day & Time Scheduling

\`\`\`json
{
  "tool": "dv360_create_assigned_targeting",
  "params": {
    "parentType": "lineItem",
    "advertiserId": "${advertiserId}",
    "lineItemId": "{lineItemId}",
    "targetingType": "TARGETING_TYPE_DAY_AND_TIME",
    "data": {
      "dayAndTimeDetails": {
        "dayOfWeek": "MONDAY",
        "startHour": 9,
        "endHour": 17,
        "timeZoneResolution": "TIME_ZONE_RESOLUTION_END_USER"
      }
    }
  }
}
\`\`\`

---

## Step 5: Validate Targeting Configuration

Use the validation tool to audit targeting across multiple entities:

\`\`\`json
{
  "tool": "dv360_validate_targeting_config",
  "params": {
    "advertiserId": "${advertiserId}",
    "insertionOrderIds": ["{ioId1}", "{ioId2}"],
    "lineItemIds": ["{liId1}", "{liId2}"],
    "targetingTypesToCheck": [
      "TARGETING_TYPE_CHANNEL",
      "TARGETING_TYPE_GEO_REGION",
      "TARGETING_TYPE_DIGITAL_CONTENT_LABEL_EXCLUSION",
      "TARGETING_TYPE_SENSITIVE_CATEGORY_EXCLUSION"
    ]
  }
}
\`\`\`

Review the \`issues\` array in the response. Issues are classified by severity:
- **error** — Must fix before launch (e.g., no geo targeting on a line item)
- **warning** — Should review (e.g., broad targeting with no exclusions)
- **info** — Informational (e.g., inherited targeting from parent)

---

## Step 6: Delete Targeting Options

To remove a targeting option, you need the \`assignedTargetingOptionId\` from Step 3:

\`\`\`json
{
  "tool": "dv360_delete_assigned_targeting",
  "params": {
    "parentType": "${parentType}",
    "advertiserId": "${advertiserId}",
    "${parentType}Id": "{entityId}",
    "targetingType": "TARGETING_TYPE_GEO_REGION",
    "assignedTargetingOptionId": "{optionId}"
  }
}
\`\`\`

⚠️ **WARNING**: Deletion is irreversible. Always list targeting options first to confirm the correct \`assignedTargetingOptionId\`.

---

## Common Targeting Scenarios

### Brand Safety Setup
1. Add \`TARGETING_TYPE_DIGITAL_CONTENT_LABEL_EXCLUSION\` to exclude sensitive content labels
2. Add \`TARGETING_TYPE_SENSITIVE_CATEGORY_EXCLUSION\` to exclude sensitive categories
3. Add \`TARGETING_TYPE_CHANNEL\` with \`negative: true\` for channel exclusions
4. Validate with \`dv360_validate_targeting_config\`

### Geographic Campaign
1. Add \`TARGETING_TYPE_GEO_REGION\` for country/region/city targeting
2. Add \`TARGETING_TYPE_LANGUAGE\` for language targeting
3. Consider \`TARGETING_TYPE_DAY_AND_TIME\` for timezone-appropriate scheduling

### Audience-Based Campaign
1. Add \`TARGETING_TYPE_AGE_RANGE\` for age demographics
2. Add \`TARGETING_TYPE_GENDER\` for gender targeting
3. Add \`TARGETING_TYPE_HOUSEHOLD_INCOME\` if relevant
4. Add first-party audiences via \`TARGETING_TYPE_AUDIENCE_GROUP\`

---

## Gotchas

- **Targeting inheritance**: IOs pass targeting down to Line Items. Check IO-level targeting before adding at Line Item level to avoid conflicts.
- **Negative targeting**: Set \`negative: true\` in the detail object to exclude (not include) a targeting option.
- **targetingOptionId vs channelId**: Geo regions and languages use \`targetingOptionId\` (a DV360-assigned ID). Channels use \`channelId\`. Check the schema for each type.
- **Parent support varies**: Not all targeting types work on all parent types. The \`targeting-types://\` resource shows \`supportedParents\` for each type.
- **One option per create call**: Each \`dv360_create_assigned_targeting\` call creates one targeting option. For multiple options, call the tool repeatedly.
`;
}
