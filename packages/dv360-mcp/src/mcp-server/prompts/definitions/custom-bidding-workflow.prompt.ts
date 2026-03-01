import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * Custom Bidding Workflow Prompt
 *
 * Guides AI agents through creating, configuring, and managing custom bidding
 * algorithms in DV360 — covers all 4 custom bidding tools.
 */
export const customBiddingWorkflowPrompt: Prompt = {
  name: "custom_bidding_workflow",
  description:
    "Step-by-step guide for DV360 custom bidding: create algorithms, upload scripts, manage rules, check model readiness, and assign to line items.",
  arguments: [
    {
      name: "advertiserId",
      description: "DV360 Advertiser ID (or Partner ID for partner-owned algorithms)",
      required: true,
    },
    {
      name: "algorithmType",
      description:
        "Algorithm type: 'script' (SCRIPT_BASED, most common) or 'rules' (RULE_BASED, requires allowlisting). Default: script",
      required: false,
    },
  ],
};

export function getCustomBiddingWorkflowMessage(
  args?: Record<string, string>,
): string {
  const advertiserId = args?.advertiserId || "{advertiserId}";
  const algorithmType = args?.algorithmType || "script";
  const isRuleBased = algorithmType.toLowerCase() === "rules";

  return `# DV360 Custom Bidding Workflow

Advertiser/Owner: \`${advertiserId}\`
Algorithm Type: \`${isRuleBased ? "RULE_BASED" : "SCRIPT_BASED"}\`

---

## Overview

Custom bidding lets you define your own bid valuation logic instead of using DV360's built-in strategies. There are two types:

| Type | Description | Access |
|------|-------------|--------|
| **SCRIPT_BASED** | Custom JavaScript-like bidding logic | All customers |
| **RULE_BASED** | Declarative rules (if/then conditions) | Allowlisted customers only |

### Tools Used in This Workflow

| Tool | Purpose |
|------|---------|
| \`dv360_list_custom_bidding_algorithms\` | Discover existing algorithms |
| \`dv360_create_custom_bidding_algorithm\` | Create a new algorithm |
| \`dv360_manage_custom_bidding_script\` | Upload/list/get scripts (SCRIPT_BASED) |
| \`dv360_manage_custom_bidding_rules\` | Upload/list/get rules (RULE_BASED) |
| \`dv360_update_entity\` | Assign algorithm to a line item |

---

## Step 1: Check Existing Algorithms

Before creating a new algorithm, check what already exists:

\`\`\`json
{
  "tool": "dv360_list_custom_bidding_algorithms",
  "params": {
    "advertiserId": "${advertiserId}",
    "pageSize": 50
  }
}
\`\`\`

Review the results:
- \`customBiddingAlgorithmType\` — SCRIPT_BASED or RULE_BASED
- \`entityStatus\` — ACTIVE, PAUSED, or ARCHIVED
- \`modelDetails[].readinessState\` — whether the model is trained and ready

**Model Readiness States:**

| State | Meaning | Action |
|-------|---------|--------|
| \`ACTIVE\` | Trained and ready to score | Safe to assign to line items |
| \`INSUFFICIENT_DATA\` | Not enough impression data | Needs more traffic or time |
| \`TRAINING\` | Model is being trained | Wait and check back |
| \`NO_VALID_SCRIPT\` | No accepted script uploaded | Upload a script first |
| \`EVALUATION_FAILURE\` | Script evaluation failed | Debug and re-upload script |

If you find a suitable existing algorithm, skip to **Step 4** (assigning to a line item).

---

## Step 2: Create a New Algorithm

\`\`\`json
{
  "tool": "dv360_create_custom_bidding_algorithm",
  "params": {
    "displayName": "My Custom CPM Optimizer",
    "algorithmType": "${isRuleBased ? "RULE_BASED" : "SCRIPT_BASED"}",
    "ownerType": "advertiser",
    "ownerId": "${advertiserId}"
  }
}
\`\`\`

Save the returned \`customBiddingAlgorithmId\` — you'll need it for all subsequent steps.

### Ownership Options

| Owner Type | Use Case |
|------------|----------|
| \`advertiser\` | Algorithm scoped to a single advertiser |
| \`partner\` | Algorithm shared across multiple advertisers via \`sharedAdvertiserIds\` |

### Partner-Owned Example

\`\`\`json
{
  "tool": "dv360_create_custom_bidding_algorithm",
  "params": {
    "displayName": "Partner-Level Bid Strategy",
    "algorithmType": "SCRIPT_BASED",
    "ownerType": "partner",
    "ownerId": "{partnerId}",
    "sharedAdvertiserIds": ["${advertiserId}", "{otherAdvertiserId}"]
  }
}
\`\`\`

⚠️ **GOTCHA**: Algorithm type and ownership are **immutable** after creation. You cannot change a SCRIPT_BASED algorithm to RULE_BASED, or transfer ownership between advertiser and partner.

---

## Step 3: Upload Logic

${isRuleBased ? `### Upload Rules (RULE_BASED)

\`\`\`json
{
  "tool": "dv360_manage_custom_bidding_rules",
  "params": {
    "customBiddingAlgorithmId": "{algorithmId}",
    "action": "upload",
    "rulesContent": "{\\"rules\\": [{\\"condition\\": {\\"impressionCount\\": {\\"min\\": 1000}}, \\"bid\\": {\\"fixedBid\\": {\\"bidAmountMicros\\": \\"5000000\\"}}}]}"
  }
}
\`\`\`

⚠️ **GOTCHA**: RULE_BASED algorithms require your account to be allowlisted. If not allowlisted, the API will return an error.

### Check Rules Status

\`\`\`json
{
  "tool": "dv360_manage_custom_bidding_rules",
  "params": {
    "customBiddingAlgorithmId": "{algorithmId}",
    "action": "getActive"
  }
}
\`\`\`

**Rules States:**
- \`ACCEPTED\` — Rules are ready for scoring
- \`REJECTED\` — Rules have errors (check the \`error\` field)` : `### Upload Script (SCRIPT_BASED)

\`\`\`json
{
  "tool": "dv360_manage_custom_bidding_script",
  "params": {
    "customBiddingAlgorithmId": "{algorithmId}",
    "action": "upload",
    "scriptContent": "// Custom bidding script\\nfunction bid(request) {\\n  const baseBid = request.floorPrice;\\n  const multiplier = request.userList ? 1.5 : 1.0;\\n  return baseBid * multiplier;\\n}"
  }
}
\`\`\`

### Check Script Status

After uploading, the script goes through processing:

\`\`\`json
{
  "tool": "dv360_manage_custom_bidding_script",
  "params": {
    "customBiddingAlgorithmId": "{algorithmId}",
    "action": "getActive"
  }
}
\`\`\`

**Script States:**

| State | Meaning | Action |
|-------|---------|--------|
| \`PENDING\` | Script is being processed | Wait and check back |
| \`ACCEPTED\` | Script is ready for scoring | Proceed to assign to line items |
| \`REJECTED\` | Script has errors | Check \`errors\` array, fix, and re-upload |

### List All Script Versions

\`\`\`json
{
  "tool": "dv360_manage_custom_bidding_script",
  "params": {
    "customBiddingAlgorithmId": "{algorithmId}",
    "action": "list"
  }
}
\`\`\``}

⚠️ **GOTCHA**: Only one ${isRuleBased ? "rules set" : "script"} can be active at a time. New uploads automatically become active after being ACCEPTED.

⚠️ **GOTCHA**: ${isRuleBased ? "Rules" : "Scripts"} cannot be deleted — only replaced with new versions.

---

## Step 4: Assign Algorithm to a Line Item

Once the algorithm's model readiness is \`ACTIVE\`, assign it to a line item:

\`\`\`json
{
  "tool": "dv360_update_entity",
  "params": {
    "entityType": "lineItem",
    "advertiserId": "${advertiserId}",
    "lineItemId": "{lineItemId}",
    "data": {
      "bidStrategy": {
        "performanceGoalAutoBid": {
          "performanceGoalType": "BIDDING_STRATEGY_PERFORMANCE_GOAL_TYPE_CUSTOM_ALGO",
          "customBiddingAlgorithmId": "{algorithmId}",
          "maxAverageCpmBidAmountMicros": "10000000"
        }
      }
    },
    "updateMask": "bidStrategy"
  }
}
\`\`\`

⚠️ **GOTCHA**: Verify the algorithm's \`modelDetails\` shows \`readinessState: "ACTIVE"\` for this advertiser before assigning. An algorithm with \`INSUFFICIENT_DATA\` or \`NO_VALID_SCRIPT\` will not score impressions.

---

## Step 5: Verify & Monitor

1. **Verify assignment:**
\`\`\`json
{
  "tool": "dv360_get_entity",
  "params": {
    "entityType": "lineItem",
    "advertiserId": "${advertiserId}",
    "lineItemId": "{lineItemId}"
  }
}
\`\`\`
Confirm \`bidStrategy.performanceGoalAutoBid.customBiddingAlgorithmId\` matches.

2. **Monitor algorithm readiness:**
\`\`\`json
{
  "tool": "dv360_list_custom_bidding_algorithms",
  "params": {
    "advertiserId": "${advertiserId}",
    "filter": "customBiddingAlgorithmId=\\"{algorithmId}\\""
  }
}
\`\`\`
Check \`modelDetails[].readinessState\` remains \`ACTIVE\`.

---

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| Script REJECTED | Syntax errors in script | Check \`errors\` array, fix code, re-upload |
| INSUFFICIENT_DATA | Not enough impression data | Increase budget or wait for more traffic |
| RULE_BASED not allowed | Account not allowlisted | Use SCRIPT_BASED instead, or request allowlisting |
| Algorithm type mismatch | Tried to upload script to RULE_BASED algorithm | Match upload type to algorithm type |
| Model not ACTIVE | Assigned algorithm before training complete | Wait for readiness state to reach ACTIVE |

## Success Criteria

- [ ] Algorithm created with correct type and ownership
- [ ] ${isRuleBased ? "Rules" : "Script"} uploaded and in ACCEPTED state
- [ ] Model readiness shows ACTIVE for target advertiser
- [ ] Algorithm assigned to line item(s) via \`bidStrategy\`
- [ ] Line item verified with correct \`customBiddingAlgorithmId\`
`;
}
