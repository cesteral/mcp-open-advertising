// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * Snapchat Targeting Discovery Workflow Prompt
 *
 * Guides AI agents through audience research using snapchat_search_targeting
 * and snapchat_get_targeting_options before building ad group targeting configs.
 */
export const snapchatTargetingDiscoveryWorkflowPrompt: Prompt = {
  name: "snapchat_targeting_discovery_workflow",
  description:
    "Step-by-step guide for researching Snapchat audiences: search interest categories, browse behaviors, build targeting configs, and estimate audience size before ad group creation.",
  arguments: [
    {
      name: "adAccountId",
      description: "Snapchat Advertiser ID",
      required: true,
    },
    {
      name: "goal",
      description:
        "Research goal: 'search' (find by keyword), 'browse' (explore options), or 'build' (assemble targeting). Default: search",
      required: false,
    },
  ],
};

export function getSnapchatTargetingDiscoveryWorkflowMessage(
  args?: Record<string, string>
): string {
  const adAccountId = args?.adAccountId || "{adAccountId}";
  const goal = args?.goal || "search";

  return `# Snapchat Targeting Discovery Workflow

Advertiser: \`${adAccountId}\`
Goal: \`${goal}\`

---

## Overview

Before creating ad groups, you need to build a **targeting configuration** — the fields that define your Snapchat audience. This workflow helps you discover and validate targeting options.

| Tool | Purpose | Use When |
|------|---------|----------|
| \`snapchat_search_targeting\` | Search by keyword | You know the audience you want |
| \`snapchat_get_targeting_options\` | Browse available targeting | You want to explore what's available |
| \`snapchat_get_audience_estimate\` | Estimate audience size | Before committing to targeting |

---

## Step 1: Search Targeting Options

Search for interest categories by keyword:

\`\`\`json
{
  "tool": "snapchat_search_targeting",
  "params": {
    "adAccountId": "${adAccountId}",
    "targetingType": "INTEREST_KEYWORD",
    "query": "fitness"
  }
}
\`\`\`

Each result includes:
- \`id\` — The targeting ID to use in your ad group
- \`name\` — Human-readable label

### Key Targeting Types

| Targeting Type | What It Searches | Example |
|----------------|-----------------|---------|
| \`INTEREST_KEYWORD\` | Interest categories | "fitness", "gaming" |
| \`BEHAVIOR\` | Behavioral segments | App engagement behaviors |
| \`HASHTAG\` | Hashtag interest groups | "DIY", "travel" |

---

## Step 2: Browse Targeting Categories

To explore all available targeting options for your account:

\`\`\`json
{
  "tool": "snapchat_get_targeting_options",
  "params": {
    "adAccountId": "${adAccountId}"
  }
}
\`\`\`

Filter by type:

\`\`\`json
{
  "tool": "snapchat_get_targeting_options",
  "params": {
    "adAccountId": "${adAccountId}",
    "targetingType": "INTEREST"
  }
}
\`\`\`

---

## Step 3: Build Ad Group Targeting

Combine your research into the ad squad's \`targeting\` object:

\`\`\`json
{
  "geos": [{ "country_code": "us" }, { "country_code": "gb" }],
  "interests": [{ "category_id": ["SLC_1"], "operation": "INCLUDE" }]
}
\`\`\`

### Key Targeting Fields

| Field | Type | Description |
|-------|------|-------------|
| \`geos\` | Array | \`{ "country_code": "us" }\` entries (lowercase ISO codes) |
| \`interests\` | Array | \`{ "category_id": [...], "operation": "INCLUDE" }\` with IDs from \`snapchat_search_targeting\` |

Other targeting dimensions (demographics, devices, ...) are discovered with \`snapchat_get_targeting_options\`.

⚠️ **GOTCHA**: Use the exact IDs returned by \`snapchat_search_targeting\` / \`snapchat_get_targeting_options\` — do not invent category IDs.

---

## Step 4: Estimate Audience Size

Before creating the ad group, verify your targeting reaches a viable audience:

\`\`\`json
{
  "tool": "snapchat_get_audience_estimate",
  "params": {
    "adAccountId": "${adAccountId}",
    "targetingConfig": {
      "targeting": {
        "geos": [{ "country_code": "us" }],
        "interests": [{ "category_id": ["SLC_1"], "operation": "INCLUDE" }]
      }
    }
  }
}
\`\`\`

Interpret results:
- **Too narrow** (< 50K reach) → Broaden the geos or add more interests
- **Too broad** (> 100M reach) → Add more specific interests or narrow the audience
- **Sweet spot**: 1M–50M for most Snapchat campaigns

---

## Step 5: Apply to Ad Group

Use the targeting when creating or updating an ad group (ad squad):

\`\`\`json
{
  "tool": "snapchat_create_entity",
  "params": {
    "entityType": "adGroup",
    "adAccountId": "${adAccountId}",
    "campaignId": "{campaignId}",
    "data": {
      "name": "US Fitness Enthusiasts",
      "status": "PAUSED",
      "type": "SNAP_ADS",
      "placement_v2": { "config": "AUTOMATIC", "platforms": ["SNAPCHAT"] },
      "billing_event": "IMPRESSION",
      "bid_strategy": "LOWEST_COST_WITH_MAX_BID",
      "bid_micro": 1000000,
      "optimization_goal": "IMPRESSIONS",
      "daily_budget_micro": 50000000,
      "start_time": "2026-03-10T00:00:00Z",
      "targeting": {
        "geos": [{ "country_code": "us" }],
        "interests": [{ "category_id": ["SLC_1"], "operation": "INCLUDE" }]
      }
    }
  }
}
\`\`\`

⚠️ **GOTCHA**: Budget and bid values are in **micro-currency** — \`daily_budget_micro: 50000000\` means $50.00.

⚠️ **GOTCHA**: \`placement_v2\` is required on every ad squad; the legacy \`placement\` attribute is rejected.

---

## Related Resources
- \`reporting-reference://snapchat\` — Reporting metrics and dimensions
- \`entity-schema://snapchat/adGroup\` — Ad Group fields including all targeting parameters
- \`entity-examples://snapchat/adGroup\` — Example ad group payloads with targeting
`;
}
