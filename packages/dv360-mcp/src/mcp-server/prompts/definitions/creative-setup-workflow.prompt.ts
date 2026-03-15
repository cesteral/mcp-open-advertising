// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const dv360CreativeSetupWorkflowPrompt: Prompt = {
  name: "creative_setup_workflow",
  description: "Step-by-step guide for creating DV360 display and video creatives",
  arguments: [
    {
      name: "advertiserId",
      description: "DV360 Advertiser ID",
      required: true,
    },
  ],
};

export function getDv360CreativeSetupWorkflowMessage(args?: Record<string, string>): string {
  const advertiserId = args?.advertiserId || "{advertiserId}";

  return `# DV360 Creative Setup Workflow

## Prerequisites
- Advertiser ID: \`${advertiserId}\`
- Hosted creative assets (images/videos) or VAST/VPAID tags

## Overview
DV360 uses **creatives** that are attached to line items via **assignments**.
Creative types: DISPLAY, VIDEO, RICH_MEDIA, NATIVE, AUDIO

---

## Step 1: Explore Supported Creative Types

Fetch the entity schema to understand required fields:

\`\`\`
entity-schema://creative
\`\`\`

Or check examples:
\`\`\`
entity-examples://creative
\`\`\`

## Step 2: Create a Display Creative (HTML5 or Image)

\`\`\`json
dv360_create_entity({
  "entityType": "creative",
  "advertiserId": "${advertiserId}",
  "data": {
    "displayName": "Summer Banner 300x250",
    "entityStatus": "ENTITY_STATUS_DRAFT",
    "creativeType": "CREATIVE_TYPE_STANDARD",
    "hostingSource": "HOSTING_SOURCE_HOSTED",
    "dimensions": {
      "widthPixels": 300,
      "heightPixels": 250
    },
    "assets": [
      {
        "asset": {
          "mediaId": "{upload_hosted_image_first}",
          "content": ""
        },
        "role": "ASSET_ROLE_MAIN"
      }
    ]
  }
})
\`\`\`

⚠️ **GOTCHA**: DV360 requires assets to be uploaded via the DV360 UI or hosted externally.
For **image creatives**, use \`hostingSource: HOSTING_SOURCE_HOSTED\` and provide a hosted image URL.
For **HTML5 creatives**, upload a ZIP file via DV360 UI first, then reference the asset ID.

## Step 3: Create a Video Creative (VAST/VPAID)

\`\`\`json
dv360_create_entity({
  "entityType": "creative",
  "advertiserId": "${advertiserId}",
  "data": {
    "displayName": "Pre-roll Video 15s",
    "entityStatus": "ENTITY_STATUS_DRAFT",
    "creativeType": "CREATIVE_TYPE_VIDEO",
    "hostingSource": "HOSTING_SOURCE_HOSTED",
    "vastTagUrl": "https://your-vast-server.com/vast.xml",
    "dimensions": {
      "widthPixels": 1920,
      "heightPixels": 1080
    }
  }
})
\`\`\`

## Step 4: Preview Creative

\`\`\`json
dv360_get_ad_preview({
  "advertiserId": "${advertiserId}",
  "creativeId": "{creativeId_from_step_2}"
})
\`\`\`

## Step 5: Assign Creative to Line Item

\`\`\`json
dv360_create_entity({
  "entityType": "lineItemAssignedCreative",
  "advertiserId": "${advertiserId}",
  "lineItemId": "{your_line_item_id}",
  "data": {
    "creativeId": "{creativeId_from_step_2}"
  }
})
\`\`\`

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "Dimension mismatch" | Wrong size for placement | Check line item targeting dimensions |
| "Asset not found" | MediaId invalid | Upload via DV360 UI first |
| "Approval pending" | Creative under review | Wait for DV360 policy review (24-48h) |
| "Cannot assign to active LI" | Line item status | Set line item to DRAFT first |

## Success Criteria
- [ ] Creative created in DRAFT status
- [ ] Preview URL validated
- [ ] Creative assigned to line item
- [ ] Creative status changed to ACTIVE when campaign launches

`;
}