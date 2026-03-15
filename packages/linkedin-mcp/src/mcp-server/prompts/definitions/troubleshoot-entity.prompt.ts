// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const linkedInTroubleshootEntityPrompt: Prompt = {
  name: "linkedin_troubleshoot_entity",
  description: "Diagnostic workflow for troubleshooting LinkedIn Ads entity issues",
  arguments: [
    {
      name: "entityType",
      description: "Entity type (campaignGroup, campaign, creative, conversionRule)",
      required: true,
    },
    {
      name: "entityUrn",
      description: "Entity URN to troubleshoot (e.g., urn:li:sponsoredCampaign:123)",
      required: true,
    },
  ],
};

export function getLinkedInTroubleshootEntityMessage(
  args?: Record<string, string>,
): string {
  const entityType = args?.entityType || "{entityType}";
  const entityUrn = args?.entityUrn || "{entityUrn}";

  return `# LinkedIn Entity Troubleshoot Workflow

## Target: ${entityType} ${entityUrn}

## Step 1: Fetch Entity Details

\`\`\`json
linkedin_get_entity({
  "entityType": "${entityType}",
  "entityUrn": "${entityUrn}"
})
\`\`\`

Check: status, review status, serving status, and any rejection reasons.

## Step 2: Check Recent Analytics

\`\`\`json
linkedin_get_analytics({
  "adAccountUrn": "urn:li:sponsoredAccount:{accountId}",
  "startDate": "2026-02-01",
  "endDate": "2026-03-07",
  "metrics": ["impressions", "clicks", "costInUsd", "conversions"],
  "pivot": "CAMPAIGN",
  "campaigns": ["${entityUrn}"]
})
\`\`\`

## Step 3: Check Parent Entity

If campaign or creative, check parent status:
\`\`\`json
linkedin_get_entity({
  "entityType": "campaignGroup",
  "entityUrn": "urn:li:sponsoredCampaignGroup:{groupId}"
})
\`\`\`

## Common Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| No delivery | Entity PAUSED | Update status to ACTIVE |
| No delivery, ACTIVE | Parent group paused | Activate parent campaign group |
| No delivery, all ACTIVE | Budget exhausted | Increase budget or check flight dates |
| No delivery, budget OK | Targeting too narrow | Broaden targeting or check forecast |
| Creative pending | LinkedIn review in progress | Allow 24-48h for creative review |
| Creative rejected | Policy violation | Review content guidelines, update creative |
| No impressions | Missing targeting criteria | Add targeting to the campaign |
| Low reach | Audience too restrictive | Expand facets or remove exclusions |

## Step 4: Delivery Forecast (for campaigns)

\`\`\`json
linkedin_get_delivery_forecast({
  "adAccountUrn": "urn:li:sponsoredAccount:{accountId}",
  "targetingCriteria": { ... targeting from campaign ... }
})
\`\`\`

## Step 5: Validate Payload

\`\`\`json
linkedin_validate_entity({
  "entityType": "${entityType}",
  "mode": "update",
  "data": { ... current entity data ... }
})
\`\`\`
`;
}