# @cesteral/pinterest-mcp

Pinterest Ads MCP Server - Campaign management and reporting via Pinterest Ads API v5.

## Purpose

Management server for Pinterest Ads. Provides full CRUD operations, async
reporting, targeting discovery, bulk operations, and specialized features like
entity duplication and audience estimation. Designed for AI agents to manage
Pinterest Ads campaigns programmatically through the Model Context Protocol with
per-session Bearer token authentication.

## Features

- **Per-session Bearer token auth** via `PinterestBearerAuthStrategy` (validates tokens and extracts advertiser ID)
- **Streamable HTTP + stdio transports** via Hono + `@hono/mcp`
- **OpenTelemetry** instrumentation for traces and metrics
- **Rate limiting** via shared `RateLimiter` class (100/min default)
- **Structured logging** via Pino
- **Automatic `ad_account_id` injection** into GET query params and POST request bodies

## MCP Tools

### Core CRUD

#### 1. `pinterest_list_entities`

List Pinterest Ads entities with page-based pagination and optional filtering.

**Parameters:**

- `entityType` (string, required): Type of entity to list
- `adAccountId` (string, required): Pinterest Advertiser ID
- `filters` (object, optional): Filter criteria for the entity list
- `page` (number, optional): Page number for pagination
- `pageSize` (number, optional): Results per page

#### 2. `pinterest_get_entity`

Get a single Pinterest Ads entity by ID.

**Parameters:**

- `entityType` (string, required): Type of entity to retrieve
- `adAccountId` (string, required): Pinterest Advertiser ID
- `entityId` (string, required): The entity ID

#### 3. `pinterest_create_entity`

Create a new Pinterest Ads entity.

**Parameters:**

- `entityType` (string, required): Type of entity to create
- `adAccountId` (string, required): Pinterest Advertiser ID
- `data` (object, required): Entity fields as key-value pairs

#### 4. `pinterest_update_entity`

Update an existing Pinterest Ads entity.

**Parameters:**

- `entityType` (string, required): Type of entity to update
- `adAccountId` (string, required): Pinterest Advertiser ID
- `entityId` (string, required): The entity ID to update
- `data` (object, required): Fields to update as key-value pairs

#### 5. `pinterest_delete_entity`

Delete Pinterest Ads entities.

**Parameters:**

- `entityType` (string, required): Type of entities to delete
- `adAccountId` (string, required): Pinterest Advertiser ID
- `entityIds` (string[], required): Entity IDs to delete (max 20)

### Account

#### 6. `pinterest_list_ad_accounts`

List advertiser accounts accessible to the authenticated user.

**Parameters:** _(none)_

### Reporting

#### 7. `pinterest_get_report`

Submit an async report and download results once complete.

**Parameters:**

- `adAccountId` (string, required): Pinterest Advertiser ID
- `dimensions` (string[], required): Report dimensions (e.g., `campaign_id`, `adgroup_id`)
- `metrics` (string[], required): Metrics to include (e.g., `spend`, `impressions`, `clicks`)
- `startDate` (string, required): Start date (YYYY-MM-DD)
- `endDate` (string, required): End date (YYYY-MM-DD)

#### 8. `pinterest_get_report_breakdowns`

Submit a report with additional breakdown dimensions.

**Parameters:**

- `adAccountId` (string, required): Pinterest Advertiser ID
- `dimensions` (string[], required): Primary dimensions
- `breakdowns` (string[], required): Breakdown dimensions (e.g., `age`, `gender`, `country`)
- `metrics` (string[], required): Metrics to include
- `startDate` (string, required): Start date (YYYY-MM-DD)
- `endDate` (string, required): End date (YYYY-MM-DD)

#### 9. `pinterest_submit_report`

Submit an async report without waiting for completion (non-blocking).

**Parameters:**

- `adAccountId` (string, required): Pinterest Advertiser ID
- `dimensions` (string[], required): Report dimensions
- `metrics` (string[], required): Metrics to include
- `startDate` (string, required): Start date (YYYY-MM-DD)
- `endDate` (string, required): End date (YYYY-MM-DD)

#### 10. `pinterest_check_report_status`

Single status check for a submitted report.

**Parameters:**

- `adAccountId` (string, required): Pinterest Advertiser ID
- `taskId` (string, required): Report task ID from submit

#### 11. `pinterest_download_report`

Download and parse report CSV from URL.

**Parameters:**

- `downloadUrl` (string, required): Report download URL
- `maxRows` (number, optional): Maximum rows to return

### Bulk Operations

#### 12. `pinterest_bulk_update_status`

Batch enable, disable, or delete multiple entities.

**Parameters:**

- `entityType` (string, required): Type of entities to update
- `adAccountId` (string, required): Pinterest Advertiser ID
- `entityIds` (string[], required): Entity IDs to update (max 50)
- `operationStatus` (string, required): `ENABLE`, `DISABLE`, or `DELETE`

#### 13. `pinterest_bulk_create_entities`

Batch create multiple entities of the same type.

**Parameters:**

- `entityType` (string, required): Type of entities to create
- `adAccountId` (string, required): Pinterest Advertiser ID
- `items` (array, required): Array of entity data objects (max 50)

#### 14. `pinterest_bulk_update_entities`

Batch update multiple entities with individual data payloads.

**Parameters:**

- `entityType` (string, required): Type of entities to update
- `adAccountId` (string, required): Pinterest Advertiser ID
- `items` (array, required): Array of update items (max 50), each with entity ID and data

### Bid Adjustment

#### 15. `pinterest_adjust_bids`

Batch adjust ad group bid prices with safe read-modify-write pattern.

**Parameters:**

