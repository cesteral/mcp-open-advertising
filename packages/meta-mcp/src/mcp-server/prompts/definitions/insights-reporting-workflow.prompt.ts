import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const insightsReportingWorkflowPrompt: Prompt = {
  name: "meta_insights_reporting_workflow",
  description: "Guide for querying Meta Ads performance insights with breakdowns and attribution",
  arguments: [
    {
      name: "adAccountId",
      description: "Meta Ad Account ID",
      required: true,
    },
    {
      name: "entityLevel",
      description: "Reporting level: account, campaign, adset, ad",
      required: false,
    },
  ],
};

export function getInsightsReportingWorkflowMessage(args?: Record<string, string>): string {
  const adAccountId = args?.adAccountId || "{adAccountId}";
  const entityLevel = args?.entityLevel || "campaign";

  return `# Meta Insights Reporting Workflow

## Step 1: Basic Performance Query

\`\`\`json
meta_get_insights({
  "entityId": "${adAccountId}",
  "datePreset": "last_7d",
  "level": "${entityLevel}"
})
\`\`\`

## Step 2: Add Breakdowns

\`\`\`json
meta_get_insights_breakdowns({
  "entityId": "${adAccountId}",
  "breakdowns": ["age", "gender"],
  "datePreset": "last_30d",
  "level": "${entityLevel}"
})
\`\`\`

## Step 3: Daily Trend Analysis

\`\`\`json
meta_get_insights({
  "entityId": "${adAccountId}",
  "timeRange": { "since": "2026-01-01", "until": "2026-01-31" },
  "timeIncrement": "1",
  "level": "${entityLevel}"
})
\`\`\`

## Step 4: Attribution Analysis

\`\`\`json
meta_get_insights_breakdowns({
  "entityId": "${adAccountId}",
  "breakdowns": ["device_platform"],
  "fields": ["impressions", "clicks", "spend", "actions", "action_values"],
  "datePreset": "last_30d",
  "actionAttributionWindows": ["1d_click", "7d_click", "1d_view"]
})
\`\`\`

## Resource References

- Fetch \`insights-reference://all\` for full metrics and breakdowns list
- Fetch \`entity-hierarchy://all\` for entity relationships

## Tips

- Data may lag up to **48 hours**
- Use \`last_7d\` or \`last_30d\` for most analyses
- Limit to ~20 metrics per call for best performance
- Valid breakdown combos: age+gender, device+publisher (NOT country+region)
`;
}
