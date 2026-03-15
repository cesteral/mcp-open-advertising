// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * TTD Entity Troubleshooting Prompt
 *
 * Diagnostic workflow for common TTD entity errors.
 */
import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const troubleshootEntityPrompt: Prompt = {
  name: "ttd_troubleshoot_entity",
  description:
    "Diagnostic workflow for troubleshooting common TTD entity creation, update, and delivery errors",
  arguments: [
    {
      name: "entityType",
      description:
        "Entity type experiencing issues: advertiser, campaign, adGroup, or ad",
      required: true,
    },
  ],
};

export function getTroubleshootEntityMessage(
  args?: Record<string, string>
): string {
  const entityType = args?.entityType || "{entityType}";

  return `# TTD Entity Troubleshooting: ${entityType}

## Step 1: Fetch the Entity

\`\`\`
Tool: ttd_get_entity
Input: { "entityType": "${entityType}", "entityId": "{entityId}" }
\`\`\`

Check:
- Does the entity exist? (404 = deleted or wrong ID)
- What is the \`Availability\` status?
- Are parent IDs correct?

---

## Step 2: Verify Parent Hierarchy

Entities require valid parents. Verify each level:

| Entity | Check Parent |
|--------|-------------|
| Campaign | \`ttd_get_entity { "entityType": "advertiser", "entityId": "{AdvertiserId}" }\` |
| Ad Group | Verify both advertiser AND campaign exist and are active |
| Ad | Verify advertiser AND ad group exist and are active |

---

## Step 3: Check Common Errors

### Creation Errors

| Error | Likely Cause | Fix |
|-------|-------------|-----|
| \`400 Bad Request\` | Missing required field | Check \`entity-schema://${entityType}\` for required fields |
| \`400\` on campaign create | \`StartDate\` in the past | Use a future start date |
| \`400\` on ad group create | Missing \`RTBAttributes\` | Include \`BudgetSettings\` + \`BaseBidCPM\` |
| \`400\` on ad create | Invalid \`CreativeIds\` | Verify creatives exist first |
| \`403 Forbidden\` | Insufficient permissions | Verify API credentials have write access |
| \`404 Not Found\` | Wrong parent ID | Verify \`AdvertiserId\`, \`CampaignId\`, \`AdGroupId\` |
| \`409 Conflict\` | Duplicate name or constraint | Change entity name or check uniqueness constraints |

### Update Errors

| Error | Likely Cause | Fix |
|-------|-------------|-----|
| \`400\` on update | Immutable field in payload | Remove read-only fields (\`CampaignId\`, \`AdvertiserId\`, etc.) |
| \`400\` on budget update | Budget below spent amount | Set budget >= current spend |
| \`404\` on update | Entity was deleted | Verify entity still exists |
| Partial update ignored | TTD uses PUT (full replace) | Include ALL fields you want to keep, not just changed ones |

### Delivery Issues

| Symptom | Diagnostic Steps |
|---------|-----------------|
| No impressions | 1. Check \`Availability\` is \`Available\` at ALL levels (campaign, ad group, ad) |
| | 2. Verify \`StartDate\` has passed and \`EndDate\` hasn't |
| | 3. Check budget hasn't been exhausted |
| | 4. Verify ad group has valid targeting |
| Low delivery | 1. Check bid levels vs. market (\`BaseBidCPM\` too low?) |
| | 2. Check targeting is not too narrow |
| | 3. Review frequency caps |
| Overspend | 1. Check \`PacingMode\` (is it \`Off\`?) |
| | 2. Verify daily budget cap is set |
| | 3. Check \`MaxBidCPM\` is set |

---

## Step 4: Fix and Verify

After identifying the issue:

1. **Apply fix** via \`ttd_update_entity\`:
\`\`\`
Tool: ttd_update_entity
Input: { "entityType": "${entityType}", "entityId": "{entityId}", "data": { /* fixed fields */ } }
\`\`\`

2. **Re-fetch** the entity to confirm changes applied:
\`\`\`
Tool: ttd_get_entity
Input: { "entityType": "${entityType}", "entityId": "{entityId}" }
\`\`\`

3. **Run a report** to verify delivery status (if applicable):
\`\`\`
Tool: ttd_get_report
Input: { "reportName": "Delivery Check", "dateRange": "Yesterday", "dimensions": ["CampaignId"], "metrics": ["Impressions", "TotalCost"] }
\`\`\`

---

## Important Notes

- TTD uses **PUT for updates** — the payload replaces the full entity. To change one field, GET the entity first, modify the field, then PUT the full object back.
- \`Availability: "Archived"\` is effectively a soft delete — entities cannot be un-archived.
- Changes to bids and budgets take effect within minutes; targeting changes may take longer.
- Payloads with more than 25 fields consistently show higher latency (>20s). When updating, prefer smaller staged updates — only include fields that actually need to change alongside any required fields.

## Related Resources
- \`entity-schema://${entityType}\` — Field reference for ${entityType}
- \`entity-examples://${entityType}\` — CRUD examples
- \`entity-hierarchy://all\` — Parent-child relationships
`;
}