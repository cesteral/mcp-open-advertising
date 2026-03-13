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
    "Guide for setting up a coordinated multi-platform campaign across DV360 (dv360-mcp), The Trade Desk (ttd-mcp), Google Ads (gads-mcp), Meta Ads (meta-mcp), and Pinterest (pinterest-mcp). Covers platform selection, budget allocation, naming conventions, and phased launch.",
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
| **Awareness** | DV360 + Meta + Pinterest | DV360 for programmatic display/video reach, Meta & Pinterest for social/visual reach |
| **Consideration** | DV360 + TTD + Meta + Pinterest | Broad programmatic reach with social and visual discovery engagement |
| **Conversion** | Google Ads + Meta + TTD | Search intent (Google) + social retargeting (Meta) + programmatic (TTD) |
| **Shopping / E-commerce** | Pinterest + Meta + Google Ads | Pinterest for visual discovery/shopping intent, Meta for retargeting, Google for search |
| **Full-Funnel** | All 5 platforms | Maximum reach across all touchpoints |

---

## Step 2: Budget Allocation

Split the total budget across platforms. Common allocation strategies:

### Performance-Based (Recommended for existing campaigns)
Allocate based on historical CPA/ROAS data. Use the \`cross_platform_performance_comparison\` prompt to gather data first.

### Equal Split (New campaigns with no history)

| Platform | Allocation | Budget |
|----------|-----------|--------|
| DV360 | 20% | \$${totalBudget} × 0.20 |
| TTD | 20% | \$${totalBudget} × 0.20 |
| Google Ads | 20% | \$${totalBudget} × 0.20 |
| Meta | 20% | \$${totalBudget} × 0.20 |
| Pinterest | 20% | \$${totalBudget} × 0.20 |

### Objective-Weighted

| Platform | Awareness | Consideration | Conversion | Shopping |
|----------|-----------|---------------|------------|----------|
| DV360 | 30% | 20% | 15% | 5% |
| TTD | 20% | 20% | 20% | 10% |
| Google Ads | 10% | 20% | 40% | 25% |
| Meta | 25% | 25% | 20% | 30% |
| Pinterest | 15% | 15% | 5% | 30% |

---

## Step 3: Naming Convention

Use consistent naming across all platforms for easy cross-platform tracking:

**Pattern:** \`{Brand}_{Objective}_{Platform}_{Geo}_{Audience}_{YYYYMM}\`

**Examples:**
- \`Acme_Conv_DV360_US_Retargeting_202603\`
- \`Acme_Conv_TTD_US_Retargeting_202603\`
- \`Acme_Conv_GADS_US_Search_202603\`
- \`Acme_Conv_META_US_Lookalike_202603\`
- \`Acme_Aware_PIN_US_Shopping_202603\`

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

---

## Step 5: Budget Value Reference

Critical — each platform uses different units:

| Platform | Unit | $100.00 Budget | $5.00 Bid | Best For |
|----------|------|---------------|-----------|----------|
| **DV360** | Micros | 100000000 | 5000000 | Programmatic display/video |
| **TTD** | Dollars | 100.00 | 5.00 | Programmatic DSP |
| **Google Ads** | Micros | 100000000 | 5000000 | Search intent |
| **Meta** | Cents | 10000 | 500 | Social retargeting |
| **Pinterest** | Micro-currency | 100000000 | 5000000 | Visual discovery, shopping intent |

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
