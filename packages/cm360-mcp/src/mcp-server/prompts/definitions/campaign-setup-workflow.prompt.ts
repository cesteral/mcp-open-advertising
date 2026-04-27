// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const campaignSetupWorkflowPrompt: Prompt = {
  name: "cm360_campaign_setup_workflow",
  description: "Step-by-step guide for creating a complete CM360 campaign structure",
  arguments: [
    {
      name: "profileId",
      description: "CM360 User Profile ID (from cm360_list_user_profiles)",
      required: true,
    },
    {
      name: "advertiserId",
      description: "CM360 Advertiser ID",
      required: true,
    },
  ],
};

export function getCampaignSetupWorkflowMessage(args?: Record<string, string>): string {
  const profileId = args?.profileId || "{profileId}";
  const advertiserId = args?.advertiserId || "{advertiserId}";
  return `# CM360 Campaign Setup Workflow

## Prerequisites
- Profile ID: ${profileId} (use \`cm360_list_user_profiles\` to discover)
- Advertiser ID: ${advertiserId}
- Fetch \`entity-hierarchy://all\` for entity relationships

## Hierarchy
\`\`\`
Account
  └── Advertiser (${advertiserId})
        └── Campaign
              └── Placement (requires Site)
                    └── Ad (references Creative)
\`\`\`

## Step 1: Verify Advertiser Access

\`\`\`json
{
  "tool": "cm360_get_entity",
  "params": {
    "profileId": "${profileId}",
    "entityType": "advertiser",
    "entityId": "${advertiserId}"
  }
}
\`\`\`

## Step 2: Create or Verify Site

Placements require a site. List existing sites or create one:

\`\`\`json
{
  "tool": "cm360_list_entities",
  "params": {
    "profileId": "${profileId}",
    "entityType": "site",
    "advertiserId": "${advertiserId}"
  }
}
\`\`\`

## Step 3: Create Campaign

\`\`\`json
{
  "tool": "cm360_create_entity",
  "params": {
    "profileId": "${profileId}",
    "entityType": "campaign",
    "advertiserId": "${advertiserId}",
    "data": {
      "name": "My Campaign",
      "advertiserId": "${advertiserId}",
      "startDate": "2026-04-01",
      "endDate": "2026-06-30"
    }
  }
}
\`\`\`

## Step 4: Create Placement

\`\`\`json
{
  "tool": "cm360_create_entity",
  "params": {
    "profileId": "${profileId}",
    "entityType": "placement",
    "advertiserId": "${advertiserId}",
    "data": {
      "name": "My Placement",
      "campaignId": "CAMPAIGN_ID",
      "siteId": "SITE_ID",
      "compatibility": "DISPLAY",
      "size": { "width": 300, "height": 250 },
      "paymentSource": "PLACEMENT_AGENCY_PAID",
      "tagFormats": ["PLACEMENT_TAG_STANDARD"]
    }
  }
}
\`\`\`

## Step 5: Create Creative

\`\`\`json
{
  "tool": "cm360_create_entity",
  "params": {
    "profileId": "${profileId}",
    "entityType": "creative",
    "advertiserId": "${advertiserId}",
    "data": {
      "name": "My Creative",
      "advertiserId": "${advertiserId}",
      "type": "DISPLAY",
      "size": { "width": 300, "height": 250 }
    }
  }
}
\`\`\`

## Step 6: Create Ad (Link Creative to Placement)

\`\`\`json
{
  "tool": "cm360_create_entity",
  "params": {
    "profileId": "${profileId}",
    "entityType": "ad",
    "advertiserId": "${advertiserId}",
    "data": {
      "name": "My Ad",
      "campaignId": "CAMPAIGN_ID",
      "placementAssignments": [{ "placementId": "PLACEMENT_ID", "active": true }],
      "creativeAssignments": [{ "creativeId": "CREATIVE_ID", "active": true }],
      "active": true,
      "type": "AD_SERVING_STANDARD_AD"
    }
  }
}
\`\`\`

## Step 7: Verify

List all entities to confirm structure:
\`\`\`json
{
  "tool": "cm360_list_entities",
  "params": {
    "profileId": "${profileId}",
    "entityType": "ad",
    "advertiserId": "${advertiserId}",
    "campaignId": "CAMPAIGN_ID"
  }
}
\`\`\`

## Gotchas

| Issue | Solution |
|-------|----------|
| Placement requires a site | Create or reuse site first |
| Ad requires both placement and creative | Create both before linking |
| Creative size must match placement size | Ensure width/height are identical |
| Updates use PUT semantics | Fetch full object before updating |
| Only creative + floodlightActivity can be deleted | Other entities: archive/deactivate |
`;
}
