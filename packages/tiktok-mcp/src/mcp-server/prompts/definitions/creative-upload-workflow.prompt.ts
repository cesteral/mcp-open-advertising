import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const tiktokCreativeUploadWorkflowPrompt: Prompt = {
  name: "creative_upload_workflow",
  description: "Step-by-step guide for uploading creative assets and creating TikTok Ads creatives",
  arguments: [
    {
      name: "advertiserId",
      description: "TikTok Advertiser ID",
      required: true,
    },
    {
      name: "creativeType",
      description: "Type of creative: image or video",
      required: false,
    },
  ],
};

export function getTiktokCreativeUploadWorkflowMessage(args?: Record<string, string>): string {
  const advertiserId = args?.advertiserId || "{advertiserId}";
  const creativeType = args?.creativeType || "video";

  return `# TikTok Ads Creative Upload Workflow

## Prerequisites
- Advertiser ID: \`${advertiserId}\`
- A publicly accessible URL for your media file

## Overview
TikTok creative workflow: Upload media → Create Ad Group → Create Ad with creative

---

## Step 1: Upload ${creativeType === "image" ? "Image" : "Video"}

${creativeType === "image" ? `
\`\`\`json
tiktok_upload_image({
  "advertiserId": "${advertiserId}",
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
tiktok_upload_video({
  "advertiserId": "${advertiserId}",
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

## Step 2: Create Ad

\`\`\`json
tiktok_create_entity({
  "entityType": "ad",
  "advertiserId": "${advertiserId}",
  "data": {
    "adgroup_id": "{your_adgroup_id}",
    "ad_name": "Your Ad Name",
    "ad_format": "SINGLE_VIDEO",
    ${creativeType === "image" ? `"image_ids": ["{imageId_from_step_1}"],
    "ad_text": "Your ad copy here",` : `"video_id": "{videoId_from_step_1}",
    "ad_text": "Your ad copy here",`}
    "landing_page_url": "https://yoursite.com",
    "call_to_action": "LEARN_MORE",
    "status": "DISABLE"
  }
})
\`\`\`

⚠️ **GOTCHA**: TikTok ads go through a review process. Initial status should be DISABLE (paused) until ready to launch.

## Step 3: Preview Ad

\`\`\`json
tiktok_get_ad_preview({
  "advertiserId": "${advertiserId}",
  "adId": "{ad_id_from_step_2}",
  "adFormat": "FEED"
})
\`\`\`

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "Video processing failed" | Unsupported codec | Re-encode to H.264 MP4 |
| "Image size exceeded" | File too large | Compress to < 100KB |
| "Ad review rejected" | Policy violation | Review TikTok ad policies |
| "bind_success timeout" | Slow processing | Check video_status manually |

## Success Criteria
- [ ] Media uploaded (imageId or videoId obtained)
- [ ] Ad created with DISABLE status
- [ ] Preview reviewed
- [ ] Status changed to ENABLE when ready to launch

`;
}
