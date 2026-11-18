// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/server";

export const linkedInCreativeUploadWorkflowPrompt: Prompt = {
  name: "linkedin_creative_upload_workflow",
  description:
    "Step-by-step guide for uploading images and creating LinkedIn Sponsored Content creatives",
  arguments: [
    {
      name: "adAccountUrn",
      description: "LinkedIn Ad Account URN (e.g., urn:li:sponsoredAccount:123456)",
      required: true,
    },
  ],
};

export function getLinkedInCreativeUploadWorkflowMessage(args?: Record<string, string>): string {
  const adAccountUrn = args?.adAccountUrn || "{adAccountUrn}";

  return `# LinkedIn Ads Creative Upload Workflow

## Prerequisites
- Ad Account URN: \`${adAccountUrn}\`
- Organization URN for your company page (e.g., urn:li:organization:123456): it owns the
  uploaded image and authors the post

## Overview
LinkedIn creative workflow: Upload image → Put it in a post → Create the creative from the post

---

## Step 1: Upload Image

\`\`\`json
linkedin_upload_image({
  "ownerUrn": "{organization_urn}",
  "mediaUrl": "https://example.com/your-banner.jpg"
})
\`\`\`

**Returns:** \`imageUrn\` (format: urn:li:image:...)

⚠️ **GOTCHA**: \`ownerUrn\` is the organization (or a person), not the ad account: LinkedIn's
Images API refuses an ad-account owner on upload. The image is PROCESSING after the upload and
can be served once LinkedIn marks it AVAILABLE.

**Image requirements:**
- Formats: JPG, PNG, GIF (GIF up to 250 frames)
- Fewer than 36,152,320 pixels
- Max 5MB (this server's check)

For a video, \`linkedin_upload_video\` takes the same arguments and returns a \`videoUrn\`
(urn:li:video:...).

## Step 2: Create the Post, then the Creative

A creative on LinkedIn's Creatives API sponsors a post: \`content.reference\` is a
\`urn:li:share:…\` or \`urn:li:ugcPost:…\` (or \`urn:li:adInMailContent:…\`). The image is
not referenced by the creative directly. Create the post that carries it first, with the
imageUrn in the post's \`content.media.id\` (Posts API, \`POST /rest/posts\`, outside this
server; LinkedIn's Image Ads page sets \`adContext.dscAdAccount\` to the ad account for an ad-only
post), then create the creative from the post's URN. (The Creatives API's \`createInline\`
action, which creates the post and the creative in one call, is not wrapped by this server.)

\`\`\`json
linkedin_create_entity({
  "entityType": "creative",
  "adAccountUrn": "${adAccountUrn}",
  "data": {
    "campaign": "{your_campaign_urn}",
    "content": { "reference": "{post_urn}" },
    "name": "Your creative name",
    "intendedStatus": "DRAFT"
  }
})
\`\`\`

⚠️ **GOTCHA**: The status field is \`intendedStatus\`, not \`status\`, and the body has no \`account\` (pass \`adAccountUrn\`). Create in DRAFT and move to ACTIVE after review.

## Step 3: Preview Creative

\`\`\`json
{
  "tool": "linkedin_get_ad_preview",
  "params": {
    "creativeUrn": "{creativeUrn_from_step_2}",
    "adAccountUrn": "${adAccountUrn}"
  }
}
\`\`\`

## Step 4: Activate Creative

\`\`\`json
linkedin_update_entity({
  "entityType": "creative",
  "entityUrn": "{creativeUrn}",
  "adAccountUrn": "${adAccountUrn}",
  "data": { "intendedStatus": "ACTIVE" }
})
\`\`\`

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| 403 "Accessing this image resource is forbidden" | The token's member is not an ADMIN or DSC poster of the owning organization | Use an organization the member administers |
| "INVALID_URN_TYPE" | ownerUrn or a referenced URN is the wrong type | Owner is urn:li:organization or urn:li:person; content.reference is a post URN |
| "CAMPAIGN_NOT_FOUND" | Wrong campaign URN | Verify using linkedin_list_entities |

## Common Call-to-Action Values
LEARN_MORE, SIGN_UP, REGISTER, JOIN_NOW, REQUEST_DEMO, TRY_FREE, CONTACT_US, GET_QUOTE, APPLY_NOW, DOWNLOAD

## Success Criteria
- [ ] Image uploaded (imageUrn obtained)
- [ ] Post created with the image in content.media.id
- [ ] Creative created in DRAFT status
- [ ] Preview reviewed
- [ ] Creative activated when ready

`;
}
