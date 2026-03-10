import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const linkedInCampaignSetupWorkflowPrompt: Prompt = {
  name: "linkedin_campaign_setup_workflow",
  description:
    "Step-by-step guide for creating a complete LinkedIn Ads campaign structure (Campaign Group > Campaign > Creative)",
  arguments: [
    {
      name: "adAccountUrn",
      description: "LinkedIn Ad Account URN (e.g., urn:li:sponsoredAccount:123456789)",
      required: true,
    },
    {
      name: "includeTargeting",
      description: "Whether to include targeting setup steps (true/false)",
      required: false,
    },
  ],
};

export function getLinkedInCampaignSetupWorkflowMessage(args?: Record<string, string>): string {
  const adAccountUrn = args?.adAccountUrn || "{adAccountUrn}";
  const includeTargeting = args?.includeTargeting !== "false";

  return `# LinkedIn Campaign Setup Workflow

## Prerequisites
- Ad Account URN: \`${adAccountUrn}\`
- Verify account access: \`linkedin_list_ad_accounts\`
- Check entity hierarchy: fetch resource \`entity-hierarchy://linkedin/all\`

## Step 1: Create Campaign Group

Campaign groups organize related campaigns and can share a budget cap.

\`\`\`json
linkedin_create_entity({
  "entityType": "campaignGroup",
  "data": {
    "name": "Q2 2026 Brand Campaign",
    "account": "${adAccountUrn}",
    "status": "DRAFT",
    "totalBudget": { "amount": "10000.00", "currencyCode": "USD" },
    "runSchedule": {
      "start": 1746057600000,
      "end": 1753833600000
    }
  }
})
\`\`\`

**Save the returned campaign group URN:** \`urn:li:sponsoredCampaignGroup:XXXXXXXXX\`

## Step 2: Create Campaign

\`\`\`json
linkedin_create_entity({
  "entityType": "campaign",
  "data": {
    "name": "Brand Awareness - Tech Leaders",
    "campaignGroup": "urn:li:sponsoredCampaignGroup:XXXXXXXXX",
    "account": "${adAccountUrn}",
    "type": "SPONSORED_UPDATES",
    "objectiveType": "BRAND_AWARENESS",
    "status": "DRAFT",
    "dailyBudget": { "amount": "100.00", "currencyCode": "USD" },
    "bidType": "CPM",
    "unitCost": { "amount": "12.00", "currencyCode": "USD" },
    "locale": { "country": "US", "language": "en" }
  }
})
\`\`\`

**Campaign Types:** SPONSORED_UPDATES, TEXT_AD, DYNAMIC, VIDEO, CAROUSEL

**Objective Types:** BRAND_AWARENESS, WEBSITE_TRAFFIC, WEBSITE_CONVERSIONS,
LEAD_GENERATION, ENGAGEMENT, VIDEO_VIEWS
${includeTargeting ? `
## Step 3: Add Targeting

Add targeting criteria to the campaign via update:

\`\`\`json
linkedin_update_entity({
  "entityType": "campaign",
  "entityUrn": "urn:li:sponsoredCampaign:XXXXXXXXX",
  "data": {
    "targetingCriteria": {
      "include": {
        "and": [
          {
            "or": {
              "urn:li:adTargetingFacet:geos": ["urn:li:geo:103644278"]
            }
          },
          {
            "or": {
              "urn:li:adTargetingFacet:memberSeniorities": [
                "urn:li:adSeniority:5",
                "urn:li:adSeniority:6"
              ]
            }
          }
        ]
      }
    }
  }
})
\`\`\`

To find targeting URNs, use: \`linkedin_search_targeting({ facetType: "MEMBER_SENIORITY" })\`

**Get audience size forecast:**
\`\`\`json
linkedin_get_delivery_forecast({
  "adAccountUrn": "${adAccountUrn}",
  "targetingCriteria": { ... }
})
\`\`\`
` : ""}
## Step 4: Create Creative

Creative links your content (UGC post, share, etc.) to the campaign.

\`\`\`json
linkedin_create_entity({
  "entityType": "creative",
  "data": {
    "campaign": "urn:li:sponsoredCampaign:XXXXXXXXX",
    "status": "DRAFT",
    "reference": "urn:li:ugcPost:YOUR_UGC_POST_ID"
  }
})
\`\`\`

**Reference formats:**
- Organic post: \`urn:li:ugcPost:{postId}\`
- Share: \`urn:li:share:{shareId}\`

## Step 5: Verify & Activate

1. Validate payloads: \`linkedin_validate_entity\`
2. Preview creative: \`linkedin_get_ad_preview({ creativeUrn: "..." })\`
3. Review all entities:
   - Campaign group: \`linkedin_get_entity({ entityType: "campaignGroup", entityUrn: "..." })\`
   - Campaign: \`linkedin_get_entity({ entityType: "campaign", entityUrn: "..." })\`
   - Creative: \`linkedin_get_entity({ entityType: "creative", entityUrn: "..." })\`
4. Activate: \`linkedin_bulk_update_status\` to set ACTIVE

## Common Gotchas

| Issue | Solution |
|-------|----------|
| Budget in wrong format | Use CurrencyAmount: \`{ "amount": "100.00", "currencyCode": "USD" }\` |
| Invalid URN format | All IDs must start with \`urn:li:\` |
| Campaign not serving | Check campaign status is ACTIVE, not DRAFT |
| Creative review pending | Allow 24-48h for LinkedIn creative review |
| Missing targeting | Campaigns without targeting may have limited delivery |

## Analytics After Launch

\`\`\`json
linkedin_get_analytics({
  "adAccountUrn": "${adAccountUrn}",
  "startDate": "2026-03-01",
  "endDate": "2026-03-31",
  "metrics": ["impressions", "clicks", "costInUsd", "conversions"],
  "pivot": "CAMPAIGN",
  "timeGranularity": "DAILY"
})
\`\`\`
`;
}
