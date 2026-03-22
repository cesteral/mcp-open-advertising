// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Meta Targeting Reference Resource
 */
import type { Resource } from "../types.js";

export const targetingReferenceResource: Resource = {
  uri: "targeting-reference://all",
  name: "Meta Targeting Reference",
  description: "Targeting specification structure, search types, and patterns for Meta Ads",
  mimeType: "text/markdown",
  getContent: () => `# Meta Targeting Reference

## Targeting Spec Structure

\`\`\`json
{
  "age_min": 18,
  "age_max": 65,
  "genders": [1, 2],
  "geo_locations": {
    "countries": ["US"],
    "regions": [{ "key": "4081" }],
    "cities": [{ "key": "2420379" }],
    "zips": [{ "key": "US:10001" }]
  },
  "interests": [
    { "id": "6003139266461", "name": "Fitness and wellness" }
  ],
  "flexible_spec": [
    { "interests": [{ "id": "6003371567474" }] },
    { "behaviors": [{ "id": "6002714895372" }] }
  ],
  "exclusions": {
    "interests": [{ "id": "6003384285372" }]
  },
  "custom_audiences": [{ "id": "AUDIENCE_ID" }],
  "excluded_custom_audiences": [{ "id": "AUDIENCE_ID" }],
  "targeting_automation": { "advantage_audience": 0 }
}
\`\`\`

## Targeting Search Types

Use \`meta_search_targeting\` with these types:

| Type | Description | Example Query |
|------|-------------|---------------|
| adinterest | Search interests | "running shoes" |
| adinterestsuggestion | Get suggestions | (uses interest_list) |
| adinterestvalid | Validate interests | (uses interest IDs) |
| adbehavior | Search behaviors | "purchase" |
| adTargetingCategory | Browse categories | "behaviors" |
| adgeolocation | Search locations | "New York" |
| adlocale | Search languages | "English" |

## Gender Values
- 1 = Male
- 2 = Female

## Targeting Automation (Advantage+)
- \`targeting_automation.advantage_audience\`: 0 = disabled, 1 = enabled
- API v21+ may require this field
- When enabled, requires \`age_max >= 65\`

## Key Targeting Patterns

### Interest OR Logic (flexible_spec)
Each array element in \`flexible_spec\` is OR'd together:
\`\`\`json
{
  "flexible_spec": [
    { "interests": [{ "id": "A" }, { "id": "B" }] },
    { "behaviors": [{ "id": "C" }] }
  ]
}
\`\`\`
Matches: (Interest A OR Interest B) AND (Behavior C)

### Exclusion Targeting
\`\`\`json
{
  "exclusions": {
    "interests": [{ "id": "6003384285372" }]
  }
}
\`\`\`

### Custom Audience + Exclusion
\`\`\`json
{
  "custom_audiences": [{ "id": "INCLUDE_ID" }],
  "excluded_custom_audiences": [{ "id": "EXCLUDE_ID" }]
}
\`\`\`

## Important Notes

- \`targeting\` field on ad set **replaces entirely** (no merge with existing)
- Always include \`geo_locations\` or \`custom_audiences\` (at least one required)
- Interest IDs must be valid Meta IDs (use \`meta_search_targeting\` to find them)
`,
};