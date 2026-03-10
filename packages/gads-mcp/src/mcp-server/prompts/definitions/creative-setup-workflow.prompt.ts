import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const gadsCreativeSetupWorkflowPrompt: Prompt = {
  name: "creative_setup_workflow",
  description: "Step-by-step guide for creating Google Ads responsive display ads and video creatives",
  arguments: [
    {
      name: "customerId",
      description: "Google Ads Customer ID (e.g., 1234567890)",
      required: true,
    },
  ],
};

export function getGadsCreativeSetupWorkflowMessage(args?: Record<string, string>): string {
  const customerId = args?.customerId || "{customerId}";

  return `# Google Ads Creative Setup Workflow

## Prerequisites
- Customer ID: \`${customerId}\`
- Google Ads account with active campaigns

## Overview
Google Ads uses **Responsive Display Ads (RDA)** and **Responsive Search Ads (RSA)** for automated asset optimization.

---

## Step 1: Understand Ad Types

**Responsive Display Ads**: Provide headlines, descriptions, images, logos → Google optimizes combinations.
**Responsive Search Ads**: Provide 3-15 headlines, 2-4 descriptions → Google optimizes combinations.
**Video Ads**: YouTube video URL + companion banner.

## Step 2: Create a Responsive Display Ad

\`\`\`json
gads_create_entity({
  "entityType": "ad",
  "customerId": "${customerId}",
  "data": {
    "type": "RESPONSIVE_DISPLAY_AD",
    "responsiveDisplayAd": {
      "headlines": [
        { "text": "Your Headline 1" },
        { "text": "Your Headline 2" }
      ],
      "longHeadline": { "text": "Your Long Headline" },
      "descriptions": [
        { "text": "Your description here" }
      ],
      "businessName": "Your Business Name",
      "marketingImages": [
        {
          "asset": "customers/${customerId}/assets/{image_asset_id}",
          "fieldType": "MARKETING_IMAGE"
        }
      ],
      "logoImages": [
        {
          "asset": "customers/${customerId}/assets/{logo_asset_id}",
          "fieldType": "LOGO_IMAGE"
        }
      ]
    },
    "finalUrls": ["https://yoursite.com"]
  }
})
\`\`\`

⚠️ **GOTCHA**: Google Ads requires image assets to be uploaded first as Asset entities (type: IMAGE). Use \`gads_create_entity\` with entityType "asset" to upload via URL.

## Step 3: Upload Image as Asset

\`\`\`json
gads_create_entity({
  "entityType": "asset",
  "customerId": "${customerId}",
  "data": {
    "type": "IMAGE",
    "imageAsset": {
      "data": "{base64_encoded_image_or_url}"
    },
    "name": "Banner 1200x628"
  }
})
\`\`\`

⚠️ **GOTCHA**: Google Ads API requires images as base64-encoded data or via asset resource name. For URL-based uploads, use the Asset API with imageAsset.data as base64.

## Step 4: Create Responsive Search Ad

\`\`\`json
gads_create_entity({
  "entityType": "ad",
  "customerId": "${customerId}",
  "data": {
    "type": "RESPONSIVE_SEARCH_AD",
    "responsiveSearchAd": {
      "headlines": [
        { "text": "Headline 1", "pinned_field": "HEADLINE_1" },
        { "text": "Headline 2" },
        { "text": "Headline 3" }
      ],
      "descriptions": [
        { "text": "Description line 1 here" },
        { "text": "Description line 2 here" }
      ]
    },
    "finalUrls": ["https://yoursite.com"]
  }
})
\`\`\`

## Step 5: Preview Ad

\`\`\`json
gads_get_ad_preview({
  "customerId": "${customerId}",
  "adId": "{adId_from_step_2_or_4}"
})
\`\`\`

## Step 6: Create Ad Group Ad

To link the ad to an ad group:
\`\`\`json
gads_create_entity({
  "entityType": "adGroupAd",
  "customerId": "${customerId}",
  "data": {
    "adGroup": "customers/${customerId}/adGroups/{adGroupId}",
    "ad": { "resourceName": "customers/${customerId}/ads/{adId}" },
    "status": "PAUSED"
  }
})
\`\`\`

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "Image too small" | Below min dimensions | Use 600x314px min (1.91:1), 300x300px min (square) |
| "Headline too long" | Over 30 characters | Shorten to 30 chars max |
| "Description too long" | Over 90 characters | Shorten to 90 chars max |
| "Invalid landing page" | URL not approved | Verify URL loads correctly |
| "Policy violation" | Ad content issue | Review Google Ads policies |

## Success Criteria
- [ ] Assets uploaded (image_asset_id obtained)
- [ ] Ad created (adId obtained)
- [ ] Ad linked to ad group (adGroupAd created)
- [ ] Preview reviewed
- [ ] Status changed to ENABLED when ready

`;
}
