/**
 * Metric Types MCP Resource
 *
 * Provides a reference of all available Bid Manager API metrics
 * with descriptions and usage guidance.
 */

import type { Resource } from "../types.js";

/**
 * Metric documentation with descriptions
 */
export const METRIC_DOCUMENTATION: Record<string, { description: string; category: string }> = {
  // Core delivery metrics
  METRIC_IMPRESSIONS: {
    description: "Total number of impressions served",
    category: "Delivery",
  },
  METRIC_CLICKS: {
    description: "Total number of clicks",
    category: "Delivery",
  },
  METRIC_CTR: {
    description: "Click-through rate (clicks / impressions * 100)",
    category: "Delivery",
  },
  METRIC_TOTAL_CONVERSIONS: {
    description: "Total conversions (post-click + post-view)",
    category: "Conversions",
  },
  METRIC_POST_CLICK_CONVERSIONS: {
    description: "Conversions attributed to clicks",
    category: "Conversions",
  },
  METRIC_POST_VIEW_CONVERSIONS: {
    description: "Conversions attributed to impressions (view-through)",
    category: "Conversions",
  },

  // Cost metrics
  METRIC_TOTAL_MEDIA_COST_ADVERTISER: {
    description: "Total media cost in advertiser currency",
    category: "Cost",
  },
  METRIC_TOTAL_MEDIA_COST_PARTNER: {
    description: "Total media cost in partner currency",
    category: "Cost",
  },
  METRIC_TOTAL_MEDIA_COST_USD: {
    description: "Total media cost in USD",
    category: "Cost",
  },
  METRIC_CPM_ADVERTISER: {
    description: "Cost per thousand impressions (advertiser currency)",
    category: "Cost",
  },
  METRIC_CPM_PARTNER: {
    description: "Cost per thousand impressions (partner currency)",
    category: "Cost",
  },
  METRIC_CPM_USD: {
    description: "Cost per thousand impressions (USD)",
    category: "Cost",
  },
  METRIC_CPC_ADVERTISER: {
    description: "Cost per click (advertiser currency)",
    category: "Cost",
  },
  METRIC_CPA_ADVERTISER: {
    description: "Cost per acquisition/conversion (advertiser currency)",
    category: "Cost",
  },

  // Revenue metrics
  METRIC_REVENUE_ADVERTISER: {
    description: "Total revenue in advertiser currency",
    category: "Revenue",
  },
  METRIC_REVENUE_PARTNER: {
    description: "Total revenue in partner currency",
    category: "Revenue",
  },
  METRIC_REVENUE_USD: {
    description: "Total revenue in USD",
    category: "Revenue",
  },

  // Viewability metrics
  METRIC_ACTIVE_VIEW_MEASURABLE_IMPRESSIONS: {
    description: "Impressions that were measurable for viewability",
    category: "Viewability",
  },
  METRIC_ACTIVE_VIEW_VIEWABLE_IMPRESSIONS: {
    description: "Impressions that were viewable (50% visible for 1 second)",
    category: "Viewability",
  },
  METRIC_ACTIVE_VIEW_ELIGIBLE_IMPRESSIONS: {
    description: "Impressions eligible for Active View measurement",
    category: "Viewability",
  },
  METRIC_ACTIVE_VIEW_PCT_MEASURABLE_IMPRESSIONS: {
    description: "Percentage of impressions that were measurable",
    category: "Viewability",
  },
  METRIC_ACTIVE_VIEW_PCT_VIEWABLE_IMPRESSIONS: {
    description: "Percentage of measurable impressions that were viewable",
    category: "Viewability",
  },

  // Video metrics
  METRIC_VIDEO_PLAYS: {
    description: "Number of video plays started",
    category: "Video",
  },
  METRIC_VIDEO_COMPLETIONS: {
    description: "Number of videos watched to completion",
    category: "Video",
  },
  METRIC_VIDEO_COMPLETION_RATE: {
    description: "Percentage of videos watched to completion",
    category: "Video",
  },
  METRIC_VIDEO_FIRST_QUARTILE_COMPLETIONS: {
    description: "Videos watched to 25%",
    category: "Video",
  },
  METRIC_VIDEO_MIDPOINTS: {
    description: "Videos watched to 50%",
    category: "Video",
  },
  METRIC_VIDEO_THIRD_QUARTILE_COMPLETIONS: {
    description: "Videos watched to 75%",
    category: "Video",
  },
  METRIC_VIDEO_SKIPS: {
    description: "Number of times video was skipped",
    category: "Video",
  },
  METRIC_VIDEO_PAUSE_EVENTS: {
    description: "Number of pause events",
    category: "Video",
  },
  METRIC_VIDEO_MUTES: {
    description: "Number of mute events",
    category: "Video",
  },
  METRIC_VIDEO_UNMUTES: {
    description: "Number of unmute events",
    category: "Video",
  },

  // Reach metrics
  METRIC_UNIQUE_REACH_IMPRESSION_REACH: {
    description: "Unique users reached via impressions",
    category: "Reach",
  },
  METRIC_UNIQUE_REACH_CLICK_REACH: {
    description: "Unique users who clicked",
    category: "Reach",
  },
  METRIC_UNIQUE_REACH_TOTAL_REACH: {
    description: "Total unique users reached",
    category: "Reach",
  },
  METRIC_UNIQUE_REACH_AVERAGE_IMPRESSION_FREQUENCY: {
    description: "Average impressions per unique user",
    category: "Reach",
  },

  // TrueView metrics
  METRIC_TRUEVIEW_VIEWS: {
    description: "TrueView video views (watched 30s or to completion)",
    category: "TrueView",
  },
  METRIC_TRUEVIEW_VIEW_RATE: {
    description: "TrueView view rate (views / impressions)",
    category: "TrueView",
  },
  METRIC_TRUEVIEW_EARNED_VIEWS: {
    description: "Organic views from TrueView campaigns",
    category: "TrueView",
  },
  METRIC_TRUEVIEW_EARNED_SUBSCRIBERS: {
    description: "Subscribers gained from TrueView campaigns",
    category: "TrueView",
  },
  METRIC_TRUEVIEW_EARNED_PLAYLIST_ADDITIONS: {
    description: "Playlist additions from TrueView campaigns",
    category: "TrueView",
  },
  METRIC_TRUEVIEW_EARNED_SHARES: {
    description: "Shares from TrueView campaigns",
    category: "TrueView",
  },
};

