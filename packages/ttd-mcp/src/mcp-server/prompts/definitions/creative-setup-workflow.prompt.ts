// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const ttdCreativeSetupWorkflowPrompt: Prompt = {
  name: "creative_setup_workflow",
  description: "Step-by-step guide for creating The Trade Desk creatives and attaching them to ad groups",
};

export function getTtdCreativeSetupWorkflowMessage(_args?: Record<string, string>): string {
  return `# TTD Creative Setup Workflow

## Overview
TTD Creative workflow: Create Creative entity → Attach to Ad Group via Ad

---

## Step 1: Explore Creative Schema

\`\`\`
entity-schema://creative
\`\`\`

Or check examples:
\`\`\`
entity-examples://creative
\`\`\`

## Step 2: Create a Creative

\`\`\`json
ttd_create_entity({
  "entityType": "creative",
  "data": {
    "AdvertiserId": "{your_advertiser_id}",
    "CreativeName": "Display Banner 300x250",
    "Width": 300,
    "Height": 250,
    "CreativeType": "banner",
    "Url": "https://your-click-url.com",
    "ImageUrl": "https://your-hosted-banner.jpg",
    "ClickThroughUrl": "https://your-landing-page.com"
  }
})
\`\`\`

⚠️ **GOTCHA**: TTD requires externally hosted creative assets. Images must be publicly accessible URLs.

**Creative types:** banner, video, native, audio

## Step 3: Create a Video Creative (VAST)

\`\`\`json
ttd_create_entity({
  "entityType": "creative",
  "data": {
    "AdvertiserId": "{your_advertiser_id}",
    "CreativeName": "Pre-roll Video",
    "Width": 1920,
    "Height": 1080,
    "CreativeType": "video",
    "VastXml": "<VAST version=\\"3.0\\">...</VAST>",
    "ClickThroughUrl": "https://your-landing-page.com"
  }
})
\`\`\`

## Step 4: Preview Creative

\`\`\`json
ttd_get_ad_preview({
  "creativeId": "{creativeId_from_step_2}"
})
\`\`\`

## Step 5: Create Ad linking Creative to Ad Group

\`\`\`json
ttd_create_entity({
  "entityType": "ad",
  "data": {
    "AdGroupId": "{your_adgroup_id}",
    "CreativeId": "{creativeId_from_step_2}",
    "AdName": "Your Ad Name",
    "IsEnabled": false
  }
})
\`\`\`

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "Image URL not accessible" | Private URL | Use a publicly accessible URL |
| "Invalid dimensions" | Wrong size | Match ad group placement dimensions |
| "VAST parsing failed" | Invalid VAST XML | Validate XML before submitting |
| "Creative rejected" | Policy violation | Review TTD creative policies |

## Success Criteria
- [ ] Creative created and ID obtained
- [ ] Preview URL validated
- [ ] Ad created linking creative to ad group
- [ ] Ad enabled when ready to serve

`;
}