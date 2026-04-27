// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const troubleshootEntityPrompt: Prompt = {
  name: "cm360_troubleshoot_entity",
  description: "Diagnostic workflow for troubleshooting CM360 entity issues",
  arguments: [
    {
      name: "entityType",
      description: "Entity type to troubleshoot",
      required: true,
    },
    {
      name: "entityId",
      description: "Entity ID to troubleshoot",
      required: true,
    },
  ],
};

export function getTroubleshootEntityMessage(args?: Record<string, string>): string {
  const entityType = args?.entityType || "{entityType}";
  const entityId = args?.entityId || "{entityId}";
  return `# CM360 Troubleshooting: ${entityType} (${entityId})

## Step 1: Fetch Entity

\`\`\`json
{
  "tool": "cm360_get_entity",
  "params": {
    "profileId": "PROFILE_ID",
    "entityType": "${entityType}",
    "entityId": "${entityId}"
  }
}
\`\`\`

## Step 2: Check Parent Chain

Verify parent entities are active:
- Campaign: active?
- Placement: active? Site linked?
- Ad: placement + creative assigned?

## Step 3: Run Delivery Report

\`\`\`json
{
  "tool": "cm360_get_report",
  "params": {
    "profileId": "PROFILE_ID",
    "reportType": "STANDARD",
    "dateRange": { "startDate": "2026-03-01", "endDate": "2026-03-12" },
    "dimensions": ["${entityType}"],
    "metrics": ["impressions", "clicks"]
  }
}
\`\`\`

## Common Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Ad not serving | Placement inactive | Activate placement |
| No impressions | Creative-placement size mismatch | Match creative size to placement |
| Creative rejected | Missing required asset | Check creative type requirements |
| Placement errors | Site not approved | Verify site status |
| Floodlight not firing | Activity configuration | Check floodlight tag and activity settings |
| Update fails | Missing required fields | Fetch full object first (PUT semantics) |
`;
}
