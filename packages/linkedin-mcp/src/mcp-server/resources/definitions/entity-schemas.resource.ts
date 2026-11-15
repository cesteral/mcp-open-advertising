// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * LinkedIn Entity Schema Resources
 * Field references per entity type
 */
import type { Resource } from "../types.js";

const ENTITY_SCHEMAS: Record<string, string> = {
  adAccount: `# LinkedIn Ad Account Schema

## Key Fields

| Field | Type | Description |
|-------|------|-------------|
| id | number | Account ID (part of URN) |
| name | string | Account name |
| status | string | ACTIVE, CANCELED, DRAFT, PENDING_DELETION |
| currency | string | ISO 4217 currency code (e.g., USD) |
| type | string | BUSINESS, ENTERPRISE |
| reference | string | Company URN reference |

## Read-Only Fields
- id, changeAuditStamps, created, lastModified

## Status Values
ACTIVE, CANCELED, DRAFT, PENDING_DELETION
`,

  campaignGroup: `# LinkedIn Campaign Group Schema

## Key Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Campaign group name |
| account | string | Yes | Ad account URN |
| status | string | Yes | ACTIVE, PAUSED, DRAFT, ARCHIVED, CANCELED |
| totalBudget | CurrencyAmount | No | Total budget cap |
| runSchedule | DateRange | No | Start/end timestamps (ms) |
| backfilled | boolean | No | Whether created via migration |

## CurrencyAmount Object
\`\`\`json
{ "amount": "500.00", "currencyCode": "USD" }
\`\`\`

## DateRange Object
\`\`\`json
{ "start": 1735689600000, "end": 1748476800000 }
\`\`\`
(Unix timestamps in milliseconds)
`,

  campaign: `# LinkedIn Campaign Schema

## Key Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Campaign name |
| campaignGroup | string | Yes | Campaign group URN |
| account | string | Yes | Ad account URN (immutable) |
| type | string | Yes | SPONSORED_UPDATES, TEXT_AD, SPONSORED_INMAILS, DYNAMIC |
| costType | string | Yes | CPM, CPC, CPV |
| unitCost | CurrencyAmount | Yes | Bid, target cost or cost cap, depending on the bidding strategy |
| dailyBudget | CurrencyAmount | Yes, unless totalBudget | Daily spending limit |
| totalBudget | CurrencyAmount | Yes, unless dailyBudget | Lifetime budget |
| locale | object | Yes | \`{ country, language }\`, a supported combination |
| targetingCriteria | object | Yes | Audience targeting definition |
| offsiteDeliveryEnabled | boolean | Yes | Serve on the LinkedIn Audience Network (no default) |
| politicalIntent | string | Yes | POLITICAL, NOT_POLITICAL, NOT_DECLARED |
| status | string | Yes | ACTIVE, PAUSED, DRAFT, ARCHIVED (reversible), CANCELED, PENDING_DELETION |
| objectiveType | string | No | BRAND_AWARENESS, ENGAGEMENT, LEAD_GENERATION, WEBSITE_CONVERSIONS, VIDEO_VIEWS, etc. |
| runSchedule | DateRange | No | Start/end timestamps (ms) |

## Campaign Types
SPONSORED_UPDATES, TEXT_AD, DYNAMIC, SPONSORED_INMAILS, VIDEO, CAROUSEL

## Objective Types
BRAND_AWARENESS, WEBSITE_TRAFFIC, WEBSITE_CONVERSIONS, LEAD_GENERATION,
ENGAGEMENT, VIDEO_VIEWS, TALENT_LEADS
`,

  creative: `# LinkedIn Creative Schema

Creatives are on LinkedIn's Creatives API, which replaces adCreativesV2:
\`/rest/adAccounts/{accountId}/creatives\` (create, and list with the \`criteria\`
finder and cursor paging) and \`/rest/adAccounts/{accountId}/creatives/{encoded URN}\`
(get, update, delete). Pass \`adAccountUrn\`; the body carries no account.

## Key Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| campaign | string | Yes | Campaign URN |
| content | object | Yes, unless createInline | What the creative sponsors, e.g. \`{ "reference": "urn:li:share:…" }\` (a share, ugcPost or adInMailContent URN), or dynamic, event or VAST ad content |
| name | string | No | Advertiser-facing name |
| intendedStatus | string | No | ACTIVE, PAUSED, DRAFT, ARCHIVED, CANCELED, PENDING_DELETION (REMOVED is read-only) |
| leadgenCallToAction | object | For LEAD_GENERATION campaigns | Call-to-action button and lead form |
| account | string | Read-only | The owning ad account |
| id | string | Read-only | \`urn:li:sponsoredCreative:…\` |
| review | object | Read-only | Review status (absent while DRAFT) |
| isServing, servingHoldReasons | — | Read-only | Serving state |

An update can change \`intendedStatus\`, \`name\` and \`leadgenCallToAction\`. There is no \`status\` field.

## Content Reference URN Formats
- Share: \`urn:li:share:123456789\`
- UGC post: \`urn:li:ugcPost:123456789\`
- InMail content: \`urn:li:adInMailContent:123456789\`
`,
  conversionRule: `# LinkedIn Conversion Rule Schema

## Key Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Conversion rule name |
| type | string | Yes | PURCHASE, ADD_TO_CART, DOWNLOAD, SIGN_UP, etc. |
| account | string | Yes | Ad account URN |
| status | string | Yes | ACTIVE, PAUSED |
| urlRules | array | No | URL matching rules |
| value | CurrencyAmount | No | Monetary value of conversion |
| attributionWindow | object | No | Click/view attribution window settings |

## Conversion Types
PURCHASE, ADD_TO_CART, DOWNLOAD, SIGN_UP, LEAD, VIEW_KEY_PAGE, JOB_APPLICANT, OTHER
`,
};

function buildSchemaResource(entityType: string): Resource {
  return {
    uri: `entity-schema://linkedin/${entityType}`,
    name: `LinkedIn ${entityType} Schema`,
    description: `Field reference for LinkedIn ${entityType} entities`,
    mimeType: "text/markdown",
    getContent: () => ENTITY_SCHEMAS[entityType] ?? `# ${entityType}\n\nNo schema available.`,
  };
}

export const entitySchemaResources: Resource[] =
  Object.keys(ENTITY_SCHEMAS).map(buildSchemaResource);

export const entitySchemaAllResource: Resource = {
  uri: "entity-schema://linkedin/all",
  name: "LinkedIn All Entity Schemas",
  description: "Field references for all LinkedIn Ads entity types",
  mimeType: "text/markdown",
  getContent: () =>
    Object.entries(ENTITY_SCHEMAS)
      .map(([, content]) => content)
      .join("\n\n---\n\n"),
};
