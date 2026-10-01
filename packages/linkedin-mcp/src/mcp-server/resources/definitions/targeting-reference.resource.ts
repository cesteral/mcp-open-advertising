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

Source: LinkedIn's Ad Targeting, Targeting Criteria Facet URNs, Ad Supply Forecasts and Audience Counts pages (read 2026-10-01). Nothing here has been run against a live LinkedIn account.

## Overview

LinkedIn targeting uses a \`targetingCriteria\` object with AND/OR logic across **facets**. A facet is a category (industries, seniorities, locations); its **entities** are the values inside it (Computer Software, Entry, a country). Each facet is identified by a URN, \`urn:li:adTargetingFacet:<facetName>\`, and holds an array of value URNs.

## Targeting Facets

Facet names are camelCase. Value URNs use the namespaces below. The authoritative list comes from \`linkedin_get_targeting_options\`.

| Facet | Value URN | Example | Finders |
|-------|-----------|---------|---------|
| \`locations\` | geo | \`urn:li:geo:103644278\` | typeahead only |
| \`profileLocations\` | geo | same values as \`locations\` | typeahead only |
| \`seniorities\` | seniority | \`urn:li:seniority:3\` | browse |
| \`jobFunctions\` | function | \`urn:li:function:22\` | browse |
| \`industries\` | industry | \`urn:li:industry:9\` | browse, search, similar |
| \`staffCountRanges\` | staffCountRange | \`urn:li:staffCountRange:(51,200)\` | browse |
| \`titles\`, \`titlesPast\`, \`titlesAll\` | title | \`urn:li:title:4\` | browse, search, similar |
| \`skills\` | skill | \`urn:li:skill:17\` | browse, search, similar |
| \`employers\`, \`employersPast\`, \`employersAll\` | organization | \`urn:li:organization:1035\` | search, similar |
| \`schools\` | organization | \`urn:li:organization:1035\` | search only |
| \`degrees\` | degree | \`urn:li:degree:700\` | browse, search |
| \`fieldsOfStudy\` | fieldOfStudy | \`urn:li:fieldOfStudy:100275\` | browse, search |
| \`interests\` | interest | \`urn:li:interest:689290\` | browse, search |
| \`memberBehaviors\` | memberBehavior | \`urn:li:memberBehavior:2\` | browse, search |
| \`genders\` | gender | \`urn:li:gender:FEMALE\` | browse |
| \`ageRanges\` | ageRange | \`urn:li:ageRange:(25,34)\` | browse |
| \`yearsOfExperienceRanges\` | yearsOfExperience | \`urn:li:yearsOfExperience:3\` | browse |
| \`interfaceLocales\` | locale | \`urn:li:locale:en_US\` | browse |
| \`groups\` | group | \`urn:li:group:1234\` | search, similar |
| \`followedCompanies\`, \`firstDegreeConnectionCompanies\` | organization | \`urn:li:organization:1035\` | search, similar |
| \`companyCategory\` | organizationRankingList | \`urn:li:organizationRankingList:1\` | browse, search |
| \`growthRate\` | growthRate | \`urn:li:growthRate:(3,10)\` | browse, search |
| \`revenue\` | (not documented) | | browse, search |
| \`buyerGroups\` | standardizedProductCategory | \`urn:li:standardizedProductCategory:1031\` | browse, search (API version 202603+) |
| \`audienceMatchingSegments\`, \`dynamicSegments\` | adSegment | \`urn:li:adSegment:10001\` | no entity discovery |

Finders: *browse* = list every value (\`facet\` alone), *search* = typeahead (\`facet\` + \`query\`), *similar* = values like given ones (\`facet\` + \`entities\`). \`locations\` and \`profileLocations\` are typeahead only — search them with a \`query\`; you cannot browse them. Use \`locations\` OR \`profileLocations\` in a criteria, not both.

## Seniority Levels

Browse them with \`linkedin_search_targeting({ facet: "seniorities" })\`. LinkedIn's pages document these ids; others exist and are returned by that call.

| URN | Level |
|-----|-------|
| \`urn:li:seniority:1\` | Unpaid |
| \`urn:li:seniority:2\` | Training |
| \`urn:li:seniority:3\` | Entry |
| \`urn:li:seniority:4\` | Senior |
| \`urn:li:seniority:9\` | Partner |
| \`urn:li:seniority:10\` | Owner |

## Company Size Ranges

\`staffCountRanges\` values are ranges, not ids. \`2147483647\` means no upper limit.

\`urn:li:staffCountRange:(1,1)\`, \`(2,10)\`, \`(11,50)\`, \`(51,200)\`, \`(201,500)\`, \`(501,1000)\`, \`(1001,5000)\`, \`(5001,10000)\`, \`(10001,2147483647)\`

## Targeting Criteria Structure

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

### Logic Rules

- \`include.and\` — ALL conditions must match (AND between facets)
- Within each \`or\` block — ANY value matches (OR within a facet)
- \`exclude.or\` — Members matching ANY of these are excluded
- \`ageRanges\`, \`genders\`, \`groups\` and \`interfaceLocales\` can only be used in \`include\`
- \`staffCountRanges\` can be included or excluded, not both

## Discovery Tools

| Tool | Purpose |
|------|---------|
| \`linkedin_get_targeting_options\` | List the facets (names, URNs, which finders each supports) |
| \`linkedin_search_targeting\` | Get the values inside a facet: browse, search, find similar, or resolve URNs to names |
| \`linkedin_get_audience_count\` | Count the members a targeting criteria matches (\`total\` is 0 below 300) |
| \`linkedin_get_delivery_forecast\` | Forecast impressions, clicks and spend for a campaign setup (not an audience size) |

## Key Constraints

- \`include.and\` is the documented way to include facets; a forecast needs at least one location (LinkedIn error MISSING_LOCATION_ATTRIBUTE_FOR_FORECAST)
- The minimum audience to run a campaign is 300 members
- URNs must be exact — discover them with the tools above rather than guessing
- Facet names and value URNs from older material (a \`geos\` facet, seniority URNs in an \`ad…\` namespace) are not LinkedIn's and are rejected by the tools
- Targeting updates on campaigns **replace entirely** (not merged)
`;
}

export const targetingReferenceResource: Resource = {
  uri: "targeting-reference://linkedin",
  name: "LinkedIn Targeting Reference",
  description:
    "Targeting facets, value URN formats, which discovery finder each facet supports, criteria structure, and the targeting tools for LinkedIn Ads",
  mimeType: "text/markdown",
  getContent: () => {
    cachedContent ??= formatTargetingReferenceMarkdown();
    return cachedContent;
  },
};
