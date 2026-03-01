import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * Meta Entity Duplication Workflow Prompt
 *
 * Guides AI agents through duplicating campaigns, ad sets, and ads
 * for A/B testing, scaling, and templating.
 */
export const entityDuplicationWorkflowPrompt: Prompt = {
  name: "meta_entity_duplication_workflow",
  description:
    "Step-by-step guide for duplicating Meta Ads campaigns, ad sets, and ads using meta_duplicate_entity — covers A/B testing, scaling, and common patterns.",
  arguments: [
    {
      name: "entityType",
      description: "Entity type to duplicate: campaign, adSet, or ad",
      required: true,
    },
    {
      name: "entityId",
      description: "ID of the entity to duplicate",
      required: true,
    },
  ],
};

export function getEntityDuplicationWorkflowMessage(
  args?: Record<string, string>,
): string {
  const entityType = args?.entityType || "{entityType}";
  const entityId = args?.entityId || "{entityId}";

  return `# Meta Entity Duplication Workflow

Entity Type: \`${entityType}\`
Entity ID: \`${entityId}\`

---

## Overview

\`meta_duplicate_entity\` creates a copy of a campaign, ad set, or ad via the Meta \`/{id}/copies\` endpoint. The copy includes all child entities and settings.

| What Gets Copied | Details |
|------------------|---------|
| **Campaign** | All ad sets, ads, targeting, budgets, creatives |
| **Ad Set** | All ads, targeting spec, budget, schedule |
| **Ad** | Creative reference, tracking, status |

---

## Step 1: Review the Source Entity

Before duplicating, inspect the entity you're copying:

\`\`\`json
{
  "tool": "meta_get_entity",
  "params": {
    "entityType": "${entityType}",
    "entityId": "${entityId}",
    "fields": ["name", "status", "effective_status"]
  }
}
\`\`\`

Confirm this is the right entity and note its current state.

---

## Step 2: Duplicate the Entity

### Basic Duplication (Paused)

\`\`\`json
{
  "tool": "meta_duplicate_entity",
  "params": {
    "entityType": "${entityType}",
    "entityId": "${entityId}",
    "statusOption": "PAUSED"
  }
}
\`\`\`

### With Rename Options

\`\`\`json
{
  "tool": "meta_duplicate_entity",
  "params": {
    "entityType": "${entityType}",
    "entityId": "${entityId}",
    "renameOptions": {
      "prefix": "Copy of "
    },
    "statusOption": "PAUSED"
  }
}
\`\`\`

### Status Options

| Option | Behavior |
|--------|----------|
| \`PAUSED\` | Copy is created paused (safest — review before activating) |
| \`ACTIVE\` | Copy starts delivering immediately |
| \`INHERITED\` | Copy inherits the source entity's status |

⚠️ **GOTCHA**: Always use \`PAUSED\` unless you intentionally want the copy to start spending immediately.

---

## Step 3: Customize the Copy

The duplication returns the new entity ID. Use it to modify the copy:

### Update Name

\`\`\`json
{
  "tool": "meta_update_entity",
  "params": {
    "entityId": "{newEntityId}",
    "data": {
      "name": "Campaign B - Broad Targeting Test"
    }
  }
}
\`\`\`

### Update Targeting (Ad Set)

\`\`\`json
{
  "tool": "meta_update_entity",
  "params": {
    "entityId": "{newAdSetId}",
    "data": {
      "targeting": {
        "geo_locations": { "countries": ["US"] },
        "interests": [{ "id": "6003384829981", "name": "Fitness and wellness" }],
        "age_min": 18,
        "age_max": 44
      }
    }
  }
}
\`\`\`

### Update Budget

\`\`\`json
{
  "tool": "meta_update_entity",
  "params": {
    "entityId": "{newEntityId}",
    "data": {
      "daily_budget": 3000
    }
  }
}
\`\`\`

⚠️ **GOTCHA**: Budget amounts are in **cents** — \`daily_budget: 3000\` means $30.00.

⚠️ **GOTCHA**: Targeting updates **replace entirely**. Always send the complete targeting spec.

---

## Step 4: Activate When Ready

After reviewing and customizing the copy:

\`\`\`json
{
  "tool": "meta_bulk_update_status",
  "params": {
    "entityIds": ["{newEntityId}"],
    "status": "ACTIVE"
  }
}
\`\`\`

---

## Common Patterns

### A/B Testing (Split Test)

1. Duplicate the campaign or ad set
2. Change one variable on the copy (targeting, creative, bid)
3. Activate both and compare performance

\`\`\`
Original: "Summer Campaign - Interest A" (targeting: running)
   Copy: "Summer Campaign - Interest B" (targeting: fitness)
\`\`\`

### Scaling to New Markets

1. Duplicate a proven campaign
2. Update geo targeting on the copy
3. Adjust budget for the new market
4. Activate

### Creative Testing

1. Duplicate an ad
2. Update the creative reference on the copy
3. Run both ads in the same ad set

### Template Campaigns

1. Create a "template" campaign with desired settings (PAUSED)
2. Duplicate it for each new client/product
3. Update names, budgets, targeting on each copy
4. Activate when ready

---

## Verification

After duplication, verify the copy:

\`\`\`json
{
  "tool": "meta_get_entity",
  "params": {
    "entityType": "${entityType}",
    "entityId": "{newEntityId}",
    "fields": ["name", "status", "effective_status"]
  }
}
\`\`\`

## Success Criteria

- [ ] Source entity reviewed before duplication
- [ ] Copy created with \`PAUSED\` status
- [ ] Copy renamed to distinguish from original
- [ ] Desired changes applied (targeting, budget, creative)
- [ ] Copy verified via \`meta_get_entity\`
- [ ] Activated only after review
`;
}
