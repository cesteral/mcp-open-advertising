// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * TikTok Targeting Reference Resource
 */
import type { Resource } from "../types.js";

let cachedContent: string | undefined;

function formatTargetingReferenceMarkdown(): string {
  return `# TikTok Ads Targeting Reference

## Targeting Structure

TikTok ad groups accept targeting via the \`targeting\` object in create/update payloads.
Use \`tiktok_search_targeting\` to find valid IDs and \`tiktok_get_targeting_options\` to browse available options.

## Objective Types

| Objective | Description |
|-----------|-------------|
| REACH | Maximize ad impressions |
| TRAFFIC | Drive website visits |
| VIDEO_VIEWS | Maximize video views |
| LEAD_GENERATION | Collect leads via forms |
| COMMUNITY_INTERACTION | Drive followers and profile visits |
| APP_PROMOTION | Drive app installs or re-engagement |
| WEBSITE_CONVERSIONS | Drive website conversion events |
| PRODUCT_SALES | Drive product sales (catalog) |

## Age Groups

| Value | Range |
|-------|-------|
| AGE_13_17 | 13-17 years |
| AGE_18_24 | 18-24 years |
| AGE_25_34 | 25-34 years |
| AGE_35_44 | 35-44 years |
| AGE_45_54 | 45-54 years |
| AGE_55_100 | 55+ years |

## Gender Values

| Value | Description |
|-------|-------------|
| GENDER_UNLIMITED | All genders (default) |
| GENDER_MALE | Male only |
| GENDER_FEMALE | Female only |

## Placement Types

| Placement | Description |
|-----------|-------------|
| PLACEMENT_TIKTOK | TikTok feed |
| PLACEMENT_PANGLE | Pangle (audience network) |
| PLACEMENT_GLOBAL_APP_BUNDLE | Global App Bundle |

## Targeting Types for Search

Use these values with \`tiktok_search_targeting\`:

| Type | Description | Supports Keyword Search |
|------|-------------|------------------------|
| INTEREST_CATEGORY | Interest categories | No (browse only) |
| INTEREST_KEYWORD | Interest keywords | Yes |
| ACTION_CATEGORY | Behavioral categories | No (browse only) |
| LOCATION | Geographic locations | Yes |
| LANGUAGE | Languages | Yes |
| DEVICE_MODEL | Device models | Yes |
| CARRIER | Mobile carriers | Yes |
| OS_VERSION | Operating system versions | No |
| ISP | Internet service providers | Yes |
| ZIPCODE | ZIP/postal codes | Yes |
| CONTEXTUAL_TAG | Contextual targeting tags | Yes |

## Targeting Spec Example

\`\`\`json
{
  "targeting": {
    "age_groups": ["AGE_18_24", "AGE_25_34"],
    "gender": "GENDER_UNLIMITED",
    "location_ids": ["6252001"],
    "languages": ["en"],
    "interest_category_ids": ["100001"],
    "interest_keyword_ids": ["200001"],
    "operating_systems": ["ANDROID", "IOS"],
    "placement_type": "PLACEMENT_TYPE_NORMAL",
    "placements": ["PLACEMENT_TIKTOK"]
  }
}
\`\`\`

## Optimize Goals

| Goal | Description |
|------|-------------|
| CLICK | Optimize for clicks |
| CONVERT | Optimize for conversions |
| INSTALL | Optimize for app installs |
| SHOW | Optimize for impressions |
| REACH | Optimize for unique reach |
| VIDEO_VIEW | Optimize for video views |
| LEAD_GENERATION | Optimize for lead form submissions |
| VALUE | Optimize for value (ROAS) |

## Bid Strategies

| Strategy | Description |
|----------|-------------|
| BID_TYPE_NO_BID | Lowest cost (automated) |
| BID_TYPE_CUSTOM | Cost cap (manual bid) |
| BID_TYPE_MAX | Maximum delivery |

## Budget Modes

| Mode | Description |
|------|-------------|
| BUDGET_MODE_DAY | Daily budget |
| BUDGET_MODE_TOTAL | Lifetime budget |
| BUDGET_MODE_DYNAMIC | Dynamic daily budget |

## Key Notes

- \`targeting\` on ad group **replaces entirely** -- always include all targeting fields
- Location IDs are TikTok-specific; use \`tiktok_search_targeting\` with type \`LOCATION\` to find them
- Interest category/keyword IDs must be valid TikTok IDs from the search/browse APIs
- Minimum audience size varies by market; use \`tiktok_get_audience_estimate\` to check
- Some targeting options are only available for specific objective types
`;
}

export const targetingReferenceResource: Resource = {
  uri: "targeting-reference://tiktok",
  name: "TikTok Targeting Reference",
  description: "Targeting types, age groups, genders, placements, objectives, bid strategies, and patterns for TikTok Ads",
  mimeType: "text/markdown",
  getContent: () => {
    cachedContent ??= formatTargetingReferenceMarkdown();
    return cachedContent;
  },
};
