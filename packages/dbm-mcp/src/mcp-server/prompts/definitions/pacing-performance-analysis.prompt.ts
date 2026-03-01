import type { Prompt } from "./types.js";

/**
 * Pacing & Performance Analysis Workflow Prompt
 *
 * Guides AI agents through assessing campaign pacing, analyzing performance
 * metrics, identifying trends, and recommending remediation actions.
 */
export const pacingPerformanceAnalysisPrompt: Prompt = {
  name: "pacing_performance_analysis_workflow",
  description:
    "Step-by-step guide for DV360 pacing assessment and performance deep-dive: check delivery pacing, analyze CPM/CTR/CPA/ROAS, identify historical trends, and recommend bid/budget adjustments via dv360-mcp.",
  arguments: [
    {
      name: "campaignId",
      description: "DV360 Campaign ID to analyze",
      required: true,
    },
    {
      name: "advertiserId",
      description: "DV360 Advertiser ID",
      required: true,
    },
    {
      name: "focus",
      description:
        "Analysis focus: 'pacing', 'performance', or 'both' (default: both)",
      required: false,
    },
  ],
};

export function getPacingPerformanceAnalysisMessage(
  args?: Record<string, string>,
): string {
  const campaignId = args?.campaignId || "{campaignId}";
  const advertiserId = args?.advertiserId || "{advertiserId}";
  const focus = args?.focus || "both";

  return `# DV360 Pacing & Performance Analysis

Campaign: \`${campaignId}\`
Advertiser: \`${advertiserId}\`
Focus: \`${focus}\`

---

## Step 1: Assess Delivery Pacing

Check whether the campaign is on track to spend its budget by flight end.

\`\`\`json
{
  "tool": "get_pacing_status",
  "params": {
    "campaignId": "${campaignId}",
    "advertiserId": "${advertiserId}"
  }
}
\`\`\`

**Interpret the pacing percentage:**

| Pacing % | Status | Action |
|----------|--------|--------|
| 95–105% | On pace | No action needed |
| 85–94% | Slightly under | Monitor — may self-correct |
| 70–84% | Underdelivering | Investigate and adjust bids/targeting |
| < 70% | Severely under | Urgent — likely a configuration or targeting issue |
| 106–115% | Slightly over | Monitor — consider lowering bids |
| > 115% | Overspending | Reduce bids or pause line items immediately |

---

## Step 2: Analyze Performance Metrics

Get calculated performance metrics for the campaign:

\`\`\`json
{
  "tool": "get_performance_metrics",
  "params": {
    "campaignId": "${campaignId}",
    "advertiserId": "${advertiserId}",
    "dateRange": "LAST_7_DAYS"
  }
}
\`\`\`

**Key metrics to evaluate:**

| Metric | What It Tells You | Action Threshold |
|--------|-------------------|------------------|
| **CPM** | Cost efficiency of impressions | Compare to vertical benchmarks |
| **CTR** | Ad engagement rate | < 0.05% suggests creative fatigue or poor targeting |
| **CPA** | Cost per acquisition | Compare to target CPA goal |
| **ROAS** | Return on ad spend | < 1.0 means losing money |

---

## Step 3: Identify Historical Trends

Pull time-series data to spot trends over time:

\`\`\`json
{
  "tool": "get_historical_metrics",
  "params": {
    "campaignId": "${campaignId}",
    "advertiserId": "${advertiserId}",
    "startDate": "{YYYY-MM-DD}",
    "endDate": "{YYYY-MM-DD}",
    "granularity": "DAILY"
  }
}
\`\`\`

**What to look for:**

- **CPM trending up** → Competition increasing or targeting too narrow. Consider broadening audience.
- **CTR trending down** → Creative fatigue. Recommend creative refresh.
- **Spend dropping day-over-day** → Delivery issue. Check targeting restrictions, bid floors, budget caps.
- **CPA spiking** → Conversion drop-off. Check landing page, conversion tracking, audience quality.
- **Consistent flat delivery** → May indicate a frequency cap or pacing issue.

---

## Step 4: Build a Custom Deep-Dive Query (Optional)

For more granular analysis, compose a custom Bid Manager query:

\`\`\`json
{
  "tool": "run_custom_query",
  "params": {
    "reportType": "STANDARD",
    "timeRange": "LAST_14_DAYS",
    "metrics": [
      "METRIC_IMPRESSIONS",
      "METRIC_CLICKS",
      "METRIC_TOTAL_MEDIA_COST_ADVERTISER",
      "METRIC_TOTAL_CONVERSIONS",
      "METRIC_REVENUE_ADVERTISER"
    ],
    "dimensions": [
      "FILTER_LINE_ITEM"
    ],
    "filters": [
      {
        "type": "FILTER_ADVERTISER",
        "value": "${advertiserId}"
      },
      {
        "type": "FILTER_CAMPAIGN",
        "value": "${campaignId}"
      }
    ]
  }
}
\`\`\`

**Resource reference:** Fetch \`metric-types://all\` and \`filter-types://all\` for available metrics and dimensions. Check \`compatibility-rules://all\` to ensure your metric/dimension combination is valid.

---

## Step 5: Diagnose and Recommend

Based on findings from Steps 1–4, determine the root cause and recommended action:

### Underdelivery Diagnosis

| Symptom | Likely Cause | Recommended Action |
|---------|-------------|-------------------|
| Low pacing + high CPM | Bid too low for competition | Increase bids via **dv360-mcp** \`dv360_adjust_line_item_bids\` |
| Low pacing + low CPM | Targeting too narrow | Broaden audience or geo targeting via **dv360-mcp** targeting tools |
| Low pacing + normal CPM | Budget cap or frequency cap | Check IO/LI budget and frequency settings via **dv360-mcp** \`dv360_get_entity\` |
| Declining CTR + stable impressions | Creative fatigue | Recommend creative refresh (new creatives via **dv360-mcp**) |
| High CPA + good CTR | Landing page or conversion issue | Check conversion tracking setup (outside MCP scope) |

### Overspend Diagnosis

| Symptom | Likely Cause | Recommended Action |
|---------|-------------|-------------------|
| High pacing + low CPM | Bids too aggressive | Lower bids via **dv360-mcp** \`dv360_adjust_line_item_bids\` |
| High pacing + high CPM | Budget pacing too aggressive | Adjust pacing to EVEN via **dv360-mcp** \`dv360_update_entity\` |

---

## Step 6: Apply Remediation (via dv360-mcp)

This reporting server (dbm-mcp) is read-only. To make changes, use **dv360-mcp** tools:

- **Adjust bids**: \`dv360_adjust_line_item_bids\` (batch bid changes)
- **Pause line items**: \`dv360_bulk_update_status\` (pause underperformers)
- **Update budgets**: \`dv360_update_entity\` with updateMask on budget fields
- **Modify targeting**: \`dv360_create_assigned_targeting\` / \`dv360_delete_assigned_targeting\`

After making changes, wait at least 2-4 hours for delivery to adjust, then re-run Steps 1-2 to verify improvement.

---

## Summary Template

Present findings in this format:

| Metric | Current Value | Trend (7d) | Status |
|--------|--------------|------------|--------|
| Pacing | {X}% | {direction} | {On track / Under / Over} |
| CPM | \${X.XX} | {direction} | {Normal / High / Low} |
| CTR | {X.XX}% | {direction} | {Normal / Low} |
| CPA | \${X.XX} | {direction} | {Below / Above target} |
| ROAS | {X.XX}x | {direction} | {Profitable / Unprofitable} |

**Diagnosis:** {one-sentence summary}
**Recommended Actions:** {numbered list of specific actions with tool calls}
`;
}
