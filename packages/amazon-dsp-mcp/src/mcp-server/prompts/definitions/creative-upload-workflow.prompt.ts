// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const amazonDspCreativeUploadWorkflowPrompt: Prompt = {
  name: "amazon_dsp_creative_upload_workflow",
  description:
    "Step-by-step guide for uploading a video asset and creating an Amazon DSP video ad (Unified API) linked to a line item",
  arguments: [
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

export function getAmazonDspCreativeUploadWorkflowMessage(args?: Record<string, string>): string {
  const profileId = args?.profileId || "{profileId}";
  const accountId = args?.accountId || "{accountId}";

  return `# Amazon DSP Creative Upload Workflow

## Prerequisites
- Profile ID (session): \`${profileId}\`
- DSP advertiser (accountId): \`${accountId}\`
- A publicly accessible URL for your video file

## Overview
Upload the video to the Creative Asset Library → create a Unified DSP ad (entityType \`creative\`) that references the asset → link the ad to a line item with a \`creativeAssociation\`.

---

## Step 1: Upload the Video

\`\`\`json
amazon_dsp_upload_video({
  "name": "Campaign Video",
  "mediaUrl": "https://example.com/your-video.mp4"
})
\`\`\`

**Returns:** \`assetId\` (and the raw registered asset, which carries its version).

---

## Step 2: Create the Video Ad

Sent as \`POST /adsApi/v1/create/ads\` (\`DSPAdCreate\`). The video is referenced as \`{ assetId, assetVersion }\`.

\`\`\`json
amazon_dsp_create_entity({
  "entityType": "creative",
  "profileId": "${profileId}",
  "accountId": "${accountId}",
  "data": {
    "name": "Campaign Video Ad",
    "adType": "VIDEO",
    "state": "PAUSED",
    "creative": {
      "videoCreative": {
        "onlineVideoSettings": {
          "language": "en_US",
          "videos": { "assetId": "{assetId_from_step_1}", "assetVersion": "{assetVersion_from_step_1}" }
        }
      }
    }
  }
})
\`\`\`

For the full field set (call-to-actions, tracking URLs, streaming TV settings, display and component ads) fetch \`entity-schema://amazonDsp/creative\` and \`entity-examples://amazonDsp/creative\`.

---

## Step 3: Link the Ad to a Line Item

\`\`\`json
amazon_dsp_create_entity({
  "entityType": "creativeAssociation",
  "profileId": "${profileId}",
  "accountId": "${accountId}",
  "data": { "adGroupId": "{line_item_id}", "adId": "{adId_from_step_2}", "state": "ENABLED" }
})
\`\`\`

---

## Step 4: Preview (optional)

\`\`\`json
amazon_dsp_get_ad_preview({
  "profileId": "${profileId}",
  "adId": "{adId_from_step_2}"
})
\`\`\`

The preview tool uses a legacy \`/dsp/creatives\` endpoint; whether it accepts a Unified \`adId\` is unverified.

## Success Criteria
- [ ] Video uploaded (\`assetId\` obtained)
- [ ] Ad created PAUSED
- [ ] Ad associated with the line item
- [ ] Ad set to ENABLED (\`amazon_dsp_bulk_update_status\`, entityType \`creative\`) when ready
`;
}
