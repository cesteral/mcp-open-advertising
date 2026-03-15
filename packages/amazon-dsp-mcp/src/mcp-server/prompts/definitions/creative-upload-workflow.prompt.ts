// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const amazonDspCreativeUploadWorkflowPrompt: Prompt = {
  name: "amazon_dsp_creative_upload_workflow",
  description: "Step-by-step guide for uploading creative assets and creating AmazonDsp Ads creatives",
  arguments: [
    {
      name: "profileId",
      description: "AmazonDsp Advertiser ID",
      required: true,
    },
    {
      name: "creativeType",
      description: "Type of creative: image or video",
      required: false,
    },
  ],
};

export function getAmazonDspCreativeUploadWorkflowMessage(args?: Record<string, string>): string {
  const profileId = args?.profileId || "{profileId}";
  const creativeType = args?.creativeType || "video";

  return `# AmazonDsp Ads Creative Upload Workflow

## Prerequisites
- Advertiser ID: \`${profileId}\`
- A publicly accessible URL for your media file

## Overview
AmazonDsp creative workflow: Upload media → Create Ad Group → Create Ad with creative

---

## Step 1: Upload ${creativeType === "image" ? "Image" : "Video"}

${creativeType === "image" ? `
\`\`\`json
amazon_dsp_upload_image({
  "profileId": "${profileId}",
  "mediaUrl": "https://example.com/your-image.jpg"
})
\`\`\`

**Returns:** \`imageId\`

**Image requirements:**
- Formats: JPEG, PNG
- Max 100KB for feed ads
- Recommended: 1200x628px, 1080x1080px, 720x1280px
` : `
\`\`\`json
amazon_dsp_upload_video({
  "profileId": "${profileId}",
  "mediaUrl": "https://example.com/your-video.mp4",
  "videoName": "Campaign Video"
})
\`\`\`

**Returns:** \`videoId\`

⚠️ **GOTCHA**: Video processing takes 20-120 seconds. The tool polls automatically (20s intervals, up to 10 min).
When \`video_status == "bind_success"\`, the video is ready.

**Video requirements:**
- Formats: MP4, MOV, AVI
- Max 500MB
- Min resolution: 540x960 (9:16), 960x540 (16:9), or 640x640 (1:1)
- Duration: 5-60 seconds for In-Feed ads
`}

## Step 2: Create Creative

\`\`\`json
amazon_dsp_create_entity({
  "entityType": "creative",
  "advertiserId": "${profileId}",
  "data": {
    "name": "Your Creative Name",
    "advertiserId": "${profileId}",
    "creativeType": "${creativeType === "image" ? "IMAGE" : "VIDEO"}",
    ${creativeType === "image" ? `"imageId": "{imageId_from_step_1}",` : `"videoId": "{videoId_from_step_1}",`}
    "clickUrl": "https://yoursite.com",
    "state": "paused"
  }
})
\`\`\`

⚠️ **GOTCHA**: Amazon DSP creatives go through a review process. Initial state should be \`paused\` until ready to launch.

## Step 3: Preview Creative

\`\`\`json
amazon_dsp_get_ad_preview({
  "advertiserId": "${profileId}",
  "adId": "{creative_id_from_step_2}",
  "adFormat": "DISPLAY"
})
\`\`\`

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "Video processing failed" | Unsupported codec | Re-encode to H.264 MP4 |
| "Image size exceeded" | File too large | Compress to < 100KB |
| "Ad review rejected" | Policy violation | Review AmazonDsp ad policies |
| "bind_success timeout" | Slow processing | Check video_status manually |

## Success Criteria
- [ ] Media uploaded (imageId or videoId obtained)
- [ ] Creative created with paused state
- [ ] Preview reviewed
- [ ] State changed to delivering when ready to launch

`;
}