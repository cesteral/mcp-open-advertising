import type { Resource } from "../types.js";

export const targetingReferenceResource: Resource = {
  uri: "targeting-reference://all",
  name: "CM360 Targeting Reference",
  description: "Targeting option types and patterns for CM360 ad serving",
  mimeType: "text/markdown",
  getContent: () => `# CM360 Targeting Reference

## Targeting Categories

| Category | Description |
|----------|-------------|
| Geographic | Countries, regions, cities, DMAs, postal codes |
| Content | Content categories, verticals |
| Technology | Browsers, operating systems, connection types, device types |
| Audience | First-party and third-party audience segments |
| Language | Language targeting |
| Day/Time | Day parting and time-based scheduling |

## Targeting Scope

CM360 targeting is applied at:
- **Placement level** — most common for site-level targeting
- **Ad level** — for more granular creative-level targeting

## Discovery

Use \`cm360_list_targeting_options\` to browse available targeting options:
\`\`\`json
{
  "tool": "cm360_list_targeting_options",
  "params": {
    "profileId": "PROFILE_ID",
    "targetingType": "all"
  }
}
\`\`\`

## Notes

- CM360 is primarily an ad server, not a self-serve buying platform
- Targeting options are simpler than DSP platforms (DV360, TTD, Meta)
- Most advanced targeting is configured in the buying platforms
- CM360 targeting focuses on ad serving rules and content safety
`,
};
