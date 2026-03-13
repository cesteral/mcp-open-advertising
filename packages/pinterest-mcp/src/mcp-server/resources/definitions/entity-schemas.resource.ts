/**
 * Pinterest Entity Schema Resources
 */
import type { Resource } from "../types.js";
import { getSupportedEntityTypes, type PinterestEntityType } from "../../tools/utils/entity-mapping.js";

const ENTITY_SCHEMA_CONTENT: Record<PinterestEntityType, string> = {
  campaign: `# Pinterest Campaign Schema (v5)

\`\`\`json
{
  "type": "object",
  "required": ["name", "objective_type"],
  "properties": {
    "name": { "type": "string", "description": "Campaign name" },
    "objective_type": {
      "type": "string",
      "enum": ["AWARENESS", "CONSIDERATION", "VIDEO_VIEW", "CATALOG_SALES", "CONVERSIONS", "APP_INSTALL", "SHOPPING"],
      "description": "Campaign objective"
    },
    "status": { "type": "string", "enum": ["ACTIVE", "PAUSED", "ARCHIVED"], "default": "ACTIVE" },
    "daily_spend_cap": { "type": "integer", "description": "Daily budget cap in micro-currency (1 USD = 1000000)" },
    "lifetime_spend_cap": { "type": "integer", "description": "Total lifetime budget in micro-currency" }
  }
}
\`\`\`

## Notes
- Budgets use **micro-currency**: $50/day → \`daily_spend_cap: 50000000\`
- Status values: ACTIVE, PAUSED, ARCHIVED (not ENABLE/DISABLE)
- Read-only fields: \`id\`, \`created_time\`, \`updated_time\`, \`ad_account_id\`
`,

  adGroup: `# Pinterest Ad Group Schema (v5)

\`\`\`json
{
  "type": "object",
  "required": ["name", "campaign_id", "budget_in_micro_currency"],
  "properties": {
    "name": { "type": "string" },
    "campaign_id": { "type": "string" },
    "status": { "type": "string", "enum": ["ACTIVE", "PAUSED", "ARCHIVED"] },
    "budget_in_micro_currency": { "type": "integer", "description": "Budget in micro-currency (1 USD = 1000000)" },
    "pacing_delivery_type": { "type": "string", "enum": ["STANDARD", "ACCELERATED"] },
    "bid_strategy_type": { "type": "string", "enum": ["AUTOMATIC_BID", "MAX_BID", "TARGET_AVG_BID"] },
    "targeting_spec": { "type": "object", "description": "Audience targeting configuration" },
    "start_time": { "type": "string", "format": "date-time", "description": "ISO 8601 start datetime (e.g. 2026-04-01T00:00:00)" },
    "end_time": { "type": "string", "format": "date-time", "description": "ISO 8601 end datetime" }
  }
}
\`\`\`

## targeting_spec fields
| Field | Type | Description |
|-------|------|-------------|
| age_bucket | array | Age ranges: "18-24", "25-34", "35-44", "45-49", "50-54", "55-64", "65+" |
| gender | array | "female", "male", "unknown" |
| geo | array | Array of objects with \`country\` (ISO 2-letter code) |
| interest | array | Interest keywords (e.g., "food", "fashion", "travel") |

## Notes
- Budget is per-ad-group in micro-currency
- Read-only fields: \`id\`, \`created_time\`, \`updated_time\`
`,

  ad: `# Pinterest Ad Schema (v5)

\`\`\`json
{
  "type": "object",
  "required": ["name", "ad_group_id", "creative_type"],
  "properties": {
    "name": { "type": "string" },
    "ad_group_id": { "type": "string" },
    "status": { "type": "string", "enum": ["ACTIVE", "PAUSED", "ARCHIVED"] },
    "creative_type": { "type": "string", "enum": ["REGULAR", "VIDEO", "SHOPPING", "CAROUSEL"] },
    "pin_id": { "type": "string", "description": "ID of the Pinterest Pin to promote" }
  }
}
\`\`\`

## Notes
- \`pin_id\` is required — create/upload the Pinterest Pin before creating the Ad
- Creative types: REGULAR (static image), VIDEO, SHOPPING (product pin), CAROUSEL
- Read-only fields: \`id\`, \`created_time\`, \`updated_time\`
`,

  creative: `# Pinterest Creative (Pin) Schema (v5)

\`\`\`json
{
  "type": "object",
  "required": ["title", "description"],
  "properties": {
    "title": { "type": "string" },
    "description": { "type": "string" },
    "link": { "type": "string", "description": "Destination URL" },
    "media": { "type": "object", "description": "Media asset configuration" }
  }
}
\`\`\`

## Notes
- A creative represents a Pinterest Pin that can be promoted as an ad
- \`media\` object contains image or video asset references
- Read-only fields: \`id\`, \`created_time\`, \`ad_account_id\`
`,
};

function buildEntitySchemaMarkdown(entityType: PinterestEntityType): string {
  return ENTITY_SCHEMA_CONTENT[entityType] ?? `# Pinterest ${entityType}\n\nNo schema information available.\n`;
}

function buildAllSchemasMarkdown(): string {
  return getSupportedEntityTypes()
    .map((t) => ENTITY_SCHEMA_CONTENT[t])
    .join("\n\n---\n\n");
}

export const entitySchemaResources: Resource[] = getSupportedEntityTypes().map((entityType) => ({
  uri: `entity-schema://pinterest/${entityType}`,
  name: `Pinterest ${entityType} Schema`,
  description: `Field reference for Pinterest ${entityType} entity including required fields, optional fields, and read-only fields`,
  mimeType: "text/markdown",
  getContent: () => buildEntitySchemaMarkdown(entityType),
}));

export const entitySchemaAllResource: Resource = {
  uri: "entity-schema://pinterest/all",
  name: "Pinterest All Entity Schemas",
  description: "Combined field reference for all Pinterest Ads entity types",
  mimeType: "text/markdown",
  getContent: buildAllSchemasMarkdown,
};
