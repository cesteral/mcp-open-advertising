import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const linkedInCreativeUploadWorkflowPrompt: Prompt = {
  name: "creative_upload_workflow",
  description: "Step-by-step guide for uploading images and creating LinkedIn Sponsored Content creatives",
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
- Organization URN for your company page (e.g., urn:li:organization:123456)

## Overview
LinkedIn creative workflow: Upload image → Create Creative → Link to Campaign

---

## Step 1: Upload Image

\`\`\`json
linkedin_upload_image({
  "adAccountUrn": "${adAccountUrn}",
  "mediaUrl": "https://example.com/your-banner.jpg"
})
\`\`\`

**Returns:** \`assetUrn\` (format: urn:li:digitalmediaAsset:...)

⚠️ **GOTCHA**: LinkedIn processes assets asynchronously. The assetUrn is returned immediately but may take 1-5 minutes to be fully available for creative creation. If creative creation fails with "ASSET_NOT_READY", wait and retry.

**Image requirements:**
- Formats: JPEG, PNG, GIF
- Min 400x400px; recommended 1200x627px (1.91:1 ratio)
- Max 5MB
- Aspect ratios accepted: 1.91:1 (horizontal), 1:1 (square), 2:3 (vertical)

## Step 2: Create Creative

\`\`\`json
linkedin_create_entity({
  "entityType": "creative",
  "data": {
    "account": "${adAccountUrn}",
    "campaign": "{your_campaign_urn}",
    "content": {
      "contentType": "SPONSORED_IMAGE",
      "media": {
        "id": "{assetUrn_from_step_1}",
        "headline": "Your Headline Here",
        "description": "Your ad description",
        "callToAction": "LEARN_MORE",
        "landingPage": "https://yoursite.com"
      }
    },
    "status": "DRAFT",
    "type": "SPONSORED"
  }
})
\`\`\`

⚠️ **GOTCHA**: Creative must be created in DRAFT status. Move to ACTIVE only after review.

## Step 3: Preview Creative

\`\`\`json
linkedin_get_ad_previews({
  "creativeUrn": "{creativeUrn_from_step_2}",
  "adFormat": "SPONSORED_IMAGE"
})
\`\`\`

## Step 4: Activate Creative

\`\`\`json
linkedin_update_entity({
  "entityType": "creative",
  "entityUrn": "{creativeUrn}",
  "data": { "status": "ACTIVE" }
})
\`\`\`

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "ASSET_NOT_READY" | Asset still processing | Wait 1-5 min, retry |
| "INVALID_ASPECT_RATIO" | Wrong image ratio | Use 1.91:1, 1:1, or 2:3 |
| "MISSING_ORGANIZATION" | No org page linked | Link organization to ad account |
| "CAMPAIGN_NOT_FOUND" | Wrong campaign URN | Verify using linkedin_list_entities |

## Common Call-to-Action Values
LEARN_MORE, SIGN_UP, REGISTER, JOIN_NOW, REQUEST_DEMO, TRY_FREE, CONTACT_US, GET_QUOTE, APPLY_NOW, DOWNLOAD

## Success Criteria
- [ ] Image uploaded (assetUrn obtained)
- [ ] Creative created in DRAFT status
- [ ] Preview reviewed
- [ ] Creative activated when ready

## Pre-staging with Media Library
Use \`media_upload_asset\` to store images in Cesteral's media library for reuse across LinkedIn campaigns and other platforms.
`;
}
