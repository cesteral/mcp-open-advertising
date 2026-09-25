// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

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
    "Step-by-step guide for researching Pinterest audiences: search and browse targeting options, build an ad group targeting_spec, and estimate audience size before ad group creation.",
  arguments: [
    {
      name: "adAccountId",
      description: "Pinterest ad account ID",
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
  args?: Record<string, string>
): string {
  const adAccountId = args?.adAccountId || "{adAccountId}";
  const goal = args?.goal || "search";

  return `# Pinterest Targeting Discovery Workflow

Advertiser: \`${adAccountId}\`
Goal: \`${goal}\`

---

## Overview

An ad group's audience is its \`targeting_spec\`: an object whose keys are Pinterest targeting types (\`AGE_BUCKET\`, \`GENDER\`, \`LOCATION\`, \`INTEREST\`, …) and whose values are arrays of option ids. This workflow finds valid ids, assembles a \`targeting_spec\`, and sizes the audience before you create the ad group.

| Tool | Purpose | Use When |
|------|---------|----------|
| \`pinterest_search_targeting\` | Find options of one type by keyword | You know what you want ("fitness", "Germany") |
| \`pinterest_get_targeting_options\` | List every option of one type, or the list of types | You want to see what exists |
| \`pinterest_get_delivery_estimate\` | Audience size for a \`targeting_spec\` | Before committing to targeting |

Both targeting tools read \`GET /v5/resources/targeting/{targeting_type}\`. That endpoint has no search parameter, so the keyword match is done by this server over the full option list.

**Targeting types:** \`APPTYPE\`, \`GENDER\`, \`LOCALE\`, \`AGE_BUCKET\`, \`LOCATION\`, \`GEO\`, \`INTEREST\`, \`KEYWORD\`, \`AUDIENCE_INCLUDE\`, \`AUDIENCE_EXCLUDE\`

---

## Step 1: Search Targeting Options

Find interest ids by keyword:

\`\`\`json
{
  "tool": "pinterest_search_targeting",
  "params": {
    "adAccountId": "${adAccountId}",
    "targetingType": "INTEREST",
    "query": "fitness"
  }
}
\`\`\`

Use each result's \`id\` in the \`targeting_spec\`. The same call with \`"targetingType": "LOCATION"\` finds country and metro codes.

---

## Step 2: Browse Targeting Options

List the targeting types, then every option of one type:

\`\`\`json
{ "tool": "pinterest_get_targeting_options", "params": { "adAccountId": "${adAccountId}" } }
\`\`\`

\`\`\`json
{
  "tool": "pinterest_get_targeting_options",
  "params": { "adAccountId": "${adAccountId}", "targetingType": "AGE_BUCKET" }
}
\`\`\`

---

## Step 3: Build the targeting_spec

\`\`\`json
{
  "AGE_BUCKET": ["18-24", "25-34"],
  "GENDER": ["female"],
  "LOCATION": ["US"],
  "INTEREST": ["935541271955"],
  "APPTYPE": ["iphone", "android_mobile"]
}
\`\`\`

### targeting_spec keys (Pinterest OpenAPI \`TargetingSpec\`)

| Key | Values |
|-----|--------|
| \`AGE_BUCKET\` | \`"18-24"\`, \`"25-34"\`, \`"35-44"\`, \`"45-49"\`, \`"50-54"\`, \`"55-64"\`, \`"65+"\` (also \`"19+"\`, \`"20+"\`, \`"21+"\`). Legacy: Pinterest recommends \`MINIMUM_AGE\` / \`MAXIMUM_AGE\` instead, and the two forms cannot be combined |
| \`MINIMUM_AGE\` / \`MAXIMUM_AGE\` | Strings \`"18"\` … \`"65"\`; \`MAXIMUM_AGE\` also accepts \`"65+"\`. Use together |
| \`GENDER\` | \`"female"\`, \`"male"\`, \`"unknown"\` |
| \`LOCATION\` / \`LOCATION_EXCLUDE\` | ISO-3166 alpha-2 country codes (\`"US"\`) or metro codes (\`"501"\`) |
| \`GEO\` / \`GEO_EXCLUDE\` | Region codes or postal codes |
| \`LOCALE\` | ISO 639-1 language codes (\`"en"\`) |
| \`INTEREST\` | Interest ids from Step 1 |
| \`APPTYPE\` | \`"iphone"\`, \`"ipad"\`, \`"android_mobile"\`, \`"android_tablet"\`, \`"web"\`, \`"web_mobile"\` |
| \`AUDIENCE_INCLUDE\` / \`AUDIENCE_EXCLUDE\` | Customer list ids (at least 100 Pinterest users each) |

A missing key means "no restriction" for that dimension: no \`GENDER\` targets all genders.

⚠️ **GOTCHA**: Age buckets are range strings such as \`"18-24"\`. They are not enum names like \`AGE_18_24\`.

⚠️ **GOTCHA**: Keys are UPPERCASE targeting types. Lower-case \`age\`, \`gender\` or \`location_ids\` are not Pinterest fields.

---

## Step 4: Estimate Audience Size

\`\`\`json
{
  "tool": "pinterest_get_delivery_estimate",
  "params": {
    "adAccountId": "${adAccountId}",
    "targetingConfig": {
      "AGE_BUCKET": ["18-24", "25-34"],
      "GENDER": ["female"],
      "LOCATION": ["US"],
      "INTEREST": ["935541271955"]
    }
  }
}
\`\`\`

This calls \`POST /v5/ad_accounts/{ad_account_id}/ad_groups/audience_sizing\` and returns \`audience_size_lower_bound\` / \`audience_size_upper_bound\`: estimated people reachable per month, not a delivery guarantee. Widen or narrow the spec until the range fits the budget.

---

## Step 5: Apply to an Ad Group

Pass the spec as \`targeting_spec\` when creating the ad group:

\`\`\`json
{
  "tool": "pinterest_create_entity",
  "params": {
    "entityType": "adGroup",
    "adAccountId": "${adAccountId}",
    "data": {
      "campaign_id": "{campaignId}",
      "name": "US Fitness 18-34",
      "billable_event": "IMPRESSION",
      "budget_type": "DAILY",
      "budget_in_micro_currency": 50000000,
      "bid_in_micro_currency": 2000000,
      "status": "PAUSED",
      "targeting_spec": {
        "AGE_BUCKET": ["18-24", "25-34"],
        "GENDER": ["female"],
        "LOCATION": ["US"],
        "INTEREST": ["935541271955"]
      }
    }
  }
}
\`\`\`

⚠️ **GOTCHA**: Money fields are integers in **micro-currency**: \`50000000\` = 50.00 in the account currency.

⚠️ **GOTCHA**: \`name\`, \`campaign_id\` and \`billable_event\` (\`IMPRESSION\`, \`CLICKTHROUGH\` or \`VIDEO_V_50_MRC\`) are required. \`bid_in_micro_currency\` is required for AWARENESS/IMPRESSION, CONSIDERATION/CLICKTHROUGH and CATALOG_SALES/CLICKTHROUGH, and \`budget_in_micro_currency\` for campaigns without campaign budget optimization.

To change targeting later, \`pinterest_update_entity\` accepts either a whole new \`targeting_spec\` (it replaces the old one) or \`targeting_spec_operations\` for incremental changes.

---

## Related Resources
- \`entity-schema://pinterest/adGroup\`: ad group fields, including \`targeting_spec\`
- \`entity-examples://pinterest/adGroup\`: example ad group payloads
`;
}
