// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const pinterestCreativeUploadWorkflowPrompt: Prompt = {
  name: "creative_upload_workflow",
  description:
    "Step-by-step guide for uploading video creatives and creating Pinterest Ads. Image creatives reference a hosted image URL directly rather than uploading a file.",
  arguments: [
    {
      name: "adAccountId",
      description: "Pinterest Advertiser ID",
      required: true,
    },
  ],
};

export function getPinterestCreativeUploadWorkflowMessage(args?: Record<string, string>): string {
  const adAccountId = args?.adAccountId || "{adAccountId}";

  return `# Pinterest Ads Creative Upload Workflow

## Prerequisites
- Advertiser ID: \`${adAccountId}\`
- A publicly accessible URL for your video file (for image ads, a hosted image URL is used directly — Pinterest's \`/v5/media\` endpoint only accepts \`media_type="video"\`)

## Overview
Pinterest creative workflow: Upload video → Create Ad Group → Create Ad with creative

---

## Step 1: Upload Video

\`\`\`json
pinterest_upload_video({
  "adAccountId": "${adAccountId}",
  "mediaUrl": "https://example.com/your-video.mp4",
  "videoName": "Campaign Video"
})
\`\`\`

**Returns:** \`mediaId\`

⚠️ **GOTCHA**: Video processing takes 20-120 seconds. The tool polls automatically (20s intervals, up to 10 min).
When \`status == "succeeded"\`, the video is ready.

**Video requirements:**
- Formats: MP4, MOV, AVI
- Max 500MB
- Min resolution: 540x960 (9:16), 960x540 (16:9), or 640x640 (1:1)
- Duration: 5-60 seconds for In-Feed ads

## Step 2: Create Ad

\`\`\`json
pinterest_create_entity({
  "entityType": "ad",
  "adAccountId": "${adAccountId}",
  "data": {
    "adgroup_id": "{your_adgroup_id}",
    "ad_name": "Your Ad Name",
    "ad_format": "SINGLE_VIDEO",
    "video_id": "{mediaId_from_step_1}",
    "ad_text": "Your ad copy here",
    "landing_page_url": "https://yoursite.com",
    "call_to_action": "LEARN_MORE",
    "status": "DISABLE"
  }
})
\`\`\`

For image ads, pass \`image_url\` (a hosted URL) in the creative payload directly — no upload step.

⚠️ **GOTCHA**: Pinterest ads go through a review process. Initial status should be DISABLE (paused) until ready to launch.

## Step 3: Preview Ad

\`\`\`json
pinterest_get_ad_preview({
  "adAccountId": "${adAccountId}",
  "adId": "{ad_id_from_step_2}",
  "adFormat": "FEED"
})
\`\`\`

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "Video processing failed" | Unsupported codec | Re-encode to H.264 MP4 |
| "Ad review rejected" | Policy violation | Review Pinterest ad policies |
| "processing timeout" | Slow processing | Re-check media status via GET /v5/media/{mediaId} |

## Success Criteria
- [ ] Media uploaded (mediaId obtained and status succeeded)
- [ ] Ad created with DISABLE status
- [ ] Preview reviewed
- [ ] Status changed to ENABLE when ready to launch

`;
}
