// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * TikTok Targeting Discovery Workflow Prompt
 *
 * Guides AI agents through audience research using tiktok_search_targeting
 * and tiktok_get_targeting_options before building ad group targeting configs.
 */
export const tiktokTargetingDiscoveryWorkflowPrompt: Prompt = {
  name: "tiktok_targeting_discovery_workflow",
  description:
    "Step-by-step guide for researching TikTok audiences: search geo and ISP targeting tags, browse official targeting metadata, build targeting configs, and estimate audience size before ad group creation.",
  arguments: [
    {
      name: "advertiserId",
      description: "TikTok Advertiser ID",
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

export function getTiktokTargetingDiscoveryWorkflowMessage(
  args?: Record<string, string>,
): string {
  const advertiserId = args?.advertiserId || "{advertiserId}";
  const goal = args?.goal || "search";

  return `# TikTok Targeting Discovery Workflow

Advertiser: \`${advertiserId}\`
Goal: \`${goal}\`

---

## Overview

Before creating ad groups, you need to build a **targeting configuration** — the fields that define your TikTok audience. This workflow helps you discover and validate targeting options.

| Tool | Purpose | Use When |
|------|---------|----------|
| \`tiktok_search_targeting\` | Search by keyword | You know the audience you want |
| \`tiktok_get_targeting_options\` | Browse available targeting | You want to explore what's available |
| \`tiktok_get_audience_estimate\` | Estimate audience size | Before committing to targeting |

---

## Step 1: Search Targeting Options

Search for geo targeting tags by keyword:

\`\`\`json
{
  "tool": "tiktok_search_targeting",
  "params": {
    "advertiserId": "${advertiserId}",
    "query": "stockholm",
    "scene": "GEO",
    "placements": ["PLACEMENT_TIKTOK"],
    "objectiveType": "TRAFFIC"
  }
}
\`\`\`

Each result includes:
- \`id\` — The targeting ID to use in your ad group
- \`name\` — Human-readable label

### Key Targeting Types

| Targeting Type | What It Searches | Example |
|----------------|-----------------|---------|
| \`GEO\` | Geo tags such as regions, postal codes, cities | "stockholm", "new york" |
| \`ISP\` | Internet service provider targeting tags | "telia", "verizon" |

---

## Step 2: Browse Targeting Categories

To explore all available targeting options for your account:

\`\`\`json
{
  "tool": "tiktok_get_targeting_options",
  "params": {
    "advertiserId": "${advertiserId}",
    "optionType": "LANGUAGE"
  }
}
\`\`\`

Filter by type:

\`\`\`json
{
  "tool": "tiktok_get_targeting_options",
  "params": {
    "advertiserId": "${advertiserId}",
    "optionType": "LOCATION",
    "placements": ["PLACEMENT_TIKTOK"],
    "objectiveType": "TRAFFIC"
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
  "placements": ["PLACEMENT_TIKTOK"],
  "bid_price": 0.5,
  "optimization_goal": "CLICK"
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
| \`placements\` | Array | Placement enums such as PLACEMENT_TIKTOK |
| \`bid_price\` | Number | Bid in account currency |

⚠️ **GOTCHA**: Age group values are enum strings — use exact values like \`AGE_18_24\`, not ranges like \`18-24\`.

⚠️ **GOTCHA**: Location IDs can be country codes (e.g., "US") or numeric IDs for cities/regions — use \`tiktok_search_targeting\` to find valid values.

---

## Step 4: Estimate Audience Size

Before creating the ad group, verify your targeting reaches a viable audience:

\`\`\`json
{
  "tool": "tiktok_get_audience_estimate",
  "params": {
    "advertiserId": "${advertiserId}",
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
- **Sweet spot**: 1M–50M for most TikTok campaigns

---

## Step 5: Apply to Ad Group

Use the targeting when creating or updating an ad group:

\`\`\`json
{
  "tool": "tiktok_create_entity",
  "params": {
    "entityType": "adGroup",
    "advertiserId": "${advertiserId}",
    "data": {
      "campaign_id": "{campaignId}",
      "adgroup_name": "US Fitness Enthusiasts 18-34",
      "placements": ["PLACEMENT_TIKTOK"],
      "budget_mode": "BUDGET_MODE_DAY",
      "budget": 50,
      "schedule_type": "SCHEDULE_START_END",
      "schedule_start_time": "2026-03-10 00:00:00",
      "schedule_end_time": "2026-12-31 23:59:59",
      "optimization_goal": "CLICK",
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
- \`reporting-reference://tiktok\` — Reporting metrics and dimensions
- \`entity-schema://tiktok/adGroup\` — Ad Group fields including all targeting parameters
- \`entity-examples://tiktok/adGroup\` — Example ad group payloads with targeting
`;
}
