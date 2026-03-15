// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const floodlightWorkflowPrompt: Prompt = {
  name: "cm360_floodlight_workflow",
  description:
    "Guide for setting up CM360 Floodlight conversion tracking",
  arguments: [
    {
      name: "profileId",
      description: "CM360 User Profile ID",
      required: true,
    },
    {
      name: "advertiserId",
      description: "CM360 Advertiser ID",
      required: true,
    },
  ],
};

export function getFloodlightWorkflowMessage(
  args?: Record<string, string>,
): string {
  const profileId = args?.profileId || "{profileId}";
  const advertiserId = args?.advertiserId || "{advertiserId}";
  return `# CM360 Floodlight Conversion Tracking Setup

## Profile ID: ${profileId}
## Advertiser ID: ${advertiserId}

Floodlight is CM360's conversion tracking system. It consists of:
- **Floodlight Configuration**: Account-level settings (one per advertiser)
- **Floodlight Activities**: Individual conversion events

## Step 1: Check Existing Configuration

\`\`\`json
{
  "tool": "cm360_list_entities",
  "params": {
    "profileId": "${profileId}",
    "entityType": "floodlightConfiguration",
    "advertiserId": "${advertiserId}"
  }
}
\`\`\`

## Step 2: List Existing Activities

\`\`\`json
{
  "tool": "cm360_list_entities",
  "params": {
    "profileId": "${profileId}",
    "entityType": "floodlightActivity",
    "advertiserId": "${advertiserId}"
  }
}
\`\`\`

## Step 3: Create a Floodlight Activity

\`\`\`json
{
  "tool": "cm360_create_entity",
  "params": {
    "profileId": "${profileId}",
    "entityType": "floodlightActivity",
    "advertiserId": "${advertiserId}",
    "data": {
      "name": "Purchase Confirmation",
      "floodlightConfigurationId": "FLOODLIGHT_CONFIG_ID",
      "floodlightActivityGroupName": "conversions",
      "floodlightTagType": "GLOBAL_SITE_TAG",
      "countingMethod": "STANDARD_COUNTING",
      "expectedUrl": "https://example.com/thank-you"
    }
  }
}
\`\`\`

## Step 4: Generate Tag

After creating the activity, generate and deploy the Floodlight tag on your website.

## Step 5: Run Floodlight Report

\`\`\`json
{
  "tool": "cm360_get_report",
  "params": {
    "profileId": "${profileId}",
    "reportType": "FLOODLIGHT",
    "dateRange": { "startDate": "2026-03-01", "endDate": "2026-03-12" },
    "dimensions": ["floodlightActivity", "campaign"],
    "metrics": ["totalConversions", "totalConversionsRevenue"]
  }
}
\`\`\`

## Counting Methods

| Method | Description |
|--------|-------------|
| STANDARD_COUNTING | Count every conversion |
| UNIQUE_COUNTING | One conversion per user per 24 hours |
| PER_INTERACTION_COUNTING | One per interaction |
| SESSION_COUNTING | One per session |

## Gotchas

| Issue | Solution |
|-------|----------|
| Floodlight config is per-advertiser | Can't create new configs, only modify existing |
| Activities can be deleted | Unlike campaigns, floodlight activities support delete |
| Tag type matters | GLOBAL_SITE_TAG for modern implementations |
| Lookback windows | Set at configuration level, not activity level |
`;
}