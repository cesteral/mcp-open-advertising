// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Resource } from "../types.js";

let cachedContent: string | undefined;

function formatEntityHierarchyMarkdown(): string {
  return `# SA360 Entity Hierarchy

## Relationship Diagram

\`\`\`
Customer (Manager Account)
  ├── Campaign
  │     ├── Ad Group
  │     │     ├── Ad Group Ad (ad)
  │     │     └── Ad Group Criterion (keyword, audience)
  │     └── Campaign Criterion (location, language)
  ├── Bidding Strategy (portfolio, shared across campaigns)
  └── Conversion Action (conversion definitions)
\`\`\`

## Entity Types (8 total)

| Entity Type | Query Resource | ID Field | Status Field |
|-------------|---------------|----------|-------------|
| **customer** | \`customer\` | customer.id | — |
| **campaign** | \`campaign\` | campaign.id | campaign.status |
| **adGroup** | \`ad_group\` | ad_group.id | ad_group.status |
| **adGroupAd** | \`ad_group_ad\` | ad_group_ad.ad.id | ad_group_ad.status |
| **adGroupCriterion** | \`ad_group_criterion\` | ad_group_criterion.criterion_id | ad_group_criterion.status |
| **campaignCriterion** | \`campaign_criterion\` | campaign_criterion.criterion_id | — |
| **biddingStrategy** | \`bidding_strategy\` | bidding_strategy.id | bidding_strategy.status |
| **conversionAction** | \`conversion_action\` | conversion_action.id | conversion_action.status |

## Key Relationships

### Core Hierarchy: Customer → Campaign → Ad Group → Ad/Criterion
- Campaigns belong to a customer account
- Ad groups contain ads and criteria (keywords, audiences)
- Campaign criteria define campaign-level targeting

### Cross-Engine Reporting
- SA360 unifies data from Google Ads, Microsoft Ads, Yahoo Japan, and Baidu
- Entity data is **read-only** — modifications must be made in source engines

### Conversion Tracking
- Conversion actions define conversion types
- Offline conversions uploaded via legacy v2 API (sa360_insert_conversions)

## Available Tools Summary

| Tool | Purpose | API |
|------|---------|-----|
| \`sa360_list_accounts\` | Discover accounts | Reporting v0 |
| \`sa360_search\` | Flexible query language | Reporting v0 |
| \`sa360_get_entity\` | Get single entity | Reporting v0 |
| \`sa360_list_entities\` | List with filters | Reporting v0 |
| \`sa360_get_insights\` | Performance metrics | Reporting v0 |
| \`sa360_get_insights_breakdowns\` | Metrics with breakdowns | Reporting v0 |
| \`sa360_list_custom_columns\` | Custom column definitions | Reporting v0 |
| \`sa360_search_fields\` | Field discovery | Reporting v0 |
| \`sa360_insert_conversions\` | Upload offline conversions | Legacy v2 |
| \`sa360_update_conversions\` | Update conversions | Legacy v2 |
| \`sa360_validate_conversion\` | Validate conversion payload | Local |
`;
}

export const entityHierarchyResource: Resource = {
  uri: "entity-hierarchy://all",
  name: "SA360 Entity Hierarchy",
  description: "Entity relationships, account structure, and tool summary for SA360",
  mimeType: "text/markdown",
  getContent: () => {
    cachedContent ??= formatEntityHierarchyMarkdown();
    return cachedContent;
  },
};