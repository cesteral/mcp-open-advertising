# @cesteral/snapchat-mcp

Snapchat Ads MCP Server - Campaign management and reporting via Snapchat Ads API v1.

## Purpose

Management server for Snapchat Ads. Provides full CRUD operations, async
reporting, targeting discovery, bulk operations, and specialized features like
audience estimation and ad previews. Designed for AI agents to manage
Snapchat Ads campaigns programmatically through the Model Context Protocol with
per-session Bearer token authentication.

## Features

- **Per-session Bearer token auth** via `SnapchatBearerAuthStrategy` (validates tokens and extracts advertiser ID)
- **Streamable HTTP + stdio transports** via Hono + `@hono/mcp`
- **OpenTelemetry** instrumentation for traces and metrics
- **Rate limiting** via shared `RateLimiter` class (100/min default)
- **Structured logging** via Pino
- **Automatic `ad_account_id` injection** into GET query params and POST request bodies

## MCP Tools

### Core CRUD

#### 1. `snapchat_list_entities`

List Snapchat Ads entities with page-based pagination and optional filtering.

**Parameters:**

- `entityType` (string, required): Type of entity to list
- `adAccountId` (string, required): Snapchat Advertiser ID
- `filters` (object, optional): Filter criteria for the entity list
- `page` (number, optional): Page number for pagination
- `pageSize` (number, optional): Results per page

#### 2. `snapchat_get_entity`

Get a single Snapchat Ads entity by ID.

**Parameters:**

- `entityType` (string, required): Type of entity to retrieve
- `adAccountId` (string, required): Snapchat Advertiser ID
- `entityId` (string, required): The entity ID

#### 3. `snapchat_create_entity`

Create a new Snapchat Ads entity.

**Parameters:**

- `entityType` (string, required): Type of entity to create
- `adAccountId` (string, required): Snapchat Advertiser ID
- `data` (object, required): Entity fields as key-value pairs

#### 4. `snapchat_update_entity`

Update an existing Snapchat Ads entity.

**Parameters:**

- `entityType` (string, required): Type of entity to update
- `adAccountId` (string, required): Snapchat Advertiser ID
- `entityId` (string, required): The entity ID to update
- `data` (object, required): Fields to update as key-value pairs

#### 5. `snapchat_delete_entity`

Delete Snapchat Ads entities.

**Parameters:**

- `entityType` (string, required): Type of entities to delete
- `adAccountId` (string, required): Snapchat Advertiser ID
- `entityIds` (string[], required): Entity IDs to delete (max 20)

### Account

#### 6. `snapchat_list_ad_accounts`

List advertiser accounts accessible to the authenticated user.

**Parameters:** _(none)_

### Reporting

#### 7. `snapchat_get_report`

Submit an async report and download results once complete.

**Parameters:**

- `adAccountId` (string, required): Snapchat Advertiser ID
- `dimensions` (string[], required): Report dimensions (e.g., `campaign_id`, `adgroup_id`)
- `metrics` (string[], required): Metrics to include (e.g., `spend`, `impressions`, `clicks`)
- `startDate` (string, required): Start date (YYYY-MM-DD)
- `endDate` (string, required): End date (YYYY-MM-DD)

#### 8. `snapchat_get_report_breakdowns`

Submit a report with additional breakdown dimensions.

**Parameters:**

- `adAccountId` (string, required): Snapchat Advertiser ID
- `dimensions` (string[], required): Primary dimensions
- `breakdowns` (string[], required): Breakdown dimensions (e.g., `age`, `gender`, `country`)
- `metrics` (string[], required): Metrics to include
- `startDate` (string, required): Start date (YYYY-MM-DD)
- `endDate` (string, required): End date (YYYY-MM-DD)

#### 9. `snapchat_submit_report`

Submit an async report without waiting for completion (non-blocking).

**Parameters:**

- `adAccountId` (string, required): Snapchat Advertiser ID
- `dimensions` (string[], required): Report dimensions
- `metrics` (string[], required): Metrics to include
- `startDate` (string, required): Start date (YYYY-MM-DD)
- `endDate` (string, required): End date (YYYY-MM-DD)

#### 10. `snapchat_check_report_status`

Single status check for a submitted report.

**Parameters:**

- `adAccountId` (string, required): Snapchat Advertiser ID
- `taskId` (string, required): Report task ID from submit

#### 11. `snapchat_download_report`

Download and parse report CSV from URL.

**Parameters:**

- `downloadUrl` (string, required): Report download URL
- `maxRows` (number, optional): Maximum rows to return

### Bulk Operations

#### 12. `snapchat_bulk_update_status`

Batch enable, disable, or delete multiple entities.

**Parameters:**

- `entityType` (string, required): Type of entities to update
- `adAccountId` (string, required): Snapchat Advertiser ID
- `entityIds` (string[], required): Entity IDs to update (max 50)
- `operationStatus` (string, required): `ENABLE`, `DISABLE`, or `DELETE`

#### 13. `snapchat_bulk_create_entities`

Batch create multiple entities of the same type.

**Parameters:**

- `entityType` (string, required): Type of entities to create
- `adAccountId` (string, required): Snapchat Advertiser ID
- `items` (array, required): Array of entity data objects (max 50)

#### 14. `snapchat_bulk_update_entities`

Batch update multiple entities with individual data payloads.

**Parameters:**

- `entityType` (string, required): Type of entities to update
- `adAccountId` (string, required): Snapchat Advertiser ID
- `items` (array, required): Array of update items (max 50), each with entity ID and data

### Bid Adjustment

#### 15. `snapchat_adjust_bids`

Batch adjust ad group bid prices with safe read-modify-write pattern.

**Parameters:**

- `adAccountId` (string, required): Snapchat Advertiser ID
- `adjustments` (array, required): Array of bid adjustments, each with ad group ID, adjustment type, and value

### Targeting

#### 16. `snapchat_search_targeting`

Search for targeting options (interest categories, behaviors, demographics) by keyword.

**Parameters:**

- `adAccountId` (string, required): Snapchat Advertiser ID
- `targetingType` (string, required): Type of targeting to search
- `query` (string, optional): Search keyword

#### 17. `snapchat_get_targeting_options`

Browse available targeting categories.

**Parameters:**

- `adAccountId` (string, required): Snapchat Advertiser ID
- `targetingType` (string, optional): Filter by targeting type

### Specialized

#### 18. `snapchat_get_audience_estimate`

Get estimated audience size for a targeting configuration.

**Parameters:**

- `adAccountId` (string, required): Snapchat Advertiser ID
- `targetingConfig` (object, required): Targeting specification for estimation

#### 19. `snapchat_get_ad_preview`

Get ad preview for video or image ads.

**Parameters:**

- `adAccountId` (string, required): Snapchat Advertiser ID
- `adId` (string, required): Ad ID to preview
- `adFormat` (string, optional): Ad format for preview rendering

### Validation

#### 20. `snapchat_validate_entity`

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

All listed tools are fully implemented using Snapchat Ads API v1 with Bearer
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

- `SNAPCHAT_MCP_PORT`: Server port (default: 3007)
- `SNAPCHAT_MCP_HOST`: Server host (default: `127.0.0.1` in development, `0.0.0.0` in production)
- `MCP_AUTH_MODE`: Authentication mode - `snapchat-bearer` (default), `jwt`, or `none`
- `MCP_AUTH_SECRET_KEY`: Required when `MCP_AUTH_MODE=jwt`
- `SNAPCHAT_API_BASE_URL`: Snapchat Business API base URL (default: `https://business-api.snapchat.com`)
- `SNAPCHAT_API_VERSION`: API version (default: `v1.3`)
- `SNAPCHAT_RATE_LIMIT_PER_MINUTE`: Rate limit ceiling (default: 100)
- `SNAPCHAT_ACCESS_TOKEN`: Access token for stdio mode
- `SNAPCHAT_ADVERTISER_ID`: Advertiser ID for stdio mode

## Architecture

### Key Components

- **`SnapchatHttpClient`** - HTTP client for Snapchat Ads API v1
- **`SnapchatService`** - CRUD, bulk ops, targeting, audience estimates, ad previews
- **`SnapchatReportingService`** - Async report submission, polling, and download
- **`SnapchatBearerAuthStrategy`** - Bearer token + advertiser ID auth
- **`SnapchatAuthAdapter`** - Token + advertiser ID management for per-session API calls
- **`SessionServiceStore`** - Per-session service instances keyed by session ID

### Key Gotchas

- `ad_account_id` is automatically injected into GET query params and POST request bodies
- Uses page-based pagination (`page`/`page_size`) not cursor-based
- Reporting is async: submit report -> poll for completion -> download results
- Delete operations accept max 20 entity IDs per call
- `DISABLE` status is used instead of `PAUSED` (Snapchat-specific terminology)

### Transport

Streamable HTTP via Hono + `@hono/mcp`. Health check at `/health`.

## Contributing

See root [CLAUDE.md](../../CLAUDE.md) for development guidelines, build system details, and monorepo conventions. See the [root README](../../README.md) for full architecture context.

---

## Get Started

**Self-host**: Follow the [deployment guide](../../docs/guides/deployment-instructions.md) to run this server on your own infrastructure.

**Cesteral Intelligence**: [Request access](https://cesteral.com/integrations/snapchat-ads?utm_source=github&utm_medium=package-readme&utm_campaign=snapchat-mcp) -- governed execution with credential brokering, approvals, audit, and multi-tenant access.

**Book a workflow demo**: [See it in action](mailto:sales@cesteral.com?subject=Workflow%20demo%20-%20Snapchat%20Ads%20MCP) with your own ad accounts.

**Compare options**: [OSS connectors vs Cesteral Intelligence](https://cesteral.com/compare?utm_source=github&utm_medium=package-readme&utm_campaign=snapchat-mcp)

## License

Apache License 2.0 — see [LICENSE](../../LICENSE.md) for details. This package is part of Cesteral's open-source connector layer; managed hosting and higher-level governance features live outside this repository.
