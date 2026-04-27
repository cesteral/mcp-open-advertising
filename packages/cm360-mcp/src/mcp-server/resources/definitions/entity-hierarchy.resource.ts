// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Resource } from "../types.js";

let cachedContent: string | undefined;

function formatEntityHierarchyMarkdown(): string {
  return `# CM360 Entity Hierarchy

## Relationship Diagram

\`\`\`
Account (Network)
  └── Advertiser
        ├── Campaign
        │     └── Placement (requires Site)
        │           └── Ad (references Creative)
        ├── Creative (reusable across ads)
        ├── Site (hosting placements)
        ├── Floodlight Configuration (one per advertiser)
        │     └── Floodlight Activity (conversion events)
        └── Floodlight Activity (conversion events)
\`\`\`

## Entity Types (8 total)

| Entity Type | API Collection | ID Field | Supports Delete |
|-------------|---------------|----------|:---:|
| **campaign** | \`campaigns\` | id | |
| **placement** | \`placements\` | id | |
| **ad** | \`ads\` | id | |
| **creative** | \`creatives\` | id | ✓ |
| **site** | \`sites\` | id | |
| **advertiser** | \`advertisers\` | id | |
| **floodlightActivity** | \`floodlightActivities\` | id | ✓ |
| **floodlightConfiguration** | \`floodlightConfigurations\` | id | |

## Key Relationships

### Core Hierarchy: Account → Advertiser → Campaign → Placement → Ad
- Placements require both a **campaign** and a **site**
- Ads require **placement assignments** and **creative assignments**
- Creatives are shared across ads within an advertiser

### Conversion Tracking: Floodlight
- One **Floodlight Configuration** per advertiser (account-level)
- Multiple **Floodlight Activities** per configuration (individual events)

## Creation Order

Full campaign structure (top-down):

1. **Account** — pre-exists, use \`cm360_list_user_profiles\` to discover
2. **Advertiser** — usually pre-exists, verify with \`cm360_get_entity\`
3. **Site** — create or reuse for placement hosting
4. **Campaign** — requires advertiser, start/end dates
5. **Placement** — requires campaign + site, size, compatibility
6. **Creative** — requires advertiser, type, size (must match placement)
7. **Ad** — links creative to placement via assignments

## CM360 API Patterns (v5)

### Create: POST /dfareporting/v5/userprofiles/{profileId}/{collection}
All entities require a profileId.

### Read: GET /dfareporting/v5/userprofiles/{profileId}/{collection}/{id}

### Update: PUT /dfareporting/v5/userprofiles/{profileId}/{collection}
**Warning: PUT semantics**: Full entity object required. Missing fields reset to defaults.

### Delete: DELETE (creative, floodlightActivity only)
Most entities cannot be deleted — archive or deactivate instead.

### List: GET /dfareporting/v5/userprofiles/{profileId}/{collection}
Uses pageToken-based pagination.

## Available Tools Summary

| Tool | Purpose | Batch? |
|------|---------|--------|
| \`cm360_list_user_profiles\` | Discover profile IDs | |
| \`cm360_list_entities\` | List entities with filters | |
| \`cm360_get_entity\` | Get single entity | |
| \`cm360_create_entity\` | Create single entity | |
| \`cm360_update_entity\` | Update entity (PUT) | |
| \`cm360_delete_entity\` | Delete entity (creative/floodlight only) | |
| \`cm360_validate_entity\` | Client-side validation | |
| \`cm360_get_report\` | Submit + wait for report | |
| \`cm360_submit_report\` | Submit report (async) | |
| \`cm360_check_report_status\` | Check report status | |
| \`cm360_download_report\` | Download report CSV | |
| \`cm360_bulk_update_status\` | Batch status update | ✓ |
| \`cm360_bulk_create_entities\` | Batch entity creation | ✓ |
| \`cm360_bulk_update_entities\` | Batch entity updates | ✓ |
| \`cm360_get_ad_preview\` | Ad preview URL | |
| \`cm360_list_targeting_options\` | Browse targeting options | |
`;
}

export const entityHierarchyResource: Resource = {
  uri: "entity-hierarchy://all",
  name: "CM360 Entity Hierarchy",
  description:
    "Parent-child relationships between CM360 entities, API patterns, and creation ordering",
  mimeType: "text/markdown",
  getContent: () => {
    cachedContent ??= formatEntityHierarchyMarkdown();
    return cachedContent;
  },
};
