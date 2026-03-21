# @cesteral/linkedin-mcp

LinkedIn Ads MCP Server - Campaign management via LinkedIn Marketing API v2.

## Purpose

Management server for LinkedIn Ads. Provides full CRUD operations, analytics
reporting, targeting discovery, bulk operations, and specialized features like
entity duplication and delivery forecasts. Designed for AI agents to manage
LinkedIn Ads campaigns programmatically through the Model Context Protocol with
per-session Bearer token authentication.

## Features

- **Per-session Bearer token auth** via `LinkedInBearerAuthStrategy` (validates tokens against LinkedIn API)
- **Streamable HTTP + stdio transports** via Hono + `@hono/mcp`
- **OpenTelemetry** instrumentation for traces and metrics
- **Rate limiting** via shared `RateLimiter` class (100/min default, writes cost 3x)
- **Structured logging** via Pino
- **MCP Resources** for entity schemas, examples, analytics reference, and targeting reference
- **MCP Prompts** for campaign setup, analytics reporting, troubleshooting, and schema exploration

## MCP Tools

### Core CRUD

#### 1. `linkedin_list_entities`

List LinkedIn entities with optional filtering and offset-based pagination.

**Parameters:**

- `entityType` (string, required): Type of entity to list
- `adAccountUrn` (string, optional): Ad Account URN to scope results
- `start` (number, optional): Offset for pagination (default 0)
- `count` (number, optional): Results per page (default 25)

#### 2. `linkedin_get_entity`

Get a single LinkedIn entity by URN.

**Parameters:**

- `entityType` (string, required): Type of entity to retrieve
- `entityUrn` (string, required): The entity URN (e.g., `urn:li:sponsoredCampaign:123`)

#### 3. `linkedin_create_entity`

Create a new LinkedIn entity.

**Parameters:**

- `entityType` (string, required): Type of entity to create
- `data` (object, required): Entity fields as key-value pairs

#### 4. `linkedin_update_entity`

Update an existing LinkedIn entity (PATCH via Rest.li partial update).

**Parameters:**

- `entityType` (string, required): Type of entity to update
- `entityUrn` (string, required): The entity URN to update
- `data` (object, required): Fields to update as key-value pairs

#### 5. `linkedin_delete_entity`

Delete a LinkedIn entity.

**Parameters:**

- `entityType` (string, required): Type of entity to delete
- `entityUrn` (string, required): The entity URN to delete

### Account

#### 6. `linkedin_list_ad_accounts`

List ad accounts accessible to the authenticated user.

**Parameters:**

- `start` (number, optional): Offset for pagination (default 0)
- `count` (number, optional): Number of accounts to return (default 25)

### Analytics

#### 7. `linkedin_get_analytics`

Get delivery metrics for LinkedIn Ads entities via `/v2/adAnalytics`.

**Parameters:**

- `adAccountUrn` (string, required): Ad Account URN
- `startDate` (string, required): Start date (YYYY-MM-DD)
- `endDate` (string, required): End date (YYYY-MM-DD)
- `metrics` (string[], optional): Metrics to return (e.g., `impressions`, `clicks`, `costInUsd`)
- `pivot` (string, optional): Pivot dimension (e.g., `CAMPAIGN`, `CREATIVE`)

#### 8. `linkedin_get_analytics_breakdowns`

Get delivery metrics broken down by dimension (geo, device, member demographics, etc.).

**Parameters:**

- `adAccountUrn` (string, required): Ad Account URN
- `startDate` (string, required): Start date (YYYY-MM-DD)
- `endDate` (string, required): End date (YYYY-MM-DD)
- `pivots` (string[], required): Breakdown dimensions (e.g., `['MEMBER_COMPANY_SIZE', 'MEMBER_INDUSTRY']`)
- `metrics` (string[], optional): Metrics to return
- `datePreset` (string, optional): Date preset

### Bulk Operations

#### 9. `linkedin_bulk_update_status`

Batch update status for multiple LinkedIn Ads entities.

**Parameters:**

- `entityType` (string, required): Type of entities to update
- `entityUrns` (string[], required): Entity URNs to update (max 50)
- `status` (string, required): `ACTIVE`, `PAUSED`, or `ARCHIVED`

#### 10. `linkedin_bulk_create_entities`

Batch create multiple entities of the same type.

**Parameters:**

- `entityType` (string, required): Type of entities to create
- `items` (array, required): Array of entity data objects (max 50)

#### 11. `linkedin_bulk_update_entities`

Batch update multiple entities with individual data payloads.

**Parameters:**

- `entityType` (string, required): Type of entities being updated
- `items` (array, required): Array of update items (max 50), each with `entityUrn` and `data`

#### 12. `linkedin_adjust_bids`

Batch adjust campaign bid amounts with percentage or absolute changes (safe read-modify-write).

**Parameters:**

- `adjustments` (array, required): Array of bid adjustments (max 50), each with campaign URN, `adjustmentType` (percentage/absolute), and `value`

### Targeting

#### 13. `linkedin_search_targeting`

Search for targeting audience facets (skills, companies, locations, job titles) by keyword.

**Parameters:**

- `facetType` (string, required): Facet type to search (e.g., `skills`, `companies`, `locations`, `industries`)
- `query` (string, optional): Search keyword
- `limit` (number, optional): Max results (default 25)

#### 14. `linkedin_get_targeting_options`

Browse available targeting categories for an ad account.

