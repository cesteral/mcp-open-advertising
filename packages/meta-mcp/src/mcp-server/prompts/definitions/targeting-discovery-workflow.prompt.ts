// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * Meta Targeting Discovery Workflow Prompt
 *
 * Guides AI agents through audience research using meta_search_targeting
 * and meta_get_targeting_options before building targeting specs.
 */
export const targetingDiscoveryWorkflowPrompt: Prompt = {
  name: "meta_targeting_discovery_workflow",
  description:
    "Step-by-step guide for researching Meta Ads audiences: search interests, browse categories, build targeting specs, and estimate reach before ad set creation.",
  arguments: [
    {
      name: "adAccountId",
      description: "Meta Ad Account ID (with or without act_ prefix)",
      required: true,
    },
    {
      name: "goal",
      description:
        "Research goal: 'interests' (search by keyword), 'categories' (browse available options), or 'build' (assemble targeting spec). Default: interests",
      required: false,
    },
  ],
};

export function getTargetingDiscoveryWorkflowMessage(
  args?: Record<string, string>,
): string {
  const adAccountId = args?.adAccountId || "{adAccountId}";
  const goal = args?.goal || "interests";

  return `# Meta Targeting Discovery Workflow

Ad Account: \`${adAccountId}\`
Goal: \`${goal}\`

---

## Overview

Before creating ad sets, you need to build a **targeting spec** — the JSON object that defines your audience. This workflow helps you discover and validate targeting options using two tools:

| Tool | Purpose | Use When |
|------|---------|----------|
| \`meta_search_targeting\` | Search by keyword | You know what audience you want (e.g., "fitness", "New York") |
| \`meta_get_targeting_options\` | Browse categories | You want to explore what's available |

Then use \`meta_get_delivery_estimate\` to check audience size before committing.

---

## Step 1: Search for Interest Targeting

Search for interests by keyword to find targetable audiences:

\`\`\`json
{
  "tool": "meta_search_targeting",
  "params": {
    "type": "adinterest",
    "query": "running shoes",
    "limit": 10
  }
}
\`\`\`

Each result includes:
- \`id\` — The targeting ID to use in your targeting spec
- \`name\` — Human-readable name
- \`audience_size_lower_bound\` / \`audience_size_upper_bound\` — Estimated reach
- \`path\` — Category hierarchy (e.g., "Interests > Sports > Running")

### Search Types

| Type | What It Searches | Example Query |
|------|-----------------|---------------|
| \`adinterest\` | Interests by keyword | "organic food", "yoga" |
| \`adinterestsuggestion\` | Similar interests | Pass an existing interest name |
| \`adinterestvalid\` | Validate interest IDs | Pass interest IDs to check |
| \`adgeolocation\` | Geographic locations | "London", "California" |
| \`adlocale\` | Languages/locales | "English", "Spanish" |

### Search for Locations

\`\`\`json
{
  "tool": "meta_search_targeting",
  "params": {
    "type": "adgeolocation",
    "query": "United Kingdom",
    "limit": 5
  }
}
\`\`\`

Location results include \`key\`, \`name\`, \`type\` (country, region, city), and \`country_code\`.

---

## Step 2: Browse Targeting Categories

To explore what targeting dimensions are available for your account:

\`\`\`json
{
  "tool": "meta_get_targeting_options",
  "params": {
    "adAccountId": "${adAccountId}"
  }
}
\`\`\`

Filter by category:

\`\`\`json
{
  "tool": "meta_get_targeting_options",
  "params": {
    "adAccountId": "${adAccountId}",
    "type": "interests"
  }
}
\`\`\`

Available types: \`interests\`, \`behaviors\`, \`demographics\`, \`life_events\`, etc.

---

## Step 3: Build the Targeting Spec

Combine your research into a targeting spec for use with \`meta_create_entity\` (ad set):

### Interests + Location Example

\`\`\`json
{
  "targeting": {
    "geo_locations": {
      "countries": ["US", "GB"],
      "location_types": ["home"]
    },
    "interests": [
      { "id": "6003139266461", "name": "Running" },
      { "id": "6003384829981", "name": "Fitness and wellness" }
    ],
    "age_min": 25,
    "age_max": 54,
    "genders": [0]
  }
}
\`\`\`

### Key Targeting Fields

| Field | Type | Description |
|-------|------|-------------|
| \`geo_locations\` | Object | Countries, regions, cities, zips |
| \`interests\` | Array | Interest targeting (id + name) |
| \`behaviors\` | Array | Behavioral targeting |
| \`age_min\` / \`age_max\` | Number | Age range (13-65, 65 = 65+) |
| \`genders\` | Array | 0 = all, 1 = male, 2 = female |
| \`locales\` | Array | Language targeting |
| \`publisher_platforms\` | Array | facebook, instagram, audience_network, messenger |
| \`custom_audiences\` | Array | Custom/lookalike audience IDs |
| \`excluded_custom_audiences\` | Array | Audiences to exclude |

⚠️ **GOTCHA**: Targeting on an ad set **replaces entirely** — you cannot partially update it. Always send the complete targeting spec.

⚠️ **GOTCHA**: \`genders: [0]\` means "all genders", not "unknown". Omitting the field also targets all genders.

---

## Step 4: Estimate Audience Size

Before creating the ad set, verify your targeting spec reaches a viable audience:

\`\`\`json
{
  "tool": "meta_get_delivery_estimate",
  "params": {
    "adAccountId": "${adAccountId}",
    "targetingSpec": {
      "geo_locations": {
        "countries": ["US"]
      },
      "interests": [
        { "id": "6003139266461", "name": "Running" }
      ],
      "age_min": 25,
      "age_max": 54
    }
  }
}
\`\`\`

Check the estimated daily reach and compare to your budget:
- **Too narrow** (< 10,000 reach) → Broaden interests or locations
- **Too broad** (> 100M reach) → Add more specific interests or narrow demographics
- **Sweet spot** varies by objective, but 100K–10M is typical for most campaigns

---

## Step 5: Apply to Ad Set

Use the targeting spec when creating or updating an ad set:

### Creating a New Ad Set

\`\`\`json
{
  "tool": "meta_create_entity",
  "params": {
    "entityType": "adSet",
    "adAccountId": "${adAccountId}",
    "data": {
      "name": "Running Enthusiasts - US/UK - 25-54",
      "campaign_id": "{campaignId}",
      "billing_event": "IMPRESSIONS",
      "optimization_goal": "REACH",
      "daily_budget": 5000,
      "bid_amount": 500,
      "status": "PAUSED",
      "targeting": {
        "geo_locations": {
          "countries": ["US", "GB"]
        },
        "interests": [
          { "id": "6003139266461", "name": "Running" }
        ],
        "age_min": 25,
        "age_max": 54
      }
    }
  }
}
\`\`\`

### Updating Existing Ad Set Targeting

\`\`\`json
{
  "tool": "meta_update_entity",
  "params": {
    "entityId": "{adSetId}",
    "data": {
      "targeting": {
        "geo_locations": {
          "countries": ["US", "GB", "CA"]
        },
        "interests": [
          { "id": "6003139266461", "name": "Running" },
          { "id": "6003384829981", "name": "Fitness and wellness" }
        ],
        "age_min": 25,
        "age_max": 54
      }
    }
  }
}
\`\`\`

⚠️ **GOTCHA**: Budget amounts are in **cents** — \`daily_budget: 5000\` means $50.00, not $5,000.

---

## Common Patterns

### A/B Testing Audiences

1. Search for two distinct interest groups
2. Create two ad sets with different targeting specs
3. Use \`meta_duplicate_entity\` to clone the ad, then update targeting on the copy

### Lookalike Expansion

1. Start with custom audience targeting
2. Check performance via \`meta_get_insights\`
3. Search for related interests via \`meta_search_targeting\` with \`adinterestsuggestion\`
4. Add discovered interests to broaden reach

### Exclusion Targeting

Exclude existing customers or converters:
\`\`\`json
{
  "targeting": {
    "interests": [{ "id": "...", "name": "..." }],
    "excluded_custom_audiences": [{ "id": "{customAudienceId}" }]
  }
}
\`\`\`

---

## Related Resources
- \`targeting-reference://all\` — Full targeting spec structure reference
- \`entity-schema://adSet\` — Ad set fields including targeting
- \`entity-examples://adSet\` — Example ad set payloads with targeting
`;
}