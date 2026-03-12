import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const troubleshootEntityPrompt: Prompt = {
  name: "sa360_troubleshoot_entity",
  description:
    "Diagnostic workflow for troubleshooting SA360 reporting and conversion issues",
  arguments: [
    {
      name: "issue",
      description:
        "Issue type: missing-data, conversion-errors, query-errors, account-access",
      required: false,
    },
  ],
};

export function getTroubleshootEntityMessage(
  args?: Record<string, string>
): string {
  const issue = args?.issue || "general";
  return `# SA360 Troubleshooting Guide

## Issue Type: ${issue}

## Missing Data

### Step 1: Verify Account Access
\`\`\`json
{ "tool": "sa360_list_accounts", "params": {} }
\`\`\`

### Step 2: Check Entity Exists
\`\`\`json
{ "tool": "sa360_get_entity", "params": { "customerId": "CUSTOMER_ID", "entityType": "campaign", "entityId": "CAMPAIGN_ID" } }
\`\`\`

### Step 3: Test Simple Query
\`\`\`json
{ "tool": "sa360_search", "params": { "customerId": "CUSTOMER_ID", "query": "SELECT campaign.name, campaign.status FROM campaign LIMIT 5" } }
\`\`\`

## Conversion Upload Errors

### Validate Before Upload
\`\`\`json
{ "tool": "sa360_validate_conversion", "params": { "mode": "insert", "conversion": { "clickId": "TEST_CLICK_ID", "conversionId": "test-001", "conversionTimestamp": "1709251200000", "segmentationType": "FLOODLIGHT", "segmentationName": "purchase", "type": "TRANSACTION" } } }
\`\`\`

## Common Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Empty query results | Wrong date range or customer ID | Verify ID, try broader date range |
| "Field not found" | Invalid field name | Use \`sa360_search_fields\` to check |
| Conversion rejected | Bad clickId or expired (>90 days) | Verify gclid is valid and recent |
| "Permission denied" | Account not accessible | Check OAuth scopes and account linking |
| Duplicate conversion | Same conversionId already uploaded | Use unique IDs per conversion |
| Revenue not showing | Missing revenueMicros or wrong type | Use type=TRANSACTION with revenueMicros |
| Query timeout | Too broad a query | Add date filters, reduce LIMIT |
`;
}
