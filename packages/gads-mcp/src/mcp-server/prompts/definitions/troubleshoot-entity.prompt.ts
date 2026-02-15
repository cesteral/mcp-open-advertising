/**
 * Google Ads Entity Troubleshooting Prompt
 *
 * Diagnostic workflow for common Google Ads entity issues.
 */
import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const troubleshootEntityPrompt: Prompt = {
  name: "gads_troubleshoot_entity",
  description:
    "Step-by-step diagnostic workflow for troubleshooting Google Ads entity errors and common issues",
  arguments: [
    {
      name: "entityType",
      description:
        "Entity type to troubleshoot (campaign, adGroup, ad, keyword, campaignBudget, asset)",
      required: false,
    },
    {
      name: "errorMessage",
      description: "The error message or symptom you are investigating",
      required: false,
    },
  ],
};

export function getTroubleshootEntityMessage(
  args?: Record<string, string>
): string {
  const entityType = args?.entityType || "{entityType}";
  const errorMessage = args?.errorMessage || "(not specified)";

  return `# Google Ads Entity Troubleshooting

## Context
- Entity Type: \`${entityType}\`
- Reported Error: ${errorMessage}
- Platform: Google Ads API v23

---

## Step 1: Verify the Entity Exists

\`\`\`
Tool: gads_get_entity
Input: { "entityType": "${entityType}", "customerId": "{customerId}", "entityId": "{entityId}" }
\`\`\`

**Check**: Does the entity exist? What is its current status?

If the entity is not found, check:
- Is the \`customerId\` correct (no dashes, 10 digits)?
- For composite IDs (\`ad\`, \`keyword\`): is the format \`{adGroupId}~{criterionId}\`?
- Was the entity already removed?

---

## Step 2: Check Parent References

Google Ads entities form a strict hierarchy. Verify each parent exists:

| Entity | Parent | How to Check |
|--------|--------|-------------|
| \`campaign\` | \`campaignBudget\` | Budget resource name must exist |
| \`adGroup\` | \`campaign\` | Campaign resource name must exist |
| \`ad\` | \`adGroup\` | Ad group resource name must exist |
| \`keyword\` | \`adGroup\` | Ad group resource name must exist |
| \`asset\` | _(standalone)_ | No parent required |

Use GAQL to verify:
\`\`\`
Tool: gads_gaql_search
Input: {
  "customerId": "{customerId}",
  "query": "SELECT campaign.id, campaign.status FROM campaign WHERE campaign.id = {campaignId}"
}
\`\`\`

---

## Step 3: Inspect Status Chain

An entity can only serve if its **entire hierarchy** is ENABLED:

\`\`\`
campaignBudget (has sufficient amount)
  └── campaign (ENABLED)
       └── adGroup (ENABLED)
            ├── ad (ENABLED, approved)
            └── keyword (ENABLED, approved)
\`\`\`

Use GAQL to check the full chain:
\`\`\`
Tool: gads_gaql_search
Input: {
  "customerId": "{customerId}",
  "query": "SELECT campaign.status, ad_group.status, ad_group_ad.status, ad_group_ad.ad.type FROM ad_group_ad WHERE campaign.id = {campaignId} LIMIT 10"
}
\`\`\`

---

## Step 4: Check Field Values and Constraints

### Common Field Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| \`MUTATE_ERROR_CAMPAIGN_BUDGET_NOT_FOUND\` | Budget resource name doesn't exist | Create the budget first, then reference it |
| \`FIELD_MASK_ERROR_FIELD_NOT_FOUND\` | Invalid field in \`updateMask\` | Check \`entity-schema://${entityType}\` for valid fields |
| \`FIELD_ERROR_IMMUTABLE_FIELD\` | Trying to change an immutable field | \`advertisingChannelType\`, \`type\` cannot be changed after creation |
| \`VALUE_ERROR_MICROS_TOO_SMALL\` | Bid or budget is below minimum | Minimum CPC is usually $0.01 (10000 micros) |
| \`AD_ERROR_INVALID_HEADLINE\` | Headline too long or contains invalid chars | Max 30 chars, no exclamation marks in headlines |
| \`KEYWORD_ERROR_DUPLICATE_KEYWORD\` | Same keyword+match type already exists | Check existing keywords with \`gads_list_entities\` |
| \`RESOURCE_NOT_FOUND\` | Entity was removed or never existed | Check \`entityId\` and \`customerId\` |

---

## Step 5: Validate Resource Names

Google Ads uses full resource name paths. Common format errors:

| Format | Example | Notes |
|--------|---------|-------|
| Campaign | \`customers/1234567890/campaigns/111222333\` | 10-digit customer ID, no dashes |
| Ad Group | \`customers/1234567890/adGroups/444555666\` | camelCase \`adGroups\` |
| Budget | \`customers/1234567890/campaignBudgets/777888999\` | camelCase \`campaignBudgets\` |
| Ad (composite) | \`{adGroupId}~{adId}\` | Tilde separator for get/update |
| Keyword (composite) | \`{adGroupId}~{criterionId}\` | Tilde separator for get/update |

---

## Step 6: Common Error Resolution Patterns

### "Budget not found" when creating campaign
1. Create budget: \`gads_create_entity\` with \`entityType: "campaignBudget"\`
2. Note the returned resource name
3. Use that resource name in the campaign's \`campaignBudget\` field

### "Entity cannot be modified" (REMOVED status)
- Removed entities cannot be updated — create a new one instead
- REMOVED is permanent in Google Ads

### "Field mask required"
- \`gads_update_entity\` requires \`updateMask\` — a comma-separated list of fields being changed
- Example: \`"updateMask": "status,name"\`

### "Invalid customer ID"
- Customer ID must be 10 digits with no dashes
- Use \`gads_list_accounts\` to find correct IDs
- If using a manager account, set \`loginCustomerId\` in headers

### GAQL query errors
- Use \`gaql-reference://syntax\` resource for syntax reference
- Common issue: single quotes around string values are required
- Date format: \`'YYYY-MM-DD'\`

---

## Quick Diagnostic GAQL Queries

### Check campaign status and budget
\`\`\`sql
SELECT campaign.name, campaign.status, campaign_budget.amount_micros
FROM campaign WHERE campaign.id = {campaignId}
\`\`\`

### Find disapproved ads
\`\`\`sql
SELECT ad_group_ad.ad.id, ad_group_ad.policy_summary.approval_status
FROM ad_group_ad WHERE ad_group_ad.policy_summary.approval_status != 'APPROVED'
\`\`\`

### Check keyword quality scores
\`\`\`sql
SELECT ad_group_criterion.keyword.text, ad_group_criterion.quality_info.quality_score
FROM keyword_view WHERE campaign.id = {campaignId}
\`\`\`

---

## Related Resources
- \`entity-schema://${entityType}\` — Full field reference
- \`entity-examples://${entityType}\` — Example payloads
- \`entity-hierarchy://gads\` — Entity relationships
- \`gaql-reference://syntax\` — GAQL query syntax
`;
}
