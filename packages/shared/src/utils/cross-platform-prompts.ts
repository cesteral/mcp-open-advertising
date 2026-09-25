// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Cross-Platform Prompts — the single source (#235)
 *
 * `cross_platform_campaign_setup` and `cross_platform_performance_comparison`
 * describe the whole fleet, so every server that registers them must publish
 * the same text. They used to be copy-pasted into 12 servers and had drifted
 * into 6 variants of each: 9 copies stated budgets "in dollars", amazon-dsp's
 * "account currency"; cm360's and sa360's said LinkedIn budgets were cents;
 * three rewrote the DV360 and TTD example parameters to their own ID names
 * (`profileId`, `adAccountId`). Every server (msads-mcp included since #235)
 * registers these by importing them from `@cesteral/shared`, and
 * `scripts/lib/cross-platform-prompts.test.mjs` boots every server and fails
 * when any renders different text or a package grows its own copy.
 *
 * Nothing here is server-specific, so there is no per-server parameter. Money
 * units are stated as this repo's own tool schemas and per-platform prompts
 * state them — always in the account's own currency, never "dollars" — and
 * the text defers to each platform's tool description where they differ.
 */

/** A prompt argument, structurally compatible with the MCP SDK `PromptArgument`. */
export interface CrossPlatformPromptArgument {
  name: string;
  description: string;
  required: boolean;
}

/** Prompt metadata, structurally compatible with the MCP SDK `Prompt`. */
export interface CrossPlatformPromptMetadata {
  name: string;
  description: string;
  arguments: CrossPlatformPromptArgument[];
}

/** A prompt paired with its message generator, as each server's `promptRegistry` stores it. */
export interface CrossPlatformPromptDefinition {
  prompt: CrossPlatformPromptMetadata;
  generateMessage: (args?: Record<string, string>) => string;
}

// ---------------------------------------------------------------------------
// cross_platform_campaign_setup
// ---------------------------------------------------------------------------

export const crossPlatformCampaignSetupPrompt: CrossPlatformPromptMetadata = {
  name: "cross_platform_campaign_setup",
  description:
    "Guide for setting up a coordinated multi-platform campaign across DV360 (dv360-mcp), The Trade Desk (ttd-mcp), Google Ads (gads-mcp), Meta Ads (meta-mcp), Microsoft Advertising (msads-mcp), LinkedIn (linkedin-mcp), TikTok (tiktok-mcp), Pinterest (pinterest-mcp), Snapchat (snapchat-mcp), and Amazon DSP (amazon-dsp-mcp), with CM360 (cm360-mcp) for ad serving and SA360 (sa360-mcp) / Bid Manager (dbm-mcp) for reporting. Covers platform selection, budget allocation, per-platform money units, naming conventions, and phased launch.",
  arguments: [
    {
      name: "totalBudget",
      description:
        "Total campaign budget across all platforms, in major currency units (e.g., '50000')",
      required: false,
    },
    {
      name: "objective",
      description:
        "Campaign objective: 'awareness', 'consideration', or 'conversion' (default: conversion)",
      required: false,
    },
    {
      name: "currency",
      description:
        "ISO currency code of the total budget (e.g., 'USD', 'EUR'). Defaults to the advertiser accounts' own currency.",
      required: false,
    },
  ],
};

export function getCrossPlatformCampaignSetupMessage(args?: Record<string, string>): string {
  const totalBudget = args?.totalBudget || "{totalBudget}";
  const objective = args?.objective || "conversion";
  const currency = args?.currency || "(account currency)";
  const budget = `${totalBudget} ${currency}`;

  return `# Cross-Platform Coordinated Campaign Setup

Total Budget: ${budget}
Objective: \`${objective}\`

This workflow guides you through setting up campaigns across multiple ad platforms in a coordinated manner. You must be connected to the relevant MCP servers. Each platform's campaign-setup prompt (named per platform below) has the detailed, authoritative steps; this guide only coordinates them.

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
| **Full-Funnel** | All buying platforms below | Maximum reach across all touchpoints |

**Search beyond Google:** Microsoft Advertising (msads-mcp) covers the Bing/Microsoft search network. Where you run it, split the Google Ads search share in the tables below between the two.

**Not buying platforms:** CM360 (cm360-mcp) is ad serving and trafficking (placements, creatives, Floodlight), not media buying — use it for third-party ad serving and conversion tracking alongside the platforms above. SA360 (sa360-mcp) is cross-engine search reporting; campaign entities are read-only there, so create search campaigns on the source engine's server. Bid Manager (dbm-mcp) is DV360 reporting.

---

## Step 2: Budget Allocation

Split the total budget across platforms. Common allocation strategies:

### Performance-Based (Recommended for existing campaigns)
Allocate based on historical CPA/ROAS data. Use the \`cross_platform_performance_comparison\` prompt to gather data first.

### Equal Split (New campaigns with no history)

| Platform | Allocation | Budget |
|----------|-----------|--------|
| DV360 | 15% | ${budget} × 0.15 |
| TTD | 15% | ${budget} × 0.15 |
| Google Ads | 15% | ${budget} × 0.15 |
| Meta | 15% | ${budget} × 0.15 |
| LinkedIn | 10% | ${budget} × 0.10 |
| TikTok | 10% | ${budget} × 0.10 |
| Pinterest | 10% | ${budget} × 0.10 |
| Snapchat | 5% | ${budget} × 0.05 |
| Amazon DSP | 5% | ${budget} × 0.05 |

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

These splits are in the currency of the total budget. Each platform then takes the amount **in its own account's currency and its own money unit** — see Step 5 before entering any number.

---

## Step 3: Naming Convention

Use consistent naming across all platforms for easy cross-platform tracking:

**Pattern:** \`{Brand}_{Objective}_{Platform}_{Geo}_{Audience}_{YYYYMM}\`

**Examples:**
- \`Acme_Conv_DV360_US_Retargeting_202603\`
- \`Acme_Conv_TTD_US_Retargeting_202603\`
- \`Acme_Conv_GADS_US_Search_202603\`
- \`Acme_Conv_MSADS_US_Search_202603\`
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

⚠️ **DV360 money values are in micros** (1,000,000 = 1.00 in the advertiser's currency)

### The Trade Desk (via ttd-mcp)

Use the \`ttd_campaign_setup_workflow\` prompt for detailed guidance.

Key steps:
1. Create Campaign
2. Create Ad Groups with RTBAttributes
3. Create Ads and link Creatives
4. Set availability to "Available"

⚠️ **TTD money values are in the advertiser's currency, major units** (100.00 = 100.00 — not micros, not cents)

### Google Ads (via gads-mcp)

Use the \`gads_campaign_setup_workflow\` prompt for detailed guidance.

Key steps:
1. Create Campaign Budget
2. Create Campaign (PAUSED)
3. Create Ad Groups
4. Create Keywords (for Search)
5. Create Responsive Search Ads
6. Enable campaign

⚠️ **Google Ads money values are in micros** (1,000,000 = 1.00 in the account's currency)

### Microsoft Advertising (via msads-mcp)

Use the \`msads_campaign_setup_workflow\` prompt for detailed guidance.

Key steps:
1. Optionally create a shared Budget
2. Create Campaign (Paused)
3. Create Ad Groups
4. Add Keywords
5. Create Responsive Search Ads
6. Activate the campaign

⚠️ **Microsoft Advertising money values are in the account's currency, major units** (50.00 = 50.00)

### Meta Ads (via meta-mcp)

Use the \`meta_campaign_setup_workflow\` prompt for detailed guidance.

Key steps:
1. Create Campaign (PAUSED)
2. Create Ad Creative
3. Create Ad Sets with targeting
4. Create Ads
5. Activate

⚠️ **Meta money values are in cents** — the currency's minor unit (5000 = 50.00)

### LinkedIn Ads (via linkedin-mcp)

Use the \`linkedin_campaign_setup_workflow\` prompt for detailed guidance.

Key steps:
1. Create Campaign Group
2. Create Campaign with targeting criteria and bid
3. Create Creative linked to the campaign
4. Activate via \`linkedin_bulk_update_status\`

⚠️ **LinkedIn money values are CurrencyAmount objects in major units, with the amount as a string**: \`{ "amount": "100.00", "currencyCode": "USD" }\` — not cents

Best for: B2B, professional audiences, job title/company/skill targeting

### TikTok Ads (via tiktok-mcp)

Use the \`tiktok_campaign_setup_workflow\` prompt for detailed guidance.

Key steps:
1. Create Campaign with objective and budget
2. Create Ad Group with targeting and schedule
3. Upload creatives via \`tiktok_upload_video\` or \`tiktok_upload_image\`
4. Create Ads referencing the creative
5. Enable via \`tiktok_bulk_update_status\`

⚠️ **TikTok money values are in the advertiser's account currency, major units** (100 = 100.00 — not cents, not micros)

Best for: Short-form video, Gen Z/Millennial audiences, entertainment and lifestyle brands

### Pinterest (via pinterest-mcp)

Use the \`pinterest_campaign_setup_workflow\` prompt for detailed guidance.

Key steps:
1. Create Campaign (PAUSED)
2. Create Ad Groups with targeting_spec and budget
3. Upload/identify the Pinterest Pin to promote
4. Create Ads referencing the Pin by pin_id
5. Activate via \`pinterest_bulk_update_status\`

⚠️ **Pinterest money values are integer micro-currency** (1,000,000 = 1.00): \`budget_in_micro_currency: 50000000\` = 50.00 a day

Best for: E-commerce, lifestyle, food/beauty brands — high visual discovery and shopping intent

### Snapchat (via snapchat-mcp)

Use the \`snapchat_campaign_setup_workflow\` prompt for detailed guidance.

Key steps:
1. Create Campaign with objective and budget
2. Create Ad Squad (Ad Group) with targeting and placement
3. Upload creative via \`snapchat_upload_image\` or \`snapchat_upload_video\`
4. Create Ads referencing the creative
5. Activate via \`snapchat_bulk_update_status\`

⚠️ **Snapchat money values are in micro-currency** (\`*_micro\` fields; 1,000,000 = 1.00, so 100.00 = 100000000)

Best for: Gen Z audiences, AR lenses, video/story formats

### Amazon DSP (via amazon-dsp-mcp)

Use the \`amazon_dsp_campaign_setup_workflow\` prompt for detailed guidance.

Key steps:
1. Create Order (equivalent to Campaign) with flight dates and budget
2. Create Line Item with targeting and bid
3. Create Creative and attach to Line Item
4. Activate Order

⚠️ **Amazon DSP money values are in the advertiser's currency, major units** (100.00 = 100.00 — not micros). Confirm the advertiser account currency before comparing with other platforms.

Best for: Retail/commerce intent, first-party Amazon audience data, programmatic display

---

## Step 5: Money Unit Reference

Critical — each platform uses a different unit, and every amount is in **that account's own currency**. If the accounts use different currencies, convert each allocation into the account's currency first.

| Platform | Unit | 100.00 Budget | 5.00 Bid | Best For |
|----------|------|---------------|----------|----------|
| **DV360** | Micros | 100000000 | 5000000 | Programmatic display/video |
| **TTD** | Major units | 100.00 | 5.00 | Programmatic DSP |
| **Google Ads** | Micros | 100000000 | 5000000 | Search intent |
| **Microsoft Advertising** | Major units | 100.00 | 5.00 | Search intent (Bing/Microsoft network) |
| **Meta** | Cents (minor unit) | 10000 | 500 | Social retargeting |
| **LinkedIn** | Major units, string amount | "100.00" | "5.00" | B2B professional audiences |
| **TikTok** | Major units | 100.00 | 5.00 | Short-form video, Gen Z |
| **Pinterest** | Micro-currency | 100000000 | 5000000 | Visual discovery, shopping |
| **Snapchat** | Micro-currency | 100000000 | 5000000 | Gen Z, AR/video |
| **Amazon DSP** | Major units | 100.00 | 5.00 | Retail/commerce intent |

When in doubt, the platform's own create/update tool description and its campaign-setup prompt are authoritative over this table.

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
2. **Conversion tracking**: Ensure all platforms track the same conversion events (CM360 Floodlight can serve as a common tag where you use it)
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
- **Money units differ per platform** — double-check the reference table above; a micros value entered as major units is a million-fold overspend
- **Currencies differ per account** — amounts are always in the account's own currency
- **Targeting alignment**: Try to match audiences across platforms as closely as possible for valid comparisons
- **Creative formats differ**: Each platform has different ad format requirements — plan creative assets accordingly
- **Time zones**: Campaigns on different platforms may use different timezone settings — align flight dates carefully
`;
}

// ---------------------------------------------------------------------------
// cross_platform_performance_comparison
// ---------------------------------------------------------------------------

export const crossPlatformPerformancePrompt: CrossPlatformPromptMetadata = {
  name: "cross_platform_performance_comparison",
  description:
    "Guide for comparing campaign performance across DV360 (via dbm-mcp), The Trade Desk (ttd-mcp), Google Ads (gads-mcp), Meta Ads (meta-mcp) and the fleet's other reporting servers (msads, linkedin, tiktok, pinterest, snapchat, amazon-dsp, cm360, sa360). Normalizes metrics, identifies top performers, and recommends budget reallocation.",
  arguments: [
    {
      name: "dateRange",
      description:
        "Date range for comparison (e.g., LAST_7_DAYS, LAST_30_DAYS, or custom YYYY-MM-DD format)",
      required: false,
    },
  ],
};

/** `dateRange` preset → TTD `ttd_get_report.dateRange` enum value. */
const TTD_DATE_RANGE: Readonly<Record<string, string>> = {
  YESTERDAY: "Yesterday",
  LAST_7_DAYS: "Last7Days",
  LAST_14_DAYS: "Last14Days",
  LAST_30_DAYS: "Last30Days",
  THIS_MONTH: "MonthToDate",
  LAST_MONTH: "LastMonth",
};

/** `dateRange` presets accepted as-is by `gads_get_insights` / `sa360_get_insights`. */
const GOOGLE_DATE_RANGES: ReadonlySet<string> = new Set([
  "TODAY",
  "YESTERDAY",
  "LAST_7_DAYS",
  "LAST_30_DAYS",
  "THIS_MONTH",
  "LAST_MONTH",
  "LAST_90_DAYS",
]);

/** `dateRange` preset → Meta `meta_get_insights.datePreset`. */
const META_DATE_PRESET: Readonly<Record<string, string>> = {
  TODAY: "today",
  YESTERDAY: "yesterday",
  LAST_7_DAYS: "last_7d",
  LAST_30_DAYS: "last_30d",
};

export function getCrossPlatformPerformanceMessage(args?: Record<string, string>): string {
  const dateRange = args?.dateRange || "LAST_7_DAYS";
  const preset = dateRange.toUpperCase();

  const ttdDateRange = TTD_DATE_RANGE[preset] ?? "Custom";
  const googleDate = GOOGLE_DATE_RANGES.has(preset)
    ? `"dateRange": "${preset}"`
    : `"startDate": "{startDate}",\n    "endDate": "{endDate}"`;
  const metaDate =
    META_DATE_PRESET[preset] !== undefined
      ? `"datePreset": "${META_DATE_PRESET[preset]}"`
      : `"timeRange": { "since": "{startDate}", "until": "{endDate}" }`;

  return `# Cross-Platform Performance Comparison

Date Range: \`${dateRange}\`

This workflow coordinates across multiple MCP servers to gather, normalize, and compare campaign performance. You must be connected to all relevant servers.

Each reporting tool takes dates in its own format. Translate the requested range into each tool's form (shown in the examples) — \`{startDate}\` / \`{endDate}\` are YYYY-MM-DD.

---

## Step 1: Gather Metrics from Each Platform

### DV360 (via dbm-mcp)

\`\`\`json
{
  "tool": "dbm_get_performance_metrics",
  "params": {
    "advertiserId": "{dv360AdvertiserId}",
    "campaignId": "{dv360CampaignId}",
    "startDate": "{startDate}",
    "endDate": "{endDate}"
  }
}
\`\`\`

Key metrics returned: impressions, clicks, spend, CPM, CTR, CPA, ROAS.

### The Trade Desk (via ttd-mcp)

\`\`\`json
{
  "tool": "ttd_get_report",
  "params": {
    "reportName": "Cross-Platform Comparison",
    "reportTemplateId": {ttdReportTemplateId},
    "dateRange": "${ttdDateRange}",
    "advertiserIds": ["{ttdAdvertiserId}"]
  }
}
\`\`\`

The template defines the dimensions and metrics; find one with \`ttd_list_report_templates\`. Use a template that includes impressions, clicks, spend, conversions and revenue. For a \`Custom\` date range, see the \`ttd_report_generation_workflow\` prompt.

### Google Ads (via gads-mcp)

\`\`\`json
{
  "tool": "gads_get_insights",
  "params": {
    "customerId": "{gadsCustomerId}",
    "entityType": "campaign",
    ${googleDate}
  }
}
\`\`\`

### Meta Ads (via meta-mcp)

\`\`\`json
{
  "tool": "meta_get_insights",
  "params": {
    "entityId": "{metaCampaignId}",
    "fields": ["impressions", "clicks", "spend", "cpm", "ctr", "cpc", "actions", "cost_per_action_type"],
    ${metaDate}
  }
}
\`\`\`

### Other platforms

Each has a reporting tool and a reporting prompt with its exact parameters:

| Platform | Server | Reporting tool | Reporting prompt |
|----------|--------|----------------|------------------|
| Microsoft Advertising | msads-mcp | \`msads_get_report\` | \`msads_reporting_workflow\` |
| LinkedIn | linkedin-mcp | \`linkedin_get_analytics\` | \`linkedin_analytics_reporting_workflow\` |
| TikTok | tiktok-mcp | \`tiktok_get_report\` | \`tiktok_reporting_workflow\` |
| Pinterest | pinterest-mcp | \`pinterest_get_report\` | \`pinterest_reporting_workflow\` |
| Snapchat | snapchat-mcp | \`snapchat_get_report\` | \`snapchat_reporting_workflow\` |
| Amazon DSP | amazon-dsp-mcp | \`amazon_dsp_get_report\` | \`amazon_dsp_reporting_workflow\` |
| CM360 (ad-server view) | cm360-mcp | \`cm360_get_report\` | \`cm360_reporting_workflow\` |
| SA360 (cross-engine search) | sa360-mcp | \`sa360_get_insights\` | \`sa360_cross_engine_reporting_workflow\` |

SA360 already unifies the search engines it manages; do not add its rows on top of the same engines' own reports, or that spend is counted twice.

---

## Step 2: Normalize Metrics

Each platform reports metrics differently. Normalize to a common format:

- **Spend units**: Use the unit the reporting tool documents. Google Ads and SA360 report cost as \`cost_micros\` — divide by 1,000,000. Where a platform's report returns spend in a unit other than major currency units, convert it first.
- **Currency**: Spend is reported in the account's (advertiser's) own currency unless the tool documents otherwise (LinkedIn analytics also returns \`costInUsd\`). Convert everything to one currency before comparing.
- **Ratios**: Recompute CTR, CPM, CPC, CPA and ROAS yourself from raw impressions, clicks, spend, conversions and revenue rather than comparing each platform's own ratio fields — platforms express ratios differently (fraction vs percentage).
- **Conversions**: Each platform counts conversions under its own attribution model and name (e.g. Meta returns them inside \`actions\`).

### Normalization formulas:

- **Micros → major units**: Divide by 1,000,000
- **CPM**: (Spend / Impressions) × 1,000
- **CPC**: Spend / Clicks
- **CTR**: Clicks / Impressions
- **CPA**: Spend / Conversions
- **ROAS**: Revenue / Spend

---

## Step 3: Compare in Normalized Table

Present results in a unified format, in one currency:

| Platform | Campaign | Impressions | Clicks | CTR | Spend | CPM | CPA | ROAS |
|----------|----------|-------------|--------|-----|-------|-----|-----|------|
| DV360 | {name} | {n} | {n} | {%} | {n} | {n} | {n} | {n}x |
| TTD | {name} | {n} | {n} | {%} | {n} | {n} | {n} | {n}x |
| Google Ads | {name} | {n} | {n} | {%} | {n} | {n} | {n} | {n}x |
| Meta | {name} | {n} | {n} | {%} | {n} | {n} | {n} | {n}x |
| … | | | | | | | | |

---

## Step 4: Identify Winners and Losers

Rank platforms by key efficiency metrics:

### By CPA (lower is better)
1. Best CPA platform → candidate for budget increase
2. Worst CPA platform → candidate for budget decrease or pause

### By ROAS (higher is better)
1. Best ROAS platform → highest return on investment
2. Worst ROAS platform → losing money if < 1.0

### By CPM (context-dependent)
- Low CPM + low CTR → cheap but ineffective (awareness only)
- High CPM + high CTR → expensive but effective (consider if CPA is good)

---

## Step 5: Recommend Budget Reallocation

Based on the comparison, suggest budget moves:

### Conservative Approach (low risk)
- Shift 10-15% of budget from worst performer to best performer
- Monitor for 1 week before making further changes

### Aggressive Approach (high confidence)
- Shift 25-30% of budget from worst performer to best performer
- Pause campaigns on platforms with ROAS < 0.5

### Execution

For each platform where budget changes are needed, use that server's update tool — and enter the new amount **in that platform's money unit** (see the \`cross_platform_campaign_setup\` prompt's unit reference):

- **DV360**: \`dv360_update_entity\` (via dv360-mcp) to adjust IO/Line Item budgets
- **TTD**: \`ttd_update_entity\` (via ttd-mcp) to adjust campaign/ad group budgets
- **Google Ads**: \`gads_update_entity\` (via gads-mcp) to adjust campaign budgets
- **Microsoft Advertising**: \`msads_update_entity\` (via msads-mcp)
- **Meta**: \`meta_update_entity\` (via meta-mcp) to adjust campaign/ad set budgets
- **LinkedIn**: \`linkedin_update_entity\` (via linkedin-mcp)
- **TikTok**: \`tiktok_update_entity\` (via tiktok-mcp)
- **Pinterest**: \`pinterest_update_entity\` (via pinterest-mcp)
- **Snapchat**: \`snapchat_update_entity\` (via snapchat-mcp)
- **Amazon DSP**: \`amazon_dsp_update_entity\` (via amazon-dsp-mcp)

CM360 and SA360 do not hold media budgets; reallocate on the buying platform.

---

## Gotchas

- **Date ranges differ by platform**: each reporting tool takes its own date format (Bid Manager explicit dates, TTD presets like \`Last7Days\`, Google Ads/SA360 presets like \`LAST_7_DAYS\` or explicit dates, Meta \`datePreset\` or \`timeRange\`). Align the actual dates, not just the preset names.
- **Currency differences**: Ensure all platforms' spend is in the same currency before comparing — each reports in its own account currency.
- **Attribution models differ**: Each platform attributes conversions differently. Cross-platform CPA comparisons are directional, not exact.
- **Data freshness varies**: Several platforms report asynchronously (submit → poll → download) and recent days may still be incomplete. Compare data from the same, settled time window.
- **Impression counting differs**: Viewability standards vary by platform. CPM comparisons should account for this.
- **Not all campaigns are comparable**: Only compare campaigns targeting similar audiences, geos, and objectives. A brand awareness campaign on DV360 shouldn't be compared with a direct response campaign on Google Ads.
`;
}

/**
 * Both cross-platform prompts, in the order servers register them. A server
 * adds these to its `promptRegistry` by name; it must not keep its own copy.
 */
export const CROSS_PLATFORM_PROMPTS: readonly CrossPlatformPromptDefinition[] = [
  {
    prompt: crossPlatformPerformancePrompt,
    generateMessage: getCrossPlatformPerformanceMessage,
  },
  {
    prompt: crossPlatformCampaignSetupPrompt,
    generateMessage: getCrossPlatformCampaignSetupMessage,
  },
];
