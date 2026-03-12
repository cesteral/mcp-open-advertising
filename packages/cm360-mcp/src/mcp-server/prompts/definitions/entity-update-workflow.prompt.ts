import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const entityUpdateWorkflowPrompt: Prompt = {
  name: "cm360_entity_update_workflow",
  description:
    "Safe entity update workflow for CM360 (PUT semantics — full object required)",
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

export function getEntityUpdateWorkflowMessage(
  args?: Record<string, string>,
): string {
  const entityType = args?.entityType || "{entityType}";
  const entityId = args?.entityId || "{entityId}";
  return `# CM360 Entity Update Workflow

## CRITICAL: CM360 uses PUT semantics
Unlike other platforms, CM360 requires the **full entity object** for updates. Missing fields will be reset to defaults.

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
    "data": { "...full object with modifications..." }
  }
}
\`\`\`

## Step 3: Apply Update

Merge your changes into the full object from Step 1:

\`\`\`json
{
  "tool": "cm360_update_entity",
  "params": {
    "profileId": "PROFILE_ID",
    "entityType": "${entityType}",
    "entityId": "${entityId}",
    "data": { "...full merged object..." }
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
| PUT replaces entire object | Always fetch then merge then update |
| Read-only fields rejected | Remove \`id\`, \`kind\`, \`accountId\` from payload |
| Status changes may cascade | Deactivating campaign affects placements/ads |
| Some entities can't be deleted | Use archived/inactive status instead |
`;
}
