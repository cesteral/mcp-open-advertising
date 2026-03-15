// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const targetingDiscoveryWorkflowPrompt: Prompt = {
  name: "cm360_targeting_discovery_workflow",
  description: "Guide for browsing CM360 targeting options",
  arguments: [
    {
      name: "profileId",
      description: "CM360 User Profile ID",
      required: true,
    },
  ],
};

export function getTargetingDiscoveryWorkflowMessage(
  args?: Record<string, string>,
): string {
  const profileId = args?.profileId || "{profileId}";
  return `# CM360 Targeting Discovery Workflow

## Profile ID: ${profileId}

## Step 1: Browse Targeting Categories

\`\`\`json
{
  "tool": "cm360_list_targeting_options",
  "params": {
    "profileId": "${profileId}",
    "targetingType": "all"
  }
}
\`\`\`

## Targeting Types

| Type | Description |
|------|-------------|
| Geographic | Countries, regions, cities, DMAs |
| Content | Content categories, keywords |
| Technology | Browsers, operating systems, device types |
| Audience | First-party and third-party audience lists |
| Language | Language targeting |
| Day/Time | Day parting and time-based targeting |

## Step 2: Apply to Placement

Targeting in CM360 is typically set at the **placement** or **ad** level, not campaign level.

## Notes

- CM360 targeting is simpler than self-serve platforms
- Most targeting is managed via the ad server trafficking workflow
- Use \`cm360_list_targeting_options\` to discover available options
`;
}