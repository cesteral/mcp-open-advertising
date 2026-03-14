import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * Pinterest Targeting Discovery Workflow Prompt
 *
 * Guides AI agents through audience research using pinterest_search_targeting
 * and pinterest_get_targeting_options before building ad group targeting configs.
 */
export const pinterestTargetingDiscoveryWorkflowPrompt: Prompt = {
  name: "pinterest_targeting_discovery_workflow",
  description:
    "Step-by-step guide for researching Pinterest audiences: search interest categories, browse behaviors, build targeting configs, and estimate audience size before ad group creation.",
  arguments: [
    {
      name: "adAccountId",
      description: "Pinterest Advertiser ID",
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

export function getPinterestTargetingDiscoveryWorkflowMessage(
  args?: Record<string, string>,
): string {
  const adAccountId = args?.adAccountId || "{adAccountId}";
  const goal = args?.goal || "search";

  return `# Pinterest Targeting Discovery Workflow

Advertiser: \`${adAccountId}\`
Goal: \`${goal}\`

---

## Overview

Before creating ad groups, you need to build a **targeting configuration** — the fields that define your Pinterest audience. This workflow helps you discover and validate targeting options.

| Tool | Purpose | Use When |
|------|---------|----------|
| \`pinterest_search_targeting\` | Search by keyword | You know the audience you want |
| \`pinterest_get_targeting_options\` | Browse available targeting | You want to explore what's available |
| \`pinterest_get_audience_estimate\` | Estimate audience size | Before committing to targeting |

---

## Step 1: Search Targeting Options

Search for interest categories by keyword:

\`\`\`json
{
  "tool": "pinterest_search_targeting",
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
  "tool": "pinterest_get_targeting_options",
  "params": {
    "adAccountId": "${adAccountId}"
  }
}
\`\`\`

Filter by type:

\`\`\`json
{
  "tool": "pinterest_get_targeting_options",
  "params": {
    "adAccountId": "${adAccountId}",
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

⚠️ **GOTCHA**: Location IDs can be country codes (e.g., "US") or numeric IDs for cities/regions — use \`pinterest_search_targeting\` to find valid values.

---

## Step 4: Estimate Audience Size

Before creating the ad group, verify your targeting reaches a viable audience:

\`\`\`json
{
  "tool": "pinterest_get_audience_estimate",
  "params": {
    "adAccountId": "${adAccountId}",
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
- **Sweet spot**: 1M–50M for most Pinterest campaigns

---

## Step 5: Apply to Ad Group

Use the targeting when creating or updating an ad group:

\`\`\`json
{
  "tool": "pinterest_create_entity",
  "params": {
    "entityType": "adGroup",
    "adAccountId": "${adAccountId}",
    "data": {
      "campaign_id": "{campaignId}",
      "name": "US Fitness Enthusiasts 18-34",
      "placement_type": "PLACEMENT_TYPE_NORMAL",
      "daily_spend_cap": 50000000,
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
- \`reporting-reference://pinterest\` — Reporting metrics and dimensions
- \`entity-schema://pinterest/adGroup\` — Ad Group fields including all targeting parameters
- \`entity-examples://pinterest/adGroup\` — Example ad group payloads with targeting
`;
}
