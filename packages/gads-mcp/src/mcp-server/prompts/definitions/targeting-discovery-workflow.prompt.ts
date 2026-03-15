// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Google Ads Targeting Discovery Workflow Prompt
 *
 * Guides AI agents through discovering and analyzing targeting segments using GAQL.
 * Covers audience segments, keyword targeting, geographic targeting, device targeting,
 * and how to use gads_get_insights for performance data by segment.
 */
import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const targetingDiscoveryWorkflowPrompt: Prompt = {
  name: "gads_targeting_discovery_workflow",
  description:
    "Step-by-step guide for discovering and analyzing Google Ads targeting segments via GAQL. Covers audience, keyword, geographic, and device targeting, plus performance insights by segment.",
  arguments: [
    {
      name: "customerId",
      description: "Google Ads customer ID (no dashes)",
      required: true,
    },
    {
      name: "campaignId",
      description: "Campaign ID to scope targeting discovery (optional)",
      required: false,
    },
  ],
};

export function getTargetingDiscoveryWorkflowMessage(
  args?: Record<string, string>
): string {
  const customerId = args?.customerId || "{customerId}";
  const campaignId = args?.campaignId || "{campaignId}";

  return `# Google Ads Targeting Discovery Workflow

## Context
- Customer ID: \`${customerId}\`
- Campaign ID: \`${campaignId}\`
- Platform: Google Ads API v23
- Tool: \`gads_gaql_search\`, \`gads_get_insights\`

This workflow helps you explore what targeting is already applied, understand segment performance, and identify targeting opportunities.

---

## Step 1: Understand Available Targeting Dimensions

Google Ads targeting operates across several dimensions:

| Dimension | Description | GAQL Resource |
|-----------|-------------|---------------|
| Keywords | Search query matching | \`keyword_view\` |
| Audiences | User interest / demographic segments | \`ad_group_audience_view\` |
| Geographic | Country, region, city, DMA | \`geographic_view\` |
| Device | Desktop, mobile, tablet | Segment via \`segments.device\` |
| Ad Schedule | Day of week, hour of day | Segment via \`segments.hour\`, \`segments.day_of_week\` |
| Demographics | Age, gender, parental status | \`age_range_view\`, \`gender_view\` |

---

## Step 2: Discover Existing Keyword Targeting

List the keywords active in the campaign:

\`\`\`
Tool: gads_gaql_search
Input: {
  "customerId": "${customerId}",
  "query": "SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, ad_group.name, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM keyword_view WHERE campaign.id = ${campaignId} AND segments.date DURING LAST_30_DAYS AND ad_group_criterion.status != 'REMOVED' ORDER BY metrics.impressions DESC LIMIT 100"
}
\`\`\`

**Analyze**: Identify high-impression / low-conversion keywords for bid adjustments or exclusion.

---

## Step 3: Discover Geographic Performance

Identify which geographic locations are driving performance:

\`\`\`
Tool: gads_gaql_search
Input: {
  "customerId": "${customerId}",
  "query": "SELECT geographic_view.country_criterion_id, geographic_view.location_type, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.cost_per_conversion FROM geographic_view WHERE campaign.id = ${campaignId} AND segments.date DURING LAST_30_DAYS ORDER BY metrics.cost_micros DESC LIMIT 50"
}
\`\`\`

### Top Cities Query
\`\`\`
Tool: gads_gaql_search
Input: {
  "customerId": "${customerId}",
  "query": "SELECT segments.geo_target_city, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE campaign.id = ${campaignId} AND segments.date DURING LAST_30_DAYS ORDER BY metrics.impressions DESC LIMIT 50"
}
\`\`\`

**Analyze**: Look for high-cost / low-conversion geographies to exclude or reduce bids.

---

## Step 4: Analyze Device Performance

Understand how performance varies by device type:

\`\`\`
Tool: gads_gaql_search
Input: {
  "customerId": "${customerId}",
  "query": "SELECT segments.device, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.ctr, metrics.conversions, metrics.cost_per_conversion FROM campaign WHERE campaign.id = ${campaignId} AND segments.date DURING LAST_30_DAYS"
}
\`\`\`

Device values: \`DESKTOP\`, \`MOBILE\`, \`TABLET\`, \`CONNECTED_TV\`

**Analyze**: If mobile CPAs are significantly higher, consider adding a mobile bid adjustment.

---

## Step 5: Analyze Demographic Targeting

Review age and gender breakdowns:

### Age Range Performance
\`\`\`
Tool: gads_gaql_search
Input: {
  "customerId": "${customerId}",
  "query": "SELECT ad_group_criterion.age_range.type, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM age_range_view WHERE campaign.id = ${campaignId} AND segments.date DURING LAST_30_DAYS ORDER BY metrics.impressions DESC"
}
\`\`\`

### Gender Performance
\`\`\`
Tool: gads_gaql_search
Input: {
  "customerId": "${customerId}",
  "query": "SELECT ad_group_criterion.gender.type, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM gender_view WHERE campaign.id = ${campaignId} AND segments.date DURING LAST_30_DAYS"
}
\`\`\`

---

## Step 6: Discover Audience Segment Performance

Analyze in-market and affinity audience performance:

\`\`\`
Tool: gads_gaql_search
Input: {
  "customerId": "${customerId}",
  "query": "SELECT ad_group_audience_view.resource_name, user_list.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM ad_group_audience_view WHERE campaign.id = ${campaignId} AND segments.date DURING LAST_30_DAYS ORDER BY metrics.impressions DESC LIMIT 50"
}
\`\`\`

---

## Step 7: Use gads_get_insights for Segment Summaries

For a higher-level view of performance by entity and segment:

\`\`\`
Tool: gads_get_insights
Input: {
  "customerId": "${customerId}",
  "entityType": "campaign",
  "dateRange": "LAST_30_DAYS"
}
\`\`\`

This returns aggregated performance metrics and can surface top/bottom performers quickly.

---

## Step 8: Discover Search Term Opportunities

Find new keyword opportunities from actual search queries:

\`\`\`
Tool: gads_gaql_search
Input: {
  "customerId": "${customerId}",
  "query": "SELECT search_term_view.search_term, search_term_view.status, metrics.impressions, metrics.clicks, metrics.conversions, metrics.cost_micros FROM search_term_view WHERE campaign.id = ${campaignId} AND segments.date DURING LAST_30_DAYS AND metrics.impressions > 10 ORDER BY metrics.conversions DESC LIMIT 100"
}
\`\`\`

**Analyze**:
- High-conversion search terms → add as exact/phrase match keywords
- Irrelevant terms → add as negative keywords
- High-spend / zero-conversion terms → investigate match type issues

---

## Step 9: Ad Schedule Performance

Identify the best hours and days to run ads:

\`\`\`
Tool: gads_gaql_search
Input: {
  "customerId": "${customerId}",
  "query": "SELECT segments.day_of_week, segments.hour, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE campaign.id = ${campaignId} AND segments.date DURING LAST_30_DAYS ORDER BY metrics.conversions DESC"
}
\`\`\`

Day values: \`MONDAY\`, \`TUESDAY\`, \`WEDNESDAY\`, \`THURSDAY\`, \`FRIDAY\`, \`SATURDAY\`, \`SUNDAY\`

---

## Tips

- **Combine dimensions carefully**: Some segments cannot be combined in a single GAQL query. If you get an error, split into separate queries.
- **Micros conversion**: All cost values are in micros. Divide by 1,000,000 for actual currency.
- **Zero impressions**: Entities with 0 impressions in the date range may simply be new, paused, or have limited targeting.
- **Statistical significance**: Don't make targeting decisions on fewer than 100 impressions — results may be noise.
- **Act on insights**: Use \`gads_update_entity\` with \`updateMask\` to apply bid adjustments, or \`gads_create_entity\` to add new keywords/audiences discovered here.

---

## Success Checklist

- [ ] Keyword targeting reviewed — high-waste keywords identified
- [ ] Geographic performance analyzed — low-performing locations noted
- [ ] Device breakdown reviewed — mobile/desktop bid adjustments considered
- [ ] Demographic performance reviewed — age/gender outliers identified
- [ ] Audience segments analyzed — underperforming segments flagged
- [ ] Search terms explored — new keyword opportunities discovered
- [ ] Ad schedule analyzed — peak hours/days identified
- [ ] Action plan created based on segment insights

## Related Resources
- \`gaql-reference://syntax\` — Full GAQL syntax and field reference
- \`entity-hierarchy://gads\` — Entity relationships and targeting structure
- \`entity-schema://keyword\` — Keyword entity field reference
`;
}