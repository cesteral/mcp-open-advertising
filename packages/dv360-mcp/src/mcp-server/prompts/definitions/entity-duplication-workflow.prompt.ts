// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * Entity Duplication Workflow Prompt
 *
 * Guides AI agents through duplicating DV360 entities. Line items and insertion
 * orders go through `dv360_duplicate_entity` (native `lineItems:duplicate` for
 * line items); campaigns, which have no duplicate method, use get-then-create.
 */
export const entityDuplicationWorkflowPrompt: Prompt = {
  name: "entity_duplication_workflow",
  description:
    "Step-by-step guide for duplicating DV360 entities (campaigns, insertion orders, line items). Line items use DV360's native lineItems:duplicate via dv360_duplicate_entity; campaigns use the get-then-create pattern.",
  arguments: [
    {
      name: "advertiserId",
      description: "DV360 Advertiser ID",
      required: true,
    },
    {
      name: "entityType",
      description: "Entity type to duplicate: campaign, insertionOrder, or lineItem",
      required: true,
    },
    {
      name: "sourceEntityId",
      description: "ID of the entity to duplicate",
      required: false,
    },
    {
      name: "includeChildren",
      description:
        "Whether to also duplicate child entities (e.g. IOs under a campaign, line items under an IO). Default: false",
      required: false,
    },
  ],
};

export function getEntityDuplicationWorkflowPromptMessage(args?: Record<string, string>): string {
  const advertiserId = args?.advertiserId || "{advertiserId}";
  const entityType = args?.entityType || "{entityType}";
  const sourceEntityId = args?.sourceEntityId || "{sourceEntityId}";
  const includeChildren = args?.includeChildren === "true";

  const entityIdField =
    entityType === "campaign"
      ? "campaignId"
      : entityType === "insertionOrder"
        ? "insertionOrderId"
        : "lineItemId";

  return `# DV360 Entity Duplication Workflow

## Context
- Advertiser ID: \`${advertiserId}\`
- Entity Type: \`${entityType}\`
- Source Entity ID: \`${sourceEntityId}\`
- Duplicate children: \`${includeChildren ? "yes" : "no"}\`

> **Use \`dv360_duplicate_entity\` for line items and insertion orders.** For a **line item** it calls DV360's native \`lineItems:duplicate\` method (a server-side copy) and never leaves the copy running. For an **insertion order** (DV360 has no native IO duplicate) it reads the source and creates the copy in \`ENTITY_STATUS_DRAFT\`. Only **campaigns** need the manual get-then-create steps below.
>
> \`\`\`json
> { "tool": "dv360_duplicate_entity", "params": { "entityType": "lineItem", "advertiserId": "${advertiserId}", "lineItemId": "{source line item id}", "displayName": "[Copy] {name}" } }
> \`\`\`

---

## Step 1: Fetch schema for the entity type

Read the entity schema before constructing any payload:

\`\`\`
entity-schema://${entityType}
entity-fields://${entityType}
entity-examples://${entityType}
\`\`\`

This tells you which fields are required, which are read-only (server-assigned), and which parent IDs are needed.

---

## Step 2: Fetch the source entity

\`\`\`json
{
  "tool": "dv360_get_entity",
  "params": {
    "entityType": "${entityType}",
    "advertiserId": "${advertiserId}",
    "${entityIdField}": "${sourceEntityId}"
  }
}
\`\`\`

Save the full response — this is your duplication template.

---

## Step 3: Strip server-assigned fields

Remove all fields that DV360 assigns automatically. **Never include these in a create payload:**

| Field | Why strip it |
|-------|-------------|
| \`${entityIdField}\` | New entity gets a new ID |
| \`campaignId\` (on IO/LI) | Kept only if duplicating into same campaign |
| \`insertionOrderId\` (on LI) | Kept only if duplicating into same IO |
| \`name\` (resource name, e.g. \`advertisers/x/campaigns/y\`) | Server-generated |
| \`updateTime\` / \`createTime\` | Server-generated timestamps |
| \`entityStatus\` | See GOTCHA below |

⚠️ **GOTCHA: Campaign status** — Campaigns **cannot** be created in \`ENTITY_STATUS_DRAFT\`. Set \`entityStatus\` to \`ENTITY_STATUS_PAUSED\` (safest) or \`ENTITY_STATUS_ACTIVE\`. If the source campaign is DRAFT, override this field.

⚠️ **GOTCHA: Insertion Order and Line Item status** — DV360 only accepts \`ENTITY_STATUS_DRAFT\` when creating an IO or a line item. PAUSED or ACTIVE is rejected; activate after creation with an update.

⚠️ **GOTCHA: Line item budget pacing** — Line items inherit pacing from their parent IO by default (\`budget.budgetAllocationType: "LINE_ITEM_BUDGET_ALLOCATION_TYPE_AUTOMATIC"\`). If the source line item overrides pacing, that override is copied too — verify it is still appropriate.

---

## Step 4: Adjust the display name

Always change \`displayName\` to avoid confusion with the source:

\`\`\`
"displayName": "[Copy] {original display name}"
\`\`\`

Or use a timestamp suffix: \`"{original name} - Copy 2024-01-15"\`

---

## Step 5: Create the duplicate

\`\`\`json
{
  "tool": "dv360_create_entity",
  "params": {
    "entityType": "${entityType}",
    "advertiserId": "${advertiserId}",
    "data": {
      "displayName": "[Copy] {original display name}",
      "entityStatus": "${entityType === "campaign" ? "ENTITY_STATUS_PAUSED" : "ENTITY_STATUS_DRAFT"}",
      "...": "all other fields from source, with server-assigned fields removed"
    }
  }
}
\`\`\`

Save the returned \`${entityIdField}\` for the new entity.

---

${
  includeChildren
    ? `## Step 6: Duplicate child entities

Since \`includeChildren\` is enabled, duplicate each child in order — insertion orders and line items via \`dv360_duplicate_entity\`, or get-then-create when the child must move to the **new** parent (the native line-item duplicate keeps the source's insertion order):

### Hierarchy order (always top-down)

\`\`\`
Campaign → InsertionOrder → LineItem → AssignedTargeting
\`\`\`

### 6a: List children of the source entity

\`\`\`json
{
  "tool": "dv360_list_entities",
  "params": {
    "entityType": "${entityType === "campaign" ? "insertionOrder" : "lineItem"}",
    "advertiserId": "${advertiserId}",
    "${entityIdField}": "${sourceEntityId}"
  }
}
\`\`\`

### 6b: For each child

1. Apply the same strip-then-create pattern (Steps 3–5)
2. Update parent ID references to point to the **new** parent (not the source)
3. Set child \`entityStatus\` to \`ENTITY_STATUS_DRAFT\` (the only status DV360 accepts when creating IOs and line items)

### 6c: Duplicate assigned targeting (optional)

If a line item was re-created with get-then-create (not \`dv360_duplicate_entity\`), its custom targeting must be fetched and recreated, one targeting type at a time:

\`\`\`json
{
  "tool": "dv360_list_assigned_targeting",
  "params": {
    "parentType": "lineItem",
    "advertiserId": "${advertiserId}",
    "lineItemId": "{source line item id}",
    "targetingType": "TARGETING_TYPE_GEO_REGION"
  }
}
\`\`\`

Then recreate each targeting assignment on the new line item using \`dv360_create_assigned_targeting\`.

⚠️ **GOTCHA: get-then-create does not copy targeting** — Targeting assignments are separate resources, so a line item created from a GET payload has none of the source's targeting. Recreate it explicitly, or use \`dv360_duplicate_entity\` (server-side copy) and verify the copy's targeting with \`dv360_list_assigned_targeting\`.

---

## Step 7: Verify the duplicated hierarchy

`
    : `## Step 6: Verify the duplicated entity

`
}Confirm the new entity was created correctly:

\`\`\`json
{
  "tool": "dv360_get_entity",
  "params": {
    "entityType": "${entityType}",
    "advertiserId": "${advertiserId}",
    "${entityIdField}": "{new entity id}"
  }
}
\`\`\`

Check:
- \`displayName\` reflects the copy naming convention
- \`entityStatus\` is non-running (DRAFT for IOs and line items, PAUSED for campaigns)
- All required fields are present and correct
- Parent ID references point to the correct parent entities

---

## SDF-based alternative for bulk duplication

For duplicating many entities at once, consider the SDF (Structured Data Files) approach:

1. Export source entities via the SDF download endpoint
2. Modify the CSV/JSON: clear ID columns, update display names, adjust parent references
3. Upload the modified SDF using \`dv360_create_entity\` with an SDF payload

This is faster for duplicating 10+ entities but requires understanding the SDF format. Fetch \`entity-schema://sdf\` for field reference.

---

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| \`INVALID_ARGUMENT: entityStatus\` | Campaign set to DRAFT, or IO / line item created as PAUSED or ACTIVE | Campaign: ENTITY_STATUS_PAUSED. IO / line item: ENTITY_STATUS_DRAFT |
| \`REQUIRED field missing\` | Server-assigned field accidentally stripped | Re-read schema via \`entity-schema://${entityType}\` |
| \`PERMISSION_DENIED\` | Source entity in a different advertiser | Verify \`advertiserId\` matches source entity |
| \`Duplicate displayName\` | Name collision with source | Add "[Copy]" prefix or unique suffix |
| \`INVALID parent reference\` | Child still references source parent ID | Update parent ID field to new parent's ID |

---

## Success Criteria

- [ ] Source entity fetched and inspected
- [ ] Server-assigned fields stripped from payload
- [ ] \`displayName\` updated with copy convention
- [ ] \`entityStatus\` set to a non-running value (campaigns PAUSED; IOs and line items DRAFT)
- [ ] New entity created via \`dv360_duplicate_entity\` (IO / line item) or \`dv360_create_entity\` (campaign)
- [ ] New entity verified with \`dv360_get_entity\`
${includeChildren ? "- [ ] All child entities duplicated with correct parent ID references\n- [ ] Assigned targeting recreated on duplicate line items" : ""}
`;
}
