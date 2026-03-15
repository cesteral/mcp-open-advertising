// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * Cross-Platform Coordinated Campaign Setup Prompt
 *
 * Guides AI agents through setting up campaigns across multiple ad platforms
 * (DV360, TTD, Google Ads, Meta) in a coordinated manner.
 */
export const crossPlatformCampaignSetupPrompt: Prompt = {
  name: "cross_platform_campaign_setup",
  description:
    "Guide for setting up a coordinated multi-platform campaign across DV360 (dv360-mcp), The Trade Desk (ttd-mcp), Google Ads (gads-mcp), Meta Ads (meta-mcp), LinkedIn (linkedin-mcp), TikTok (tiktok-mcp), Pinterest (pinterest-mcp), Snapchat (snapchat-mcp), and Amazon DSP (amazon-dsp-mcp). Covers platform selection, budget allocation, naming conventions, and phased launch.",
  arguments: [
    {
      name: "totalBudget",
      description:
        "Total campaign budget across all platforms (e.g., '50000' for $50,000)",
      required: false,
    },
    {
      name: "objective",
      description:
        "Campaign objective: 'awareness', 'consideration', or 'conversion' (default: conversion)",
      required: false,
    },
  ],
};

export function getCrossPlatformCampaignSetupMessage(
  args?: Record<string, string>,
): string {
  const totalBudget = args?.totalBudget || "{totalBudget}";
  const objective = args?.objective || "conversion";

  return `# Cross-Platform Coordinated Campaign Setup

Total Budget: \$${totalBudget}
Objective: \`${objective}\`

This workflow guides you through setting up campaigns across multiple ad platforms in a coordinated manner. You must be connected to the relevant MCP servers.

---

## Step 1: Platform Selection

Choose platforms based on your objective and audience:

| Objective | Recommended Platforms | Rationale |
|-----------|----------------------|-----------|
| **Awareness** | DV360 + Meta + TikTok + Pinterest | DV360 for programmatic display/video reach, Meta/TikTok for social reach, Pinterest for visual discovery |
| **Consideration** | DV360 + TTD + Meta + LinkedIn | Broad programmatic reach with social engagement and B2B professional targeting |
| **Conversion** | Google Ads + Meta + TTD + Amazon DSP | Search intent (Google) + social retargeting (Meta) + programmatic (TTD) + retail intent (Amazon) |
| **B2B** | LinkedIn + Google Ads + Meta | Professional audience targeting on LinkedIn, search intent, social retargeting |
| **Gen Z / Video** | TikTok + Snapchat + Meta | Short-form video engagement across Gen Z/Millennial audiences |
| **Shopping / E-commerce** | Pinterest + Meta + Google Ads + Amazon DSP | Visual discovery + social + search + retail intent |
| **Full-Funnel** | All 9 platforms | Maximum reach across all touchpoints |

---

## Step 2: Budget Allocation

Split the total budget across platforms. Common allocation strategies:

### Performance-Based (Recommended for existing campaigns)
Allocate based on historical CPA/ROAS data. Use the \`cross_platform_performance_comparison\` prompt to gather data first.

### Equal Split (New campaigns with no history)

| Platform | Allocation | Budget |
|----------|-----------|--------|
| DV360 | 15% | \$${totalBudget} × 0.15 |
| TTD | 15% | \$${totalBudget} × 0.15 |
| Google Ads | 15% | \$${totalBudget} × 0.15 |
| Meta | 15% | \$${totalBudget} × 0.15 |
| LinkedIn | 10% | \$${totalBudget} × 0.10 |
| TikTok | 10% | \$${totalBudget} × 0.10 |
| Pinterest | 10% | \$${totalBudget} × 0.10 |
| Snapchat | 5% | \$${totalBudget} × 0.05 |
| Amazon DSP | 5% | \$${totalBudget} × 0.05 |

### Objective-Weighted

| Platform | Awareness | Consideration | Conversion | B2B | Shopping |
|----------|-----------|---------------|------------|-----|----------|
| DV360 | 25% | 20% | 10% | 5% | 5% |
| TTD | 15% | 15% | 15% | 5% | 10% |
| Google Ads | 5% | 15% | 30% | 20% | 20% |
| Meta | 20% | 20% | 15% | 15% | 20% |
| LinkedIn | 5% | 10% | 5% | 35% | 2% |
| TikTok | 15% | 10% | 10% | 5% | 8% |
| Pinterest | 10% | 5% | 5% | 0% | 20% |
| Snapchat | 5% | 5% | 5% | 0% | 5% |
| Amazon DSP | 0% | 0% | 5% | 15% | 10% |

---

## Step 3: Naming Convention

Use consistent naming across all platforms for easy cross-platform tracking:

**Pattern:** \`{Brand}_{Objective}_{Platform}_{Geo}_{Audience}_{YYYYMM}\`

**Examples:**
- \`Acme_Conv_DV360_US_Retargeting_202603\`
- \`Acme_Conv_TTD_US_Retargeting_202603\`
- \`Acme_Conv_GADS_US_Search_202603\`
- \`Acme_Conv_META_US_Lookalike_202603\`
- \`Acme_B2B_LI_US_Professionals_202603\`
- \`Acme_Aware_TT_US_GenZ_202603\`
- \`Acme_Shop_PIN_US_ShoppingIntent_202603\`
- \`Acme_Aware_SNAP_US_GenZ_202603\`
- \`Acme_Conv_AMZN_US_Retargeting_202603\`

---

## Step 4: Create Campaigns on Each Platform

### DV360 (via dv360-mcp)

Use the \`full_campaign_setup_workflow\` prompt for detailed guidance.

Key steps:
1. Create Campaign (PAUSED status)
2. Create Insertion Order (DRAFT status)
3. Create Line Items (DRAFT status)
4. Assign targeting
5. Activate via \`entity_activation_workflow\`

⚠️ **DV360 budget values are in micros** (1,000,000 = $1.00)

### The Trade Desk (via ttd-mcp)

Use the \`ttd_campaign_setup_workflow\` prompt for detailed guidance.

Key steps:
1. Create Campaign
2. Create Ad Groups with RTBAttributes
3. Create Ads and link Creatives
4. Set availability to "Available"

⚠️ **TTD budget values are in dollars** ($100.00 = 100.00)

### Google Ads (via gads-mcp)

Use the \`gads_campaign_setup_workflow\` prompt for detailed guidance.

Key steps:
1. Create Campaign Budget
2. Create Campaign (PAUSED)
3. Create Ad Groups
4. Create Keywords (for Search)
5. Create Responsive Search Ads
6. Enable campaign

⚠️ **Google Ads budget values are in micros** (1,000,000 = $1.00)

### Meta Ads (via meta-mcp)

Use the \`meta_campaign_setup_workflow\` prompt for detailed guidance.

Key steps:
1. Create Campaign (PAUSED)
2. Create Ad Creative
3. Create Ad Sets with targeting
4. Create Ads
5. Activate

⚠️ **Meta budget values are in cents** (5000 = $50.00)

### Pinterest (via pinterest-mcp)

Use the \`pinterest_campaign_setup_workflow\` prompt for detailed guidance.

Key steps:
1. Create Campaign (ACTIVE or PAUSED)
2. Create Ad Groups with targeting_spec
3. Upload/identify Pinterest Pin to promote
4. Create Ads referencing the Pin by pin_id
5. Activate via \`pinterest_bulk_update_status\`

⚠️ **Pinterest budget values are in micro-currency** (50000000 = $50.00)

Best for: E-commerce, lifestyle, food/beauty brands — high visual discovery and shopping intent

### LinkedIn Ads (via linkedin-mcp)

Use the \`linkedin_campaign_setup_workflow\` prompt for detailed guidance.

Key steps:
1. Create Campaign Group (ACTIVE or PAUSED)
2. Create Campaign with targeting criteria and CPM bid
3. Create Creative linked to the campaign
4. Activate via \`linkedin_bulk_update_status\`

⚠️ **LinkedIn budget values are in dollars** ($100.00 = 100.00)

Best for: B2B, professional audiences, job title/company/skill targeting

### TikTok Ads (via tiktok-mcp)

Use the \`tiktok_campaign_setup_workflow\` prompt for detailed guidance.

Key steps:
1. Create Campaign with objective and budget
2. Create Ad Group with targeting and schedule
3. Upload creatives via \`tiktok_upload_video\` or \`tiktok_upload_image\`
4. Create Ads referencing the creative
5. Enable via \`tiktok_bulk_update_status\`

⚠️ **TikTok budget values are in dollars** ($100.00 = 100.00)

Best for: Short-form video, Gen Z/Millennial audiences, entertainment and lifestyle brands

### Snapchat (via snapchat-mcp)

Use the \`snapchat_campaign_setup_workflow\` prompt for detailed guidance.

Key steps:
1. Create Campaign with objective and budget
2. Create Ad Squad (Ad Group) with targeting and placement
3. Upload creative via \`snapchat_upload_media\`
4. Create Ads referencing the creative
5. Activate via \`snapchat_bulk_update_status\`

⚠️ **Snapchat budget values are in micro-currency** (1 = $0.000001, so $100.00 = 100000000)

Best for: Gen Z audiences, AR lenses, video/story formats

### Amazon DSP (via amazon-dsp-mcp)

Use the \`amazon_dsp_campaign_setup_workflow\` prompt for detailed guidance.

Key steps:
1. Create Order (equivalent to Campaign) with flight dates and budget
2. Create Line Item with targeting and bid
3. Create Creative and attach to Line Item
4. Activate Order

⚠️ **Amazon DSP budget values are in dollars** ($100.00 = 100.00)

Best for: Retail/commerce intent, first-party Amazon audience data, programmatic display

---

## Step 5: Budget Value Reference

Critical — each platform uses different units:

| Platform | Unit | $100.00 Budget | $5.00 Bid | Best For |
|----------|------|---------------|-----------|----------|
| **DV360** | Micros | 100000000 | 5000000 | Programmatic display/video |
| **TTD** | Dollars | 100.00 | 5.00 | Programmatic DSP |
| **Google Ads** | Micros | 100000000 | 5000000 | Search intent |
| **Meta** | Cents | 10000 | 500 | Social retargeting |
| **LinkedIn** | Dollars | 100.00 | 5.00 | B2B professional audiences |
| **TikTok** | Dollars | 100.00 | 5.00 | Short-form video, Gen Z |
| **Pinterest** | Micro-currency | 100000000 | 5000000 | Visual discovery, shopping |
| **Snapchat** | Micro-currency | 100000000 | 5000000 | Gen Z, AR/video |
| **Amazon DSP** | Dollars | 100.00 | 5.00 | Retail/commerce intent |

**Pinterest example:** $50/day → \`daily_spend_cap: 50000000\`

---

## Step 6: Phased Launch

Don't activate all platforms simultaneously. Launch in phases to monitor:

### Phase 1: Pilot (Week 1)
- Launch on **one platform** (e.g., Google Ads for conversion, Meta for awareness)
- Allocate 25% of total budget
- Establish baseline CPA/ROAS

### Phase 2: Expand (Week 2)
- Add **second platform** (e.g., Meta or TTD)
- Compare performance with Phase 1 baseline
- Adjust bids based on early results

### Phase 3: Full Launch (Week 3+)
- Activate remaining platforms
- Use \`cross_platform_performance_comparison\` prompt to monitor
- Reallocate budget based on performance data

---

## Step 7: Cross-Platform Tracking

Set up consistent conversion tracking across platforms:

1. **UTM parameters**: Use consistent UTM source/medium/campaign across all platforms
2. **Conversion pixels**: Ensure all platforms track the same conversion events
3. **Attribution window**: Note that each platform uses different attribution models — cross-platform CPA comparisons are directional

---

## Post-Launch Monitoring

After all platforms are live:

1. **Daily**: Check pacing on each platform
2. **Weekly**: Run \`cross_platform_performance_comparison\` to compare metrics
3. **Bi-weekly**: Reallocate budget from underperformers to top performers
4. **Monthly**: Review overall campaign ROAS and adjust strategy

---

## Gotchas

- **Create campaigns PAUSED/DRAFT on all platforms first**, then activate in a controlled sequence
- **Budget units differ per platform** — double-check the conversion table above
- **Targeting alignment**: Try to match audiences across platforms as closely as possible for valid comparisons
- **Creative formats differ**: Each platform has different ad format requirements — plan creative assets accordingly
- **Time zones**: Campaigns on different platforms may use different timezone settings — align flight dates carefully
`;
}