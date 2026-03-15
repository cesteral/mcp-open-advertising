// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * LinkedIn Targeting Reference Resource
 * Available targeting facets, URN formats, and API patterns
 */
import type { Resource } from "../types.js";

let cachedContent: string | undefined;

function formatTargetingReferenceMarkdown(): string {
  return `# LinkedIn Ads Targeting Reference

## Overview

LinkedIn targeting uses a \`targetingCriteria\` object with AND/OR logic across facets. Each facet is identified by a URN and contains an array of targeting value URNs.

## Targeting Facet Types

| Facet URN | Facet Type | Description | Example Values |
|-----------|-----------|-------------|----------------|
| \`urn:li:adTargetingFacet:geos\` | GEOS | Geographic locations | \`urn:li:geo:103644278\` (US) |
| \`urn:li:adTargetingFacet:skills\` | MEMBER_SKILLS | Professional skills | \`urn:li:skill:1234\` |
| \`urn:li:adTargetingFacet:memberSeniorities\` | MEMBER_SENIORITY | Seniority levels | \`urn:li:adSeniority:5\` (Director) |
| \`urn:li:adTargetingFacet:jobFunctions\` | MEMBER_JOB_FUNCTION | Job functions | \`urn:li:adFunction:1\` (Engineering) |
| \`urn:li:adTargetingFacet:industries\` | MEMBER_INDUSTRY | Industries | \`urn:li:adIndustry:4\` (Technology) |
| \`urn:li:adTargetingFacet:companySizes\` | MEMBER_COMPANY_SIZE | Company size ranges | \`urn:li:adCompanySize:4\` (201-500) |
| \`urn:li:adTargetingFacet:titles\` | MEMBER_JOB_TITLE | Job titles | \`urn:li:adTitle:123\` |
| \`urn:li:adTargetingFacet:organizations\` | COMPANIES | Specific companies | \`urn:li:organization:1234\` |
| \`urn:li:adTargetingFacet:interests\` | MEMBER_INTERESTS | Interest groups | \`urn:li:adInterest:123\` |
| \`urn:li:adTargetingFacet:degrees\` | MEMBER_DEGREE | Education degrees | \`urn:li:adDegree:1\` (Bachelor's) |
| \`urn:li:adTargetingFacet:fieldsOfStudy\` | MEMBER_FIELD_OF_STUDY | Fields of study | \`urn:li:adFieldOfStudy:100\` |
| \`urn:li:adTargetingFacet:schools\` | MEMBER_SCHOOL | Schools attended | \`urn:li:adSchool:123\` |

## Seniority Levels

| URN | Level |
|-----|-------|
| \`urn:li:adSeniority:1\` | Unpaid |
| \`urn:li:adSeniority:2\` | Training |
| \`urn:li:adSeniority:3\` | Entry |
| \`urn:li:adSeniority:4\` | Senior |
| \`urn:li:adSeniority:5\` | Director |
| \`urn:li:adSeniority:6\` | VP |
| \`urn:li:adSeniority:7\` | CXO |
| \`urn:li:adSeniority:8\` | Partner |
| \`urn:li:adSeniority:9\` | Owner |

## Company Size Ranges

| URN | Size |
|-----|------|
| \`urn:li:adCompanySize:1\` | Myself only |
| \`urn:li:adCompanySize:2\` | 2-10 |
| \`urn:li:adCompanySize:3\` | 11-50 |
| \`urn:li:adCompanySize:4\` | 51-200 |
| \`urn:li:adCompanySize:5\` | 201-500 |
| \`urn:li:adCompanySize:6\` | 501-1000 |
| \`urn:li:adCompanySize:7\` | 1001-5000 |
| \`urn:li:adCompanySize:8\` | 5001-10000 |
| \`urn:li:adCompanySize:9\` | 10001+ |

## Targeting Criteria Structure

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

### Logic Rules

- \`include.and\` — ALL conditions must match (AND between facets)
- Within each \`or\` block — ANY value matches (OR within a facet)
- \`exclude.or\` — Members matching ANY of these are excluded

## Discovery Tools

| Tool | Purpose |
|------|---------|
| \`linkedin_search_targeting\` | Search facets by keyword (e.g., "machine learning" in MEMBER_SKILLS) |
| \`linkedin_get_targeting_options\` | Browse all available values for a facet type |
| \`linkedin_get_delivery_forecast\` | Estimate audience size for a targeting configuration |

## Key Constraints

- At least one \`include\` facet is required
- Location (\`geos\`) targeting is required for most campaign objectives
- Maximum ~100 values per facet
- URNs must be exact — use search/browse tools to discover valid values
- Targeting updates on campaigns **replace entirely** (not merged)
`;
}

export const targetingReferenceResource: Resource = {
  uri: "targeting-reference://linkedin",
  name: "LinkedIn Targeting Reference",
  description: "Targeting facet types, URN formats, seniority/company-size enums, criteria structure, and discovery tools for LinkedIn Ads",
  mimeType: "text/markdown",
  getContent: () => {
    cachedContent ??= formatTargetingReferenceMarkdown();
    return cachedContent;
  },
};