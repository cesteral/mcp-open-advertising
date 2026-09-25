// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const entityUpdateWorkflowPrompt: Prompt = {
  name: "cm360_entity_update_workflow",
  description: "Safe entity update workflow for CM360 (PATCH semantics — send only changed fields)",
  arguments: [
    {
      name: "entityType",
      description:
        "Entity type (campaign, placement, ad, creative, site, advertiser, floodlightActivity, floodlightConfiguration)",
      required: true,
    },
    {
      name: "entityId",
      description: "Entity ID to update",
      required: true,
    },
  ],
};

export function getEntityUpdateWorkflowMessage(args?: Record<string, string>): string {
  const entityType = args?.entityType || "{entityType}";
  const entityId = args?.entityId || "{entityId}";
  return `# CM360 Entity Update Workflow

## Update semantics: PATCH
\`cm360_update_entity\` calls CM360's \`PATCH ?id=\` endpoint. Send **only the fields you want to change** — every field you omit keeps its current value. Nested objects are merged; arrays are replaced whole (send the complete array when changing one).

## Entity: ${entityType} (ID: ${entityId})

## Step 1: Fetch Current State

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

## Step 2: Validate Changes (Dry Run)

\`\`\`json
{
  "tool": "cm360_validate_entity",
  "params": {
    "entityType": "${entityType}",
    "mode": "update",
    "data": { "id": "${entityId}", "...fields to change..." }
  }
}
\`\`\`

## Step 3: Apply Update

Send only the changed fields (use \`dry_run: true\` first to preview the merged result):

\`\`\`json
{
  "tool": "cm360_update_entity",
  "params": {
    "profileId": "PROFILE_ID",
    "entityType": "${entityType}",
    "entityId": "${entityId}",
    "data": { "...fields to change..." }
  }
}
\`\`\`

## Step 4: Verify

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

## Gotchas

| Issue | Solution |
|-------|----------|
| Arrays are replaced, not merged | Send the full array (from Step 1) when changing one element |
| Read-only fields rejected | Remove \`id\`, \`kind\`, \`accountId\` from payload |
| Status changes may cascade | Deactivating campaign affects placements/ads |
| Some entities can't be deleted | Use archived/inactive status instead |
`;
}
