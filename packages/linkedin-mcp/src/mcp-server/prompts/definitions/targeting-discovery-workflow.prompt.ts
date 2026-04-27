// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * LinkedIn Targeting Discovery Workflow Prompt
 *
 * Guides AI agents through audience research using linkedin_search_targeting
 * and linkedin_get_targeting_options before building targetingCriteria.
 */
export const linkedInTargetingDiscoveryWorkflowPrompt: Prompt = {
  name: "linkedin_targeting_discovery_workflow",
  description:
    "Step-by-step guide for researching LinkedIn audiences: search facets, browse categories, build targeting criteria, and estimate delivery before campaign creation.",
  arguments: [
    {
      name: "adAccountUrn",
      description: "LinkedIn Ad Account URN",
      required: true,
    },
    {
      name: "goal",
      description:
        "Research goal: 'search' (find by keyword), 'browse' (explore categories), or 'build' (assemble targeting). Default: search",
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

Before creating campaigns, you need to build a **targetingCriteria** object — the JSON structure that defines your LinkedIn audience. This workflow helps you discover and validate targeting options.

| Tool | Purpose | Use When |
|------|---------|----------|
| \`linkedin_search_targeting\` | Search by keyword | You know the audience you want |
| \`linkedin_get_targeting_options\` | Browse available facets | You want to explore what's available |
| \`linkedin_get_delivery_forecast\` | Estimate audience size | Before committing to targeting |

---

## Step 1: Search Targeting Facets

Search for targeting options by keyword:

\`\`\`json
{
  "tool": "linkedin_search_targeting",
  "params": {
    "facetType": "MEMBER_SKILLS",
    "query": "machine learning",
    "limit": 10
  }
}
\`\`\`

Each result includes:
- \`urn\` — The targeting URN to use in targetingCriteria
- \`name\` — Human-readable label

### Key Facet Types

| Facet Type | What It Searches | Example Query |
|------------|-----------------|---------------|
| \`MEMBER_SKILLS\` | Professional skills | "python", "data science" |
| \`MEMBER_SENIORITY\` | Seniority levels | "Director", "VP" |
| \`MEMBER_JOB_FUNCTION\` | Job functions | "Engineering", "Marketing" |
| \`MEMBER_INDUSTRY\` | Industries | "Technology", "Finance" |
| \`MEMBER_COMPANY_SIZE\` | Company sizes | "201-500", "1001-5000" |
| \`GEOS\` | Geographic locations | "United States", "London" |
| \`MEMBER_INTERESTS\` | Interest groups | "AI", "Startups" |
| \`COMPANIES\` | Specific companies | "Microsoft", "Google" |

---

## Step 2: Browse Targeting Categories

To explore all available targeting facets for your account:

\`\`\`json
{
  "tool": "linkedin_get_targeting_options",
  "params": {
    "adAccountUrn": "${adAccountUrn}"
  }
}
\`\`\`

Filter by facet type:

\`\`\`json
{
  "tool": "linkedin_get_targeting_options",
  "params": {
    "adAccountUrn": "${adAccountUrn}",
    "facetType": "MEMBER_SENIORITY"
  }
}
\`\`\`

---

## Step 3: Build the Targeting Criteria

Combine your research into a \`targetingCriteria\` object:

### Skills + Seniority + Location Example

\`\`\`json
{
  "targetingCriteria": {
    "include": {
      "and": [
        {
          "or": {
            "urn:li:adTargetingFacet:geos": [
              "urn:li:geo:103644278"
            ]
          }
        },
        {
          "or": {
            "urn:li:adTargetingFacet:memberSeniorities": [
              "urn:li:adSeniority:5",
              "urn:li:adSeniority:6"
            ]
          }
        },
        {
          "or": {
            "urn:li:adTargetingFacet:skills": [
              "urn:li:skill:1234",
              "urn:li:skill:5678"
            ]
          }
        }
      ]
    },
    "exclude": {
      "or": {
        "urn:li:adTargetingFacet:memberSeniorities": [
          "urn:li:adSeniority:1"
        ]
      }
    }
  }
}
\`\`\`

### Structure Rules

- Top-level \`include.and\` → ALL conditions must match (AND logic between facets)
- Within each \`or\` block → ANY value matches (OR logic within a facet)
- \`exclude\` → Audience members matching these are excluded

---

## Step 4: Estimate Delivery

Before creating the campaign, verify your targeting reaches a viable audience:

\`\`\`json
{
  "tool": "linkedin_get_delivery_forecast",
  "params": {
    "adAccountUrn": "${adAccountUrn}",
    "targetingCriteria": {
      "include": {
        "and": [
          {
            "or": {
              "urn:li:adTargetingFacet:geos": ["urn:li:geo:103644278"]
            }
          }
        ]
      }
    }
  }
}
\`\`\`

Interpret results:
- **Too narrow** (< 1,000 reach) → Broaden facets or add more locations
- **Too broad** (> 1M reach) → Add more specific facets or seniority filters
- **Sweet spot**: 50K–500K for most B2B campaigns

---

## Step 5: Apply to Campaign

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
- \`targeting-reference://linkedin\` — Full targeting facets reference
- \`entity-schema://linkedin/campaign\` — Campaign fields including targetingCriteria
- \`entity-examples://linkedin/campaign\` — Example campaign payloads with targeting
`;
}
