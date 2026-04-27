// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Resource } from "../types.js";

export const entityHierarchyResource: Resource = {
  uri: "msads://entity-hierarchy",
  name: "Microsoft Ads Entity Hierarchy",
  description:
    "Entity relationships and API operation patterns for Microsoft Advertising API v13 JSON endpoints",
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

## API Pattern: JSON Collection And Query Endpoints

Microsoft Ads JSON API v13 uses POST for all operations:

| Operation | Pattern | Example |
|-----------|---------|---------|
| Create | \`/{Entity}\` | \`/Campaigns\` |
| Read (by account) | \`/{Entity}/QueryByAccountId\` | \`/Campaigns/QueryByAccountId\` |
| Read (by parent) | \`/{Entity}/QueryBy{Parent}Id\` | \`/AdGroups/QueryByCampaignId\` |
| Read (by IDs) | \`/{Entity}/QueryByIds\` | \`/Campaigns/QueryByIds\` |
| Update | \`/{Entity}\` | \`/Campaigns\` |
| Delete | \`/{Entity}\` | \`/Campaigns\` |

## Auth Headers (all requests)

| Header | Description |
|--------|-------------|
| \`Authorization\` | OAuth2 access token prefixed with \`Bearer \` |
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
