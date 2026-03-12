import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const crossPlatformCampaignSetupPrompt: Prompt = {
  name: "cross_platform_campaign_setup",
  description:
    "Multi-platform campaign setup guide with budget allocation and naming conventions",
  arguments: [
    {
      name: "totalBudget",
      description: "Total campaign budget (e.g., 50000)",
      required: false,
    },
    {
      name: "objective",
      description: "Campaign objective: awareness, consideration, conversion",
      required: false,
    },
  ],
};

export function getCrossPlatformCampaignSetupMessage(
  args?: Record<string, string>,
): string {
  const totalBudget = args?.totalBudget || "{totalBudget}";
  const objective = args?.objective || "conversion";
  return `# Cross-Platform Campaign Setup Guide

## Budget: $${totalBudget} | Objective: ${objective}

## Step 1: Platform Selection

| Platform | Best For | Server | Setup Prompt |
|----------|----------|--------|--------------|
| DV360 | Programmatic display, video, audio | dv360-mcp | \`full_campaign_setup_workflow\` |
| Google Ads | Search, Shopping, YouTube | gads-mcp | \`gads_campaign_setup_workflow\` |
| Meta | Social (Facebook, Instagram) | meta-mcp | \`meta_campaign_setup_workflow\` |
| TTD | Independent programmatic DSP | ttd-mcp | \`ttd_campaign_setup_workflow\` |
| LinkedIn | B2B professional targeting | linkedin-mcp | \`linkedin_campaign_setup_workflow\` |
| TikTok | Short-form video, younger demos | tiktok-mcp | \`tiktok_campaign_setup_workflow\` |
| CM360 | Ad serving, trafficking, Floodlight | cm360-mcp | \`cm360_campaign_setup_workflow\` |
| SA360 | Cross-engine search management | sa360-mcp | Read-only (use source engine servers for campaign creation) |

## Step 2: Budget Allocation

| Strategy | Description |
|----------|-------------|
| Even Split | Equal across platforms |
| Performance-Based | Allocate more to best ROAS |
| Funnel-Based | Awareness (40%), Consideration (35%), Conversion (25%) |

## Step 3: Naming Convention

\`[Brand]_[Platform]_[Objective]_[Audience]_[Date]\`
Example: \`Acme_CM360_Conv_Retargeting_2026Q1\`

## Step 4: Per-Platform Setup

Use each platform's campaign setup prompt for specific instructions.

## Step 5: Budget Units Reference

| Platform | Budget Unit | $10 USD |
|----------|-------------|---------|
| DV360 | Micros (1/1,000,000) | 10000000 |
| Google Ads | Micros (1/1,000,000) | 10000000 |
| Meta | Cents (1/100) | 1000 |
| TTD | Dollars | 10 |
| LinkedIn | Cents (1/100) | 1000 |
| TikTok | Dollars | 10 |
| CM360 | N/A (ad serving, not media buying) | - |
| SA360 | Read-only reporting | - |

## Step 6: Phased Launch

1. **Phase 1**: Launch on 1-2 platforms, monitor for 48 hours
2. **Phase 2**: Expand to remaining platforms
3. **Phase 3**: Optimize based on cross-platform performance comparison
`;
}
