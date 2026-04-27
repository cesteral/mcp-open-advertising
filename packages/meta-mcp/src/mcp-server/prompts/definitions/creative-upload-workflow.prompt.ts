// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const creativeUploadWorkflowPrompt: Prompt = {
  name: "creative_upload_workflow",
  description:
    "Step-by-step guide for uploading creative assets and creating Meta Ads creatives (images and videos)",
  arguments: [
    {
      name: "adAccountId",
      description: "Meta Ad Account ID (e.g., act_1234567890)",
      required: true,
    },
    {
      name: "creativeType",
      description: "Type of creative to create: image or video",
      required: false,
    },
  ],
};

export function getCreativeUploadWorkflowMessage(args?: Record<string, string>): string {
  const adAccountId = args?.adAccountId || "{adAccountId}";
  const creativeType = args?.creativeType || "image";

  return `# Meta Ads Creative Upload Workflow

## Prerequisites
- Ad Account ID: \`${adAccountId}\`
- A publicly accessible URL for your media file

## Overview
Meta Ads creative workflow: Upload media → Create Ad Creative → Attach to Ad

---

## Step 1: Upload ${creativeType === "video" ? "Video" : "Image"}

${
  creativeType === "video"
    ? `
\`\`\`json
meta_upload_video({
  "adAccountId": "${adAccountId}",
  "mediaUrl": "https://example.com/your-video.mp4",
  "title": "Campaign Video Title"
})
\`\`\`

⚠️ **GOTCHA**: Video processing can take 1-5 minutes. The tool polls automatically and returns when ready (status: "ready"). If status is "processing", wait and retry.

**Video requirements:**
- Formats: MP4, MOV (H.264 recommended)
- Buffered proxy upload limit applies; use moderate-size assets and chunked workflows for very large videos
- Min resolution 120x120px
- Feed ads: up to 240 min duration
`
    : `
\`\`\`json
meta_upload_image({
  "adAccountId": "${adAccountId}",
  "mediaUrl": "https://example.com/your-banner.jpg",
  "name": "Campaign Banner"
})
\`\`\`

**Returns:** \`imageHash\` — save this for Step 2.

**Image requirements:**
- Formats: JPEG, PNG, GIF
- Max 30MB
- Recommended: 1200x628px (1.91:1 ratio) for link ads
- Square 1080x1080px for Stories/Reels
`
}

## Step 2: Create Ad Creative

${
  creativeType === "video"
    ? `
\`\`\`json
meta_create_entity({
  "entityType": "adCreative",
  "adAccountId": "${adAccountId}",
  "data": {
    "name": "Video Creative - Campaign Name",
    "object_story_spec": {
      "page_id": "{your_page_id}",
      "video_data": {
        "video_id": "{videoId_from_step_1}",
        "message": "Your ad copy here",
        "call_to_action": {
          "type": "LEARN_MORE",
          "value": { "link": "https://yoursite.com" }
        }
      }
    }
  }
})
\`\`\`
`
    : `
\`\`\`json
meta_create_entity({
  "entityType": "adCreative",
  "adAccountId": "${adAccountId}",
  "data": {
    "name": "Image Creative - Campaign Name",
    "object_story_spec": {
      "page_id": "{your_page_id}",
      "link_data": {
        "image_hash": "{imageHash_from_step_1}",
        "link": "https://yoursite.com",
        "message": "Your ad copy here",
        "call_to_action": {
          "type": "LEARN_MORE",
          "value": { "link": "https://yoursite.com" }
        }
      }
    }
  }
})
\`\`\`
`
}

⚠️ **GOTCHA**: You must own a Facebook Page to create ads. Get page_id by calling Meta's Page API or checking your Business Manager.

## Step 3: Preview Creative

\`\`\`json
meta_get_ad_preview({
  "adId": "{ad_id}"
})
\`\`\`

## Step 4: Create Ad with Creative

\`\`\`json
meta_create_entity({
  "entityType": "ad",
  "adAccountId": "${adAccountId}",
  "data": {
    "adset_id": "{your_adset_id}",
    "creative": { "creative_id": "{creativeId_from_step_2}" },
    "status": "PAUSED",
    "name": "Your Ad Name"
  }
})
\`\`\`

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "Invalid image" | Wrong format or dimensions | Use JPEG/PNG, check dimensions |
| "Video processing failed" | Codec issue | Re-encode to H.264 MP4 |
| "Page required" | No Facebook Page | Create/connect a Page in Business Manager |
| "Creative rejected" | Policy violation | Review Meta ad policies |

## Success Criteria
- [ ] Media uploaded (imageHash or videoId obtained)
- [ ] Ad Creative created (creativeId obtained)
- [ ] Ad created with creative in PAUSED status
- [ ] Preview reviewed before activating

`;
}
