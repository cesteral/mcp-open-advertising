// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * LinkedIn Targeting Discovery Workflow Prompt
 *
 * Guides AI agents through audience research — list the facets, get the values
 * inside them, count the audience, forecast delivery — before building
 * targetingCriteria. Facet and value names are from LinkedIn's Ad Targeting and
 * Targeting Criteria Facet URNs pages; every JSON call below is validated
 * against the tool's own schema by tests/mcp-server/linkedin-targeting-text.test.ts.
 */
export const linkedInTargetingDiscoveryWorkflowPrompt: Prompt = {
  name: "linkedin_targeting_discovery_workflow",
  description:
    "Step-by-step guide for researching LinkedIn audiences: list the facets, find the values inside them, build targeting criteria, count the audience, and forecast delivery before campaign creation.",
  arguments: [
    {
      name: "adAccountUrn",
      description: "LinkedIn Ad Account URN",
      required: true,
    },
    {
      name: "goal",
      description:
        "Research goal: 'search' (find values by keyword), 'browse' (explore the facets), or 'build' (assemble targeting). Default: search",
      required: false,
    },
  ],
};

export function getLinkedInTargetingDiscoveryWorkflowMessage(
  args?: Record<string, string>
): string {
  const adAccountUrn = args?.adAccountUrn || "{adAccountUrn}";
  const goal = args?.goal || "search";

  return `# LinkedIn Targeting Discovery Workflow

Ad Account: \`${adAccountUrn}\`
Goal: \`${goal}\`

---

## Overview

Before creating campaigns, you need to build a **targetingCriteria** object — the JSON structure that defines your LinkedIn audience. LinkedIn organises targeting into **facets** (categories such as industries or seniorities) and **entities** (the values inside a facet, each with a URN). This workflow finds the right facets and values, then checks the audience before you commit.

| Tool | Purpose | Use When |
|------|---------|----------|
| \`linkedin_get_targeting_options\` | List the facets | You want to see what can be targeted |
| \`linkedin_search_targeting\` | Get the values inside a facet | You need the URNs to put in targetingCriteria |
| \`linkedin_get_audience_count\` | Count matching members | Checking the audience is big enough (300 minimum) |
| \`linkedin_get_delivery_forecast\` | Forecast impressions, clicks and spend | Before committing to targeting and budget |

---

## Step 1: List the Facets

\`\`\`json
{
  "tool": "linkedin_get_targeting_options",
  "params": {}
}
\`\`\`

Each facet has a \`facetName\` (camelCase, e.g. \`industries\`), an \`adTargetingFacetUrn\` (the key used in targetingCriteria, e.g. \`urn:li:adTargetingFacet:industries\`), and \`availableEntityFinders\` — which of **browse** (AD_TARGETING_FACET), **search** (TYPEAHEAD) and **similar** (SIMILAR_ENTITIES) work for it. The list does not depend on the ad account.

---

## Step 2: Find the Values

\`linkedin_search_targeting\` picks the finder from your arguments.

**Search** a facet by keyword (the recommended way for large facets such as industries, titles and skills):

\`\`\`json
{
  "tool": "linkedin_search_targeting",
  "params": {
    "facet": "skills",
    "query": "machine learning",
    "limit": 10
  }
}
\`\`\`

**Browse** every value of a small facet:

\`\`\`json
{
  "tool": "linkedin_search_targeting",
  "params": {
    "facet": "seniorities"
  }
}
\`\`\`

**Find similar values** from seed URNs:

\`\`\`json
{
  "tool": "linkedin_search_targeting",
  "params": {
    "facet": "employers",
    "entities": ["urn:li:organization:1003"]
  }
}
\`\`\`

**Resolve URNs to names** (no facet):

\`\`\`json
{
  "tool": "linkedin_search_targeting",
  "params": {
    "urns": ["urn:li:geo:102095887", "urn:li:seniority:9"]
  }
}
\`\`\`

Each result has a \`urn\` (use it in targetingCriteria), a \`facetUrn\` and a \`name\`.

### Which finder works for which facet

| Facet | Finders |
|-------|---------|
| \`locations\`, \`profileLocations\`, \`schools\` | search only |
| \`employers\`, \`employersPast\`, \`employersAll\`, \`groups\` | search, similar |
| \`seniorities\`, \`jobFunctions\`, \`genders\`, \`ageRanges\`, \`staffCountRanges\`, \`interfaceLocales\`, \`yearsOfExperienceRanges\` | browse only |
| \`industries\`, \`titles\`, \`skills\` | browse, search, similar |
| \`degrees\`, \`fieldsOfStudy\`, \`interests\`, \`memberBehaviors\` | browse, search |

LinkedIn documents no paging for these calls, so browsing a large facet returns everything; the tool returns the first \`limit\` values and says when it cut the list. Prefer a \`query\`.

---

## Step 3: Build the Targeting Criteria

Combine your research into a \`targetingCriteria\` object:

### Location + Seniority + Skills Example

\`\`\`json
{
  "targetingCriteria": {
    "include": {
      "and": [
        {
          "or": {
            "urn:li:adTargetingFacet:locations": ["urn:li:geo:103644278"]
          }
        },
        {
          "or": {
            "urn:li:adTargetingFacet:seniorities": ["urn:li:seniority:3", "urn:li:seniority:4"]
          }
        },
        {
          "or": {
            "urn:li:adTargetingFacet:skills": ["urn:li:skill:17"]
          }
        }
      ]
    },
    "exclude": {
      "or": {
        "urn:li:adTargetingFacet:staffCountRanges": ["urn:li:staffCountRange:(1,1)"]
      }
    }
  }
}
\`\`\`

### Structure Rules

- Top-level \`include.and\` → ALL conditions must match (AND logic between facets)
- Within each \`or\` block → ANY value matches (OR logic within a facet)
- \`exclude\` → Audience members matching these are excluded
- \`ageRanges\`, \`genders\`, \`groups\` and \`interfaceLocales\` can only be used in \`include\`
- Use \`locations\` OR \`profileLocations\`, not both

---

## Step 4: Count the Audience

\`\`\`json
{
  "tool": "linkedin_get_audience_count",
  "params": {
    "targetingCriteria": {
      "include": {
        "and": [
          {
            "or": {
              "urn:li:adTargetingFacet:locations": ["urn:li:geo:103644278"]
            }
          },
          {
            "or": {
              "urn:li:adTargetingFacet:skills": ["urn:li:skill:17"]
            }
          }
        ]
      }
    }
  }
}
\`\`\`

Interpret the result:
- \`total\` is the matching member count (a rounded approximation); \`active\` is the subset more likely to visit LinkedIn
- \`total\` of **0** means fewer than 300 members — LinkedIn hides smaller counts, and 300 is the minimum audience to run a campaign. Broaden the facets.

---

## Step 5: Forecast Delivery

The forecast covers impressions, clicks, spend and reach for a **future** date range and a budget. It is an estimate, and it is not an audience size (use Step 4 for that).

\`\`\`json
{
  "tool": "linkedin_get_delivery_forecast",
  "params": {
    "adAccountUrn": "${adAccountUrn}",
    "campaignType": "SPONSORED_UPDATES",
    "startTime": "2030-01-01T00:00:00.000Z",
    "endTime": "2030-01-31T00:00:00.000Z",
    "dailyBudget": { "amount": "300", "currencyCode": "USD" },
    "competingBid": { "bidType": "CPM", "bidPrice": { "amount": "10", "currencyCode": "USD" } },
    "targetingCriteria": {
      "include": {
        "and": [
          {
            "or": {
              "urn:li:adTargetingFacet:locations": ["urn:li:geo:103644278"]
            }
          }
        ]
      }
    }
  }
}
\`\`\`

The response is \`elements[{ metricType, granularity, timeSeries }]\` — IMPRESSION, CLICK, SPENDING and more, at DAILY, SEVEN_DAY, THIRTY_DAY and CUSTOM granularity, each value with a low/high range. The currency must match the ad account's. A forecast with no location fails; so does a start date in the past.

---

## Step 6: Apply to Campaign

Use the targeting criteria when creating or updating a campaign:

\`\`\`json
{
  "tool": "linkedin_update_entity",
  "params": {
    "entityType": "campaign",
    "entityUrn": "urn:li:sponsoredCampaign:{campaignId}",
    "data": {
      "targetingCriteria": {
        "include": { ... }
      }
    }
  }
}
\`\`\`

⚠️ **GOTCHA**: Targeting updates **replace entirely**. Always send the complete targetingCriteria object.

⚠️ **GOTCHA**: All URNs must be exact — use the \`urn\` field from search results, not display names.

---

## Related Resources
- \`targeting-reference://linkedin\` — Facets, value URNs and which finder each supports
- \`entity-schema://linkedin/campaign\` — Campaign fields including targetingCriteria
- \`entity-examples://linkedin/campaign\` — Example campaign payloads with targeting
`;
}