- `adAccountId` (string, required): Pinterest Advertiser ID
- `adjustments` (array, required): Array of bid adjustments, each with ad group ID, adjustment type, and value

### Targeting

#### 16. `pinterest_search_targeting`

Search for targeting options (interest categories, behaviors, demographics) by keyword.

**Parameters:**

- `adAccountId` (string, required): Pinterest Advertiser ID
- `targetingType` (string, required): Type of targeting to search
- `query` (string, optional): Search keyword

#### 17. `pinterest_get_targeting_options`

Browse available targeting categories.

**Parameters:**

- `adAccountId` (string, required): Pinterest Advertiser ID
- `targetingType` (string, optional): Filter by targeting type

### Specialized

#### 18. `pinterest_duplicate_entity`

Duplicate a campaign, ad group, or ad.

**Parameters:**

- `entityType` (string, required): Type of entity to duplicate (`campaign`, `adGroup`, `ad`)
- `adAccountId` (string, required): Pinterest Advertiser ID
- `entityId` (string, required): ID of the entity to duplicate
- `options` (object, optional): Duplication options (e.g., rename prefix/suffix)

#### 19. `pinterest_get_audience_estimate`

Get estimated audience size for a targeting configuration.

**Parameters:**

- `adAccountId` (string, required): Pinterest Advertiser ID
- `targetingConfig` (object, required): Targeting specification for estimation

#### 20. `pinterest_get_ad_preview`

Get ad preview for video or image ads.

**Parameters:**

- `adAccountId` (string, required): Pinterest Advertiser ID
- `adId` (string, required): Ad ID to preview
- `adFormat` (string, optional): Ad format for preview rendering

### Validation

#### 21. `pinterest_validate_entity`

Client-side validation of entity payloads without making API calls.

**Parameters:**

- `entityType` (string, required): Type of entity to validate
- `mode` (string, required): Validation mode (`create` or `update`)
- `data` (object, required): Entity data to validate

## Supported Entity Types

| Entity Type | API Object | Notes                                           |
| ----------- | ---------- | ----------------------------------------------- |
| `campaign`  | Campaign   | Top-level entity under advertiser account       |
| `adGroup`   | Ad Group   | Targeting, budget, schedule, bidding, placement |
| `ad`        | Ad         | Links creative content to ad group              |
| `creative`  | Creative   | Video/image creative assets                     |

**Entity Hierarchy:** Advertiser > Campaign > Ad Group > Ad (+ Creatives)

## Current Status

**Phase: Production-Ready**

All listed tools are fully implemented using Pinterest Ads API v5 with Bearer
token authentication, async reporting, and targeting discovery.

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

- `PINTEREST_MCP_PORT`: Server port (default: 3007)
- `PINTEREST_MCP_HOST`: Server host (default: `127.0.0.1` in development, `0.0.0.0` in production)
- `MCP_AUTH_MODE`: Authentication mode - `pinterest-bearer` (default), `jwt`, or `none`
- `MCP_AUTH_SECRET_KEY`: Required when `MCP_AUTH_MODE=jwt`
- `PINTEREST_API_BASE_URL`: Pinterest Business API base URL (default: `https://business-api.pinterest.com`)
- `PINTEREST_API_VERSION`: API version (default: `v1.3`)
- `PINTEREST_RATE_LIMIT_PER_MINUTE`: Rate limit ceiling (default: 100)
- `PINTEREST_ACCESS_TOKEN`: Access token for stdio mode
- `PINTEREST_ADVERTISER_ID`: Advertiser ID for stdio mode

## Architecture

### Key Components

- **`PinterestHttpClient`** - HTTP client for Pinterest Ads API v5
- **`PinterestService`** - CRUD, bulk ops, duplication, targeting, audience estimates, ad previews
- **`PinterestReportingService`** - Async report submission, polling, and download
- **`PinterestBearerAuthStrategy`** - Bearer token + advertiser ID auth
- **`PinterestAuthAdapter`** - Token + advertiser ID management for per-session API calls
- **`SessionServiceStore`** - Per-session service instances keyed by session ID

### Key Gotchas

- `ad_account_id` is automatically injected into GET query params and POST request bodies
- Uses page-based pagination (`page`/`page_size`) not cursor-based
- Reporting is async: submit report -> poll for completion -> download results
- Delete operations accept max 20 entity IDs per call
- `DISABLE` status is used instead of `PAUSED` (Pinterest-specific terminology)

### Transport

Streamable HTTP via Hono + `@hono/mcp`. Health check at `/health`.

## Contributing

See root [CLAUDE.md](../../CLAUDE.md) for development guidelines, build system details, and monorepo conventions. See the [root README](../../README.md) for full architecture context.

---

## Get Started

**Self-host**: Follow the [deployment guide](../../docs/guides/deployment-instructions.md) to run this server on your own infrastructure.

**Cesteral Intelligence**: [Request access](https://cesteral.com/integrations/pinterest-ads?utm_source=github&utm_medium=package-readme&utm_campaign=pinterest-mcp) -- governed execution with credential brokering, approvals, audit, and multi-tenant access.

**Book a workflow demo**: [See it in action](mailto:sales@cesteral.com?subject=Workflow%20demo%20-%20Pinterest%20Ads%20MCP) with your own ad accounts.

**Compare options**: [OSS connectors vs Cesteral Intelligence](https://cesteral.com/compare?utm_source=github&utm_medium=package-readme&utm_campaign=pinterest-mcp)

## License

Apache License 2.0 — see [LICENSE](../../LICENSE.md) for details. This package is part of Cesteral's open-source connector layer; managed hosting and higher-level governance features live outside this repository.
