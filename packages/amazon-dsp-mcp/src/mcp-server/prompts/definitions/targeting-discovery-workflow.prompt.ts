// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * AmazonDsp Targeting Discovery Workflow Prompt
 *
 * Guides AI agents through audience research using amazon_dsp_search_targeting
 * and amazon_dsp_get_targeting_options before building ad group targeting configs.
 */
export const amazonDspTargetingDiscoveryWorkflowPrompt: Prompt = {
  name: "amazon_dsp_targeting_discovery_workflow",
  description:
    "Step-by-step guide for researching AmazonDsp audiences: search interest categories, browse behaviors, build targeting configs, and estimate audience size before ad group creation.",
  arguments: [
    {
      name: "profileId",
      description: "AmazonDsp Advertiser ID",
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

export function getAmazonDspTargetingDiscoveryWorkflowMessage(
  args?: Record<string, string>,
): string {
  const profileId = args?.profileId || "{profileId}";
  const goal = args?.goal || "search";

  return `# AmazonDsp Targeting Discovery Workflow

Advertiser: \`${profileId}\`
Goal: \`${goal}\`

---

## Overview

Before creating ad groups, you need to build a **targeting configuration** — the fields that define your AmazonDsp audience. This workflow helps you discover and validate targeting options.

| Tool | Purpose | Use When |
|------|---------|----------|
| \`amazon_dsp_search_targeting\` | Search by keyword | You know the audience you want |
| \`amazon_dsp_get_targeting_options\` | Browse available targeting | You want to explore what's available |
| \`amazon_dsp_get_audience_estimate\` | Estimate audience size | Before committing to targeting |

---

## Step 1: Search Targeting Options

Search for interest categories by keyword:

\`\`\`json
{
  "tool": "amazon_dsp_search_targeting",
  "params": {
    "profileId": "${profileId}",
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
  "tool": "amazon_dsp_get_targeting_options",
  "params": {
    "profileId": "${profileId}"
  }
}
\`\`\`

Filter by type:

\`\`\`json
{
  "tool": "amazon_dsp_get_targeting_options",
  "params": {
    "profileId": "${profileId}",
    "targetingType": "INTEREST"
  }
}
\`\`\`

---

## Step 3: Build Ad Group Targeting

Combine your research into an ad group payload:

\`\`\`json
{
  "age": ["AGE_18_24", "AGE_25_34", "AGE_35_44"],
  "gender": ["GENDER_UNLIMITED"],
  "location_ids": ["US", "GB"],
  "interest_keyword_ids": ["123456", "789012"],
  "operating_systems": ["IOS", "ANDROID"],
  "placement_type": "PLACEMENT_TYPE_NORMAL",
  "bid_type": "BID_TYPE_CUSTOM",
  "bid_price": 0.5,
  "optimize_goal": "CLICK"
}
\`\`\`

### Key Targeting Fields

| Field | Type | Description |
|-------|------|-------------|
| \`age\` | Array | Age groups: AGE_13_17 through AGE_55_PLUS |
| \`gender\` | Array | GENDER_MALE, GENDER_FEMALE, GENDER_UNLIMITED |
| \`location_ids\` | Array | Country codes or location IDs |
| \`interest_keyword_ids\` | Array | Interest keyword IDs from search |
| \`operating_systems\` | Array | IOS, ANDROID |
| \`placement_type\` | String | PLACEMENT_TYPE_NORMAL (auto), PLACEMENT_TYPE_SEARCH |
| \`bid_price\` | Number | Bid in account currency |

⚠️ **GOTCHA**: Age group values are enum strings — use exact values like \`AGE_18_24\`, not ranges like \`18-24\`.

⚠️ **GOTCHA**: Location IDs can be country codes (e.g., "US") or numeric IDs for cities/regions — use \`amazon_dsp_search_targeting\` to find valid values.

---

## Step 4: Estimate Audience Size

Before creating the ad group, verify your targeting reaches a viable audience:

\`\`\`json
{
  "tool": "amazon_dsp_get_audience_estimate",
  "params": {
    "profileId": "${profileId}",
    "targetingConfig": {
      "age": ["AGE_18_24", "AGE_25_34"],
      "gender": ["GENDER_UNLIMITED"],
      "location_ids": ["US"],
      "interest_keyword_ids": ["123456"]
    }
  }
}
\`\`\`

Interpret results:
- **Too narrow** (< 50K reach) → Broaden age groups or add more interests
- **Too broad** (> 100M reach) → Add more specific interests or narrow demographics
- **Sweet spot**: 1M–50M for most AmazonDsp campaigns

---

## Step 5: Apply to Ad Group

Use the targeting when creating or updating an ad group:

\`\`\`json
{
  "tool": "amazon_dsp_create_entity",
  "params": {
    "entityType": "adGroup",
    "profileId": "${profileId}",
    "data": {
      "campaign_id": "{campaignId}",
      "adgroup_name": "US Fitness Enthusiasts 18-34",
      "placement_type": "PLACEMENT_TYPE_NORMAL",
      "budget_mode": "BUDGET_MODE_DAY",
      "budget": 50,
      "schedule_type": "SCHEDULE_START_END",
      "schedule_start_time": "2026-03-10 00:00:00",
      "schedule_end_time": "2026-12-31 23:59:59",
      "optimize_goal": "CLICK",
      "bid_type": "BID_TYPE_CUSTOM",
      "bid_price": 0.5,
      "age": ["AGE_18_24", "AGE_25_34"],
      "gender": ["GENDER_UNLIMITED"],
      "location_ids": ["US"],
      "interest_keyword_ids": ["123456"]
    }
  }
}
\`\`\`

⚠️ **GOTCHA**: Budget values are in **account currency** — \`budget: 50\` means $50.00.

---

## Related Resources
- \`reporting-reference://amazonDsp\` — Reporting metrics and dimensions
- \`entity-schema://amazonDsp/adGroup\` — Ad Group fields including all targeting parameters
- \`entity-examples://amazonDsp/adGroup\` — Example ad group payloads with targeting
`;
}