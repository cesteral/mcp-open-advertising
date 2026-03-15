// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * Entity Update Execution Workflow Prompt
 *
 * Portable execution workflow for safe DV360 updates.
 */
export const entityUpdateExecutionPrompt: Prompt = {
  name: "entity_update_execution_workflow",
  description:
    "Step-by-step execution workflow for safe DV360 entity updates using schema-first validation and updateMask discipline.",
  arguments: [
    {
      name: "advertiserId",
      description: "DV360 Advertiser ID",
      required: true,
    },
    {
      name: "entityType",
      description:
        "DV360 entity type to update (e.g. campaign, insertionOrder, lineItem)",
      required: true,
    },
    {
      name: "changeGoal",
      description:
        "Short description of intended change (e.g. increase bid, pause line item, extend dates)",
      required: false,
    },
  ],
};

export function getEntityUpdateExecutionPromptMessage(args?: Record<string, string>): string {
  const advertiserId = args?.advertiserId || "{advertiserId}";
  const entityType = args?.entityType || "{entityType}";
  const changeGoal = args?.changeGoal || "apply a targeted entity update";

  return `# Entity Update Execution Workflow

## Context
- Advertiser ID: ${advertiserId}
- Entity Type: ${entityType}
- Goal: ${changeGoal}

Use this workflow to apply a safe, auditable update with minimal context overhead.

## Step 1: Fetch schema and field paths
1. Read \`entity-schema://${entityType}\`
2. Read \`entity-fields://${entityType}\`
3. Optionally read \`entity-examples://${entityType}\`

Do not construct payloads before this step.

## Step 2: Resolve IDs and current state
1. Identify required parent IDs from schema metadata
2. Call \`dv360_get_entity\` to inspect current values
3. Confirm the entity is the intended target before modifying

## Step 3: Build minimal update payload
- Include only fields that change in \`data\`
- Build \`updateMask\` using exact field paths from \`entity-fields://${entityType}\`
- Add a concise \`reason\` for auditability

## Step 4: Execute update
Call \`dv360_update_entity\` with:
- \`advertiserId\`
- \`entityType\`
- required parent/entity IDs
- minimal \`data\`
- exact \`updateMask\`
- \`reason\`

## Step 5: Verify and summarize
1. Re-read the entity with \`dv360_get_entity\`
2. Confirm updated fields match intent
3. Report:
   - changed fields
   - previous vs current key values
   - rollback hint (inverse update)

## Safety rules
- Never use broad updateMask values
- Never include unrelated fields in data
- Prefer one small update over a large multi-field patch
- If schema mismatch occurs, refetch \`entity-fields://${entityType}\` and retry
`;
}