import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * LinkedIn Entity Update Workflow Prompt
 *
 * Guides AI agents through safely updating LinkedIn Ads entities:
 * campaign groups, campaigns, creatives, and conversion rules.
 */
export const linkedInEntityUpdateWorkflowPrompt: Prompt = {
  name: "linkedin_entity_update_workflow",
  description:
    "Step-by-step guide for safely updating LinkedIn Ads entities using PATCH semantics with URN-based IDs. Covers campaign groups, campaigns, creatives, and conversion rules.",
  arguments: [
    {
      name: "entityType",
      description:
        "Entity type to update: campaignGroup, campaign, creative, or conversionRule",
      required: true,
    },
    {
      name: "entityUrn",
      description: "URN of the entity to update (e.g., urn:li:sponsoredCampaign:123)",
      required: true,
    },
  ],
};

export function getLinkedInEntityUpdateWorkflowMessage(
  args?: Record<string, string>,
): string {
  const entityType = args?.entityType || "{entityType}";
  const entityUrn = args?.entityUrn || "{entityUrn}";

  return `# LinkedIn Ads Entity Update Workflow

Entity Type: \`${entityType}\`
Entity URN: \`${entityUrn}\`

---

## Step 1: Fetch Current State

Before updating, always read the entity's current configuration:

\`\`\`json
{
  "tool": "linkedin_get_entity",
  "params": {
    "entityType": "${entityType}",
    "entityUrn": "${entityUrn}"
  }
}
\`\`\`

Review the current values. Save the current state for rollback reference.

**Resource reference:** Fetch \`entity-schema://${entityType}\` for the full field schema and \`entity-examples://${entityType}\` for common update patterns.

---

## Step 2: Build Update Payload

LinkedIn uses PATCH semantics — only include the fields you want to change. Unspecified fields remain unchanged.

### Campaign Group Updates

\`\`\`json
{
  "tool": "linkedin_update_entity",
  "params": {
    "entityType": "campaignGroup",
    "entityUrn": "${entityUrn}",
    "data": {
      "name": "Updated Campaign Group Name",
      "status": "ACTIVE",
      "totalBudget": { "amount": "15000.00", "currencyCode": "USD" }
    }
  }
}
\`\`\`

### Campaign Updates

\`\`\`json
{
  "tool": "linkedin_update_entity",
  "params": {
    "entityType": "campaign",
    "entityUrn": "${entityUrn}",
    "data": {
      "dailyBudget": { "amount": "150.00", "currencyCode": "USD" },
      "unitCost": { "amount": "15.00", "currencyCode": "USD" },
      "status": "ACTIVE"
    }
  }
}
\`\`\`

### Creative Updates

\`\`\`json
{
  "tool": "linkedin_update_entity",
  "params": {
    "entityType": "creative",
    "entityUrn": "${entityUrn}",
    "data": {
      "status": "ACTIVE"
    }
  }
}
\`\`\`

---

## Step 3: Execute and Verify

After the update call succeeds, verify the changes:

\`\`\`json
{
  "tool": "linkedin_get_entity",
  "params": {
    "entityType": "${entityType}",
    "entityUrn": "${entityUrn}"
  }
}
\`\`\`

Compare the returned values with what you set in Step 2.

---

## Gotchas

- **URN format required**: All entity IDs must be full URNs (e.g., \`urn:li:sponsoredCampaign:123\`), not bare numeric IDs.
- **Budget format**: Use CurrencyAmount objects: \`{ "amount": "100.00", "currencyCode": "USD" }\`. The amount is a string, not a number.
- **Targeting replaces entirely**: When updating \`targetingCriteria\`, the entire object is replaced. Always include all criteria you want to keep.
- **Status values**: \`ACTIVE\`, \`PAUSED\`, \`ARCHIVED\`, \`DRAFT\`. Archiving is irreversible.
- **Creative review lag**: Status changes to creatives may trigger re-review (24-48h).
- **PATCH semantics**: Only send fields you want to change. Unspecified fields are preserved.

---

## Rollback

If an update causes issues, reverse it by sending the original values:

\`\`\`json
{
  "tool": "linkedin_update_entity",
  "params": {
    "entityType": "${entityType}",
    "entityUrn": "${entityUrn}",
    "data": {
      "field_that_was_changed": "{original_value}"
    }
  }
}
\`\`\`

Report the rollback hint (original values) whenever you make a change so the user can revert if needed.
`;
}
