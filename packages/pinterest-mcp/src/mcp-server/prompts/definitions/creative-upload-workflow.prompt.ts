// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const pinterestCreativeUploadWorkflowPrompt: Prompt = {
  name: "creative_upload_workflow",
  description:
    "Step-by-step guide for turning a video or image into a Pinterest ad: upload the video, create the Pin, then create the ad that promotes it by pin_id. Image Pins reference a hosted image URL and need no upload.",
  arguments: [
    {
      name: "adAccountId",
      description: "Pinterest ad account ID",
      required: true,
    },
  ],
};

export function getPinterestCreativeUploadWorkflowMessage(args?: Record<string, string>): string {
  const adAccountId = args?.adAccountId || "{adAccountId}";

  return `# Pinterest Ads Creative Upload Workflow

## Prerequisites
- Ad account ID: \`${adAccountId}\`
- An existing ad group (\`ad_group_id\`) to attach the ad to
- A board ID (\`board_id\`) on the Pinterest account that will own the Pin. No tool here lists boards, so get it from the user.
- For video: a publicly accessible URL of the video file. For images: a publicly accessible image URL. Pinterest's \`/v5/media\` endpoint only registers videos, so image creatives are never uploaded.

## Overview
A Pinterest ad does not carry its own creative. It promotes a **Pin**, and the ad references it by \`pin_id\`:

1. (Video only) Upload the video, which returns a \`mediaId\`
2. Create the Pin (\`entityType: "creative"\`, which is \`POST /v5/pins\`)
3. Create the ad in the ad group with that \`pin_id\`, created \`PAUSED\`

---

## Step 1: Upload the video (skip for images)

\`\`\`json
pinterest_upload_video({
  "adAccountId": "${adAccountId}",
  "mediaUrl": "https://example.com/your-video.mp4",
  "videoName": "Campaign Video"
})
\`\`\`

**Returns:** \`mediaId\` and \`mediaStatus\`.

The tool registers the upload, sends the file, then polls until Pinterest reports \`succeeded\` or \`failed\` (up to 10 minutes). Media status values are \`registered\`, \`processing\`, \`succeeded\` and \`failed\`. A \`failed\` video raises an error. If polling times out, the tool still returns the \`mediaId\` but no \`mediaStatus\`: the video may still be processing.

Pass \`dry_run: true\` first to validate the request without downloading or uploading anything.

## Step 2: Create the Pin

**Video Pin** (\`media_source.source_type: "video_id"\`, where \`media_id\` is required):

\`\`\`json
pinterest_create_entity({
  "entityType": "creative",
  "adAccountId": "${adAccountId}",
  "data": {
    "board_id": "{board_id}",
    "title": "Spring collection",
    "description": "Fresh styles for spring",
    "link": "https://yoursite.com/spring",
    "media_source": {
      "source_type": "video_id",
      "media_id": "{mediaId_from_step_1}",
      "cover_image_url": "https://example.com/cover.jpg"
    }
  }
})
\`\`\`

Instead of \`cover_image_url\`, a video cover can come from \`cover_image_key_frame_time\` (seconds into the video) or \`cover_image_data\` (Base64 with \`cover_image_content_type\`).

**Image Pin** (\`media_source.source_type: "image_url"\`, where \`url\` is required):

\`\`\`json
pinterest_create_entity({
  "entityType": "creative",
  "adAccountId": "${adAccountId}",
  "data": {
    "board_id": "{board_id}",
    "title": "Spring collection",
    "link": "https://yoursite.com/spring",
    "media_source": { "source_type": "image_url", "url": "https://example.com/image.jpg" }
  }
})
\`\`\`

**Returns:** the Pin. Its \`id\` is the \`pin_id\` for Step 3.

Limits from the Pin schema: \`title\` up to 100 characters, \`description\` up to 800, \`link\` up to 2048, \`alt_text\` up to 500.

## Step 3: Create the ad

\`ad_group_id\`, \`creative_type\` and \`pin_id\` are required.

\`\`\`json
pinterest_create_entity({
  "entityType": "ad",
  "adAccountId": "${adAccountId}",
  "data": {
    "ad_group_id": "{your_ad_group_id}",
    "creative_type": "VIDEO",
    "pin_id": "{pin_id_from_step_2}",
    "name": "Spring video ad",
    "destination_url": "https://yoursite.com/spring",
    "status": "PAUSED"
  }
})
\`\`\`

Use \`creative_type: "REGULAR"\` for a standard image Pin and \`"VIDEO"\` for a standard video Pin. Other values include \`CAROUSEL\`, \`MAX_VIDEO\`, \`COLLECTION\` and \`IDEA\`. \`customizable_cta_type\` (for example \`LEARN_MORE\` or \`SHOP_NOW\`) is only available for ads with direct links enabled.

⚠️ **GOTCHA**: The ad write is a batch endpoint that answers HTTP 200 even when it rejects the item. The tool unwraps \`items[].exceptions\` and raises it as an error, so read the error text rather than retrying.

⚠️ **GOTCHA**: Create the ad \`PAUSED\` and review it before launch. The status values are \`ACTIVE\`, \`PAUSED\`, \`ARCHIVED\`, \`DRAFT\` and \`DELETED_DRAFT\`.

## Step 4: Preview the ad

\`\`\`json
pinterest_get_ad_preview({
  "adAccountId": "${adAccountId}",
  "adId": "{ad_id_from_step_3}"
})
\`\`\`

The tool reads the ad's \`pin_id\` and creates a preview page. The returned \`url\` expires after 7 days. It needs the \`ads:write\` scope, but it changes no ad, campaign or spend.

## Step 5: Launch

\`\`\`json
pinterest_update_entity({
  "entityType": "ad",
  "adAccountId": "${adAccountId}",
  "entityId": "{ad_id}",
  "data": { "status": "ACTIVE" }
})
\`\`\`

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| \"video processing failed\" error | Unsupported file or codec | Re-encode to H.264 MP4 and upload again |
| \`mediaId\` returned with no \`mediaStatus\` | Polling timed out while the video was still processing | Wait, then create the Pin with that \`media_id\`. Pin creation fails until processing has succeeded. |
| Pin create rejected | Missing \`board_id\` or wrong \`media_source\` shape | \`source_type\` must be \`video_id\` (with \`media_id\`) or \`image_url\` (with \`url\`) |
| Ad create rejected | \`creative_type\` does not match the Pin's media | Use \`VIDEO\` for a video Pin and \`REGULAR\` for an image Pin |

## Success Criteria
- [ ] Video uploaded with \`mediaStatus: "succeeded"\` (video only)
- [ ] Pin created and \`pin_id\` recorded
- [ ] Ad created \`PAUSED\` with \`ad_group_id\`, \`creative_type\` and \`pin_id\`
- [ ] Preview reviewed
- [ ] Status set to \`ACTIVE\` when ready to launch
`;
}
