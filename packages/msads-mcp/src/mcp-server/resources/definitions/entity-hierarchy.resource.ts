// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Resource } from "../types.js";

export const entityHierarchyResource: Resource = {
  uri: "msads://entity-hierarchy",
  name: "Microsoft Ads Entity Hierarchy",
  description: "Entity relationships and API operation patterns for Microsoft Advertising REST API v13",
  mimeType: "text/markdown",
  getContent: () => `# Microsoft Advertising Entity Hierarchy

## Entity Relationships

\`\`\`
Account
├── Campaign (Search, Shopping, Audience, Performance Max)
│   ├── AdGroup
│   │   ├── Ad (ExpandedText, Responsive, DynamicSearch, etc.)
│   │   └── Keyword (with match types: Broad, Phrase, Exact)
│   └── CampaignCriterion (Location, Device, Schedule, Age, Gender)
├── Budget (shared across campaigns)
├── AdExtension (Sitelink, Callout, Call, StructuredSnippet, etc.)
├── Audience (Remarketing, Custom, InMarket, Similar)
└── Label (organizational tagging)
\`\`\`

## API Pattern: Verb-Based REST Endpoints

Microsoft Ads REST API v13 uses POST for all operations with verb-based paths:

| Operation | Pattern | Example |
|-----------|---------|---------|
| Create | \`/{Entity}/Add\` | \`/Campaigns/Add\` |
| Read (by account) | \`/{Entity}/GetByAccountId\` | \`/Campaigns/GetByAccountId\` |
| Read (by parent) | \`/{Entity}/GetBy{Parent}Id\` | \`/AdGroups/GetByCampaignId\` |
| Read (by IDs) | \`/{Entity}/GetByIds\` | \`/Campaigns/GetByIds\` |
| Update | \`/{Entity}/Update\` | \`/Campaigns/Update\` |
| Delete | \`/{Entity}/Delete\` | \`/Campaigns/Delete\` |

## Auth Headers (all requests)

| Header | Description |
|--------|-------------|
| \`AuthenticationToken\` | OAuth2 access token |
| \`DeveloperToken\` | Per-app developer token |
| \`CustomerId\` | Manager account ID |
| \`CustomerAccountId\` | Ad account ID |

## Campaign Types

- **Search**: Text ads on Bing search results
- **Shopping**: Product ads from merchant center
- **Audience**: Display/native ads on Microsoft Audience Network
- **Performance Max**: AI-optimized across all Microsoft surfaces
- **Dynamic Search Ads**: Auto-generated from website content
`,
};