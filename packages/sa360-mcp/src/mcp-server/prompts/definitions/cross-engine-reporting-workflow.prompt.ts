import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const crossEngineReportingWorkflowPrompt: Prompt = {
  name: "sa360_cross_engine_reporting_workflow",
  description:
    "Guide for unified cross-engine reporting across Google Ads, Microsoft Ads, Yahoo Japan, and Baidu",
  arguments: [
    {
      name: "customerId",
      description: "SA360 Manager Account Customer ID",
      required: true,
    },
  ],
};

export function getCrossEngineReportingWorkflowMessage(
  args?: Record<string, string>
): string {
  const customerId = args?.customerId || "{customerId}";
  return `# SA360 Cross-Engine Reporting Workflow

## Manager Account: ${customerId}

SA360 provides unified reporting across all search engines managed through a single manager account.

## Step 1: Discover Accounts

\`\`\`json
{
  "tool": "sa360_list_accounts",
  "params": {}
}
\`\`\`

## Step 2: Cross-Engine Campaign Performance

\`\`\`json
{
  "tool": "sa360_search",
  "params": {
    "customerId": "${customerId}",
    "query": "SELECT campaign.name, campaign.status, campaign.engine_id, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date DURING LAST_30_DAYS ORDER BY metrics.cost_micros DESC"
  }
}
\`\`\`

## Step 3: Cross-Engine Ad Group Performance

\`\`\`json
{
  "tool": "sa360_get_insights_breakdowns",
  "params": {
    "customerId": "${customerId}",
    "entityType": "adGroup",
    "dateRange": "LAST_30_DAYS",
    "breakdowns": ["campaign"]
  }
}
\`\`\`

## Step 4: Keyword Performance Across Engines

\`\`\`json
{
  "tool": "sa360_search",
  "params": {
    "customerId": "${customerId}",
    "query": "SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, metrics.impressions, metrics.clicks, metrics.conversions, metrics.cost_micros FROM ad_group_criterion WHERE ad_group_criterion.type = 'KEYWORD' AND segments.date DURING LAST_30_DAYS ORDER BY metrics.conversions DESC LIMIT 50"
  }
}
\`\`\`

## Step 5: Custom Columns (if defined)

\`\`\`json
{
  "tool": "sa360_list_custom_columns",
  "params": {
    "customerId": "${customerId}"
  }
}
\`\`\`

## Supported Search Engines

| Engine | Description |
|--------|-------------|
| Google Ads | Search, Shopping, Display |
| Microsoft Ads | Bing search and partner networks |
| Yahoo Japan | Yahoo! Japan sponsored search |
| Baidu | Chinese search engine |

## Gotchas

| Issue | Solution |
|-------|----------|
| SA360 is read-only for entities | Use source engine servers (gads-mcp, etc.) for modifications |
| cost_micros across engines | All normalized to micros regardless of engine |
| Conversion attribution | SA360 provides cross-engine attribution via Floodlight |
| Manager vs sub-accounts | Use manager account ID for cross-account queries |
`;
}