**Parameters:**

- `adAccountUrn` (string, required): Ad Account URN
- `facetType` (string, optional): Filter by facet type

### Specialized

#### 15. `linkedin_duplicate_entity`

Duplicate a campaign group, campaign, or creative.

**Parameters:**

- `entityType` (string, required): Type of entity to duplicate (`campaignGroup`, `campaign`, `creative`)
- `entityUrn` (string, required): URN of the entity to duplicate
- `options` (object, optional): Duplication options (e.g., rename prefix/suffix, status)

#### 16. `linkedin_get_delivery_forecast`

Get audience size and delivery forecast for a targeting configuration.

**Parameters:**

- `adAccountUrn` (string, required): Ad Account URN
- `targetingCriteria` (object, required): Targeting criteria specification

#### 17. `linkedin_get_ad_preview`

Get ad preview rendering for a creative.

**Parameters:**

- `creativeUrn` (string, required): Creative URN to preview
- `adFormat` (string, optional): Ad format for preview rendering

### Validation

#### 18. `linkedin_validate_entity`

Client-side validation of entity payloads without making API calls.

**Parameters:**

- `entityType` (string, required): Type of entity to validate
- `mode` (string, required): Validation mode (`create` or `update`)
- `data` (object, required): Entity data to validate

## Supported Entity Types

| Entity Type      | API Object      | Notes                                                      |
| ---------------- | --------------- | ---------------------------------------------------------- |
| `adAccount`      | Ad Account      | Top-level advertising account                              |
| `campaignGroup`  | Campaign Group  | Groups campaigns for budget and scheduling                 |
| `campaign`       | Campaign        | Targeting, bidding, budget, objective                      |
| `creative`       | Creative        | Ad creative content (sponsored content, message ads, etc.) |
| `conversionRule` | Conversion Rule | Conversion tracking rules for attribution                  |

**Entity Hierarchy:** Ad Account > Campaign Group > Campaign > Creative (+ Conversion Rules)

## Current Status

**Phase: Production-Ready**

All listed tools are fully implemented using LinkedIn Marketing API v2 with
Bearer token authentication, analytics reporting, and targeting discovery.

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm run dev:http

# Build
pnpm run build

# Start production server
pnpm run start

# Type check
pnpm run typecheck
```

## Environment Variables

- `LINKEDIN_MCP_PORT`: Server port (default: 3006)
- `LINKEDIN_MCP_HOST`: Server host (default: `127.0.0.1` in development, `0.0.0.0` in production)
- `MCP_AUTH_MODE`: Authentication mode - `linkedin-bearer` (default), `jwt`, or `none`
- `MCP_AUTH_SECRET_KEY`: Required when `MCP_AUTH_MODE=jwt`
- `LINKEDIN_API_BASE_URL`: LinkedIn API base URL (default: `https://api.linkedin.com`)
- `LINKEDIN_API_VERSION`: API version header value (default: `202409`)
- `LINKEDIN_RATE_LIMIT_PER_MINUTE`: Rate limit ceiling (default: 100)
- `LINKEDIN_ACCESS_TOKEN`: Access token for stdio mode

## Architecture

### Key Components

- **`LinkedInHttpClient`** - HTTP client for LinkedIn Marketing API v2 with versioned headers
- **`LinkedInService`** - CRUD, bulk ops, duplication, targeting, delivery forecasts, ad previews
- **`LinkedInReportingService`** - Analytics queries with breakdowns and pivots
- **`LinkedInBearerAuthStrategy`** - Bearer token auth via LinkedIn API validation
- **`LinkedInAuthAdapter`** - Token management for per-session API calls
- **`SessionServiceStore`** - Per-session service instances keyed by session ID

### Key Gotchas

- Entity identifiers use **URN format** (e.g., `urn:li:sponsoredCampaign:123`)
- `LinkedIn-Version: 202409` header is **required on all API requests** and injected automatically
- Updates use **Rest.li partial update format** via `X-Restli-Method: PARTIAL_UPDATE`
- Budget values are `CurrencyAmount` objects with `currencyCode` and `amount` (amount is in **cents**)
- `ARCHIVED` status is **permanent** and cannot be reversed

### Transport

Streamable HTTP via Hono + `@hono/mcp`. Health check at `/health`.

## Contributing

See root [CLAUDE.md](../../CLAUDE.md) for development guidelines, build system details, and monorepo conventions. See the [root README](../../README.md) for full architecture context.

---

## Get Started

**Self-host**: Follow the [deployment guide](../../docs/guides/deployment-instructions.md) to run this server on your own infrastructure.

**Cesteral Intelligence**: [Request access](https://cesteral.com/integrations/linkedin-ads?utm_source=github&utm_medium=package-readme&utm_campaign=linkedin-mcp) -- governed execution with credential brokering, approvals, audit, and multi-tenant access.

**Book a workflow demo**: [See it in action](mailto:sales@cesteral.com?subject=Workflow%20demo%20-%20LinkedIn%20Ads%20MCP) with your own ad accounts.

**Compare options**: [OSS connectors vs Cesteral Intelligence](https://cesteral.com/compare?utm_source=github&utm_medium=package-readme&utm_campaign=linkedin-mcp)

## License

Apache License 2.0 — see [LICENSE](../../LICENSE.md) for details. This package is part of Cesteral's open-source connector layer; managed hosting and higher-level governance features live outside this repository.