/**
 * Format metrics documentation as markdown
 */
function formatMetricsMarkdown(): string {
  const byCategory = new Map<string, Array<[string, { description: string; category: string }]>>();

  for (const [metric, doc] of Object.entries(METRIC_DOCUMENTATION)) {
    const existing = byCategory.get(doc.category) || [];
    existing.push([metric, doc]);
    byCategory.set(doc.category, existing);
  }

  let markdown = `# Bid Manager API Metrics Reference

This resource provides a complete reference of all available metrics for Bid Manager API queries.

## Usage

When calling tools like \`get_campaign_delivery\` or \`get_historical_metrics\`, the following metrics are available.

---

`;

  for (const [category, metrics] of byCategory) {
    markdown += `## ${category} Metrics\n\n`;
    markdown += "| Metric | Description |\n";
    markdown += "|--------|-------------|\n";

    for (const [metric, doc] of metrics) {
      markdown += `| \`${metric}\` | ${doc.description} |\n`;
    }

    markdown += "\n";
  }

  markdown += `---

## Common Metric Combinations

### Delivery Overview
\`\`\`
METRIC_IMPRESSIONS, METRIC_CLICKS, METRIC_CTR, METRIC_TOTAL_MEDIA_COST_ADVERTISER
\`\`\`

### Performance Metrics
\`\`\`
METRIC_IMPRESSIONS, METRIC_CLICKS, METRIC_TOTAL_CONVERSIONS, METRIC_TOTAL_MEDIA_COST_ADVERTISER, METRIC_REVENUE_ADVERTISER
\`\`\`

### Video Performance
\`\`\`
METRIC_VIDEO_PLAYS, METRIC_VIDEO_COMPLETIONS, METRIC_VIDEO_COMPLETION_RATE, METRIC_VIDEO_SKIPS
\`\`\`

### Viewability Analysis
\`\`\`
METRIC_ACTIVE_VIEW_MEASURABLE_IMPRESSIONS, METRIC_ACTIVE_VIEW_VIEWABLE_IMPRESSIONS, METRIC_ACTIVE_VIEW_PCT_VIEWABLE_IMPRESSIONS
\`\`\`
`;

  return markdown;
}

/**
 * Metric types resource definition
 */
export const metricTypesResource: Resource = {
  uri: "metric-types://all",
  name: "Bid Manager Metric Types",
  description: "Complete reference of all available Bid Manager API metrics with descriptions",
  mimeType: "text/markdown",
  getContent: () => formatMetricsMarkdown(),
};
