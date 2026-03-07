# @cesteral/tiktok-mcp

TikTok Ads MCP Server - Campaign management and reporting via TikTok Marketing API v1.3.

## Purpose

Management server for TikTok Ads. Provides 18 tools across 4 entity types for full CRUD operations, async reporting, targeting discovery, bulk operations, and specialized features like entity duplication and audience estimation. Designed for AI agents to manage TikTok Ads campaigns programmatically through the Model Context Protocol with per-session Bearer token authentication.

## Features

- **Per-session Bearer token auth** via `TikTokBearerAuthStrategy` (validates tokens and extracts advertiser ID)
- **Streamable HTTP + stdio transports** via Hono + `@hono/mcp`
- **OpenTelemetry** instrumentation for traces and metrics
- **Rate limiting** via shared `RateLimiter` class (100/min default)
- **Structured logging** via Pino
- **Automatic `advertiser_id` injection** into GET query params and POST request bodies

## MCP Tools

### Core CRUD

#### 1. `tiktok_list_entities`
List TikTok Ads entities with page-based pagination and optional filtering.

**Parameters:**
- `entityType` (string, required): Type of entity to list
- `advertiserId` (string, required): TikTok Advertiser ID
- `filters` (object, optional): Filter criteria for the entity list
- `page` (number, optional): Page number for pagination
- `pageSize` (number, optional): Results per page

#### 2. `tiktok_get_entity`
Get a single TikTok Ads entity by ID.

**Parameters:**
- `entityType` (string, required): Type of entity to retrieve
- `advertiserId` (string, required): TikTok Advertiser ID
- `entityId` (string, required): The entity ID

#### 3. `tiktok_create_entity`
Create a new TikTok Ads entity.

**Parameters:**
- `entityType` (string, required): Type of entity to create
- `advertiserId` (string, required): TikTok Advertiser ID
- `data` (object, required): Entity fields as key-value pairs

#### 4. `tiktok_update_entity`
Update an existing TikTok Ads entity.

**Parameters:**
- `entityType` (string, required): Type of entity to update
- `advertiserId` (string, required): TikTok Advertiser ID
- `entityId` (string, required): The entity ID to update
- `data` (object, required): Fields to update as key-value pairs

#### 5. `tiktok_delete_entity`
Delete TikTok Ads entities.

**Parameters:**
- `entityType` (string, required): Type of entities to delete
- `advertiserId` (string, required): TikTok Advertiser ID
- `entityIds` (string[], required): Entity IDs to delete (max 20)

### Account

#### 6. `tiktok_list_advertisers`
List advertiser accounts accessible to the authenticated user.

**Parameters:** _(none)_

### Reporting

#### 7. `tiktok_get_report`
Submit an async report and download results once complete.

**Parameters:**
- `advertiserId` (string, required): TikTok Advertiser ID
- `dimensions` (string[], required): Report dimensions (e.g., `campaign_id`, `adgroup_id`)
- `metrics` (string[], required): Metrics to include (e.g., `spend`, `impressions`, `clicks`)
- `startDate` (string, required): Start date (YYYY-MM-DD)
- `endDate` (string, required): End date (YYYY-MM-DD)

#### 8. `tiktok_get_report_breakdowns`
Submit a report with additional breakdown dimensions.

**Parameters:**
- `advertiserId` (string, required): TikTok Advertiser ID
- `dimensions` (string[], required): Primary dimensions
- `breakdowns` (string[], required): Breakdown dimensions (e.g., `age`, `gender`, `country`)
- `metrics` (string[], required): Metrics to include
- `startDate` (string, required): Start date (YYYY-MM-DD)
- `endDate` (string, required): End date (YYYY-MM-DD)

### Bulk Operations

#### 9. `tiktok_bulk_update_status`
Batch enable, disable, or delete multiple entities.

**Parameters:**
- `entityType` (string, required): Type of entities to update
- `advertiserId` (string, required): TikTok Advertiser ID
- `entityIds` (string[], required): Entity IDs to update (max 50)
- `operationStatus` (string, required): `ENABLE`, `DISABLE`, or `DELETE`

#### 10. `tiktok_bulk_create_entities`
Batch create multiple entities of the same type.

**Parameters:**
- `entityType` (string, required): Type of entities to create
- `advertiserId` (string, required): TikTok Advertiser ID
- `items` (array, required): Array of entity data objects (max 50)

#### 11. `tiktok_bulk_update_entities`
Batch update multiple entities with individual data payloads.

**Parameters:**
- `entityType` (string, required): Type of entities to update
- `advertiserId` (string, required): TikTok Advertiser ID
- `items` (array, required): Array of update items (max 50), each with entity ID and data

### Bid Adjustment

#### 12. `tiktok_adjust_bids`
Batch adjust ad group bid prices with safe read-modify-write pattern.

**Parameters:**
- `advertiserId` (string, required): TikTok Advertiser ID
- `adjustments` (array, required): Array of bid adjustments, each with ad group ID, adjustment type, and value

### Targeting

#### 13. `tiktok_search_targeting`
Search for targeting options (interest categories, behaviors, demographics) by keyword.

**Parameters:**
- `advertiserId` (string, required): TikTok Advertiser ID
- `targetingType` (string, required): Type of targeting to search
- `query` (string, optional): Search keyword

#### 14. `tiktok_get_targeting_options`
Browse available targeting categories.

**Parameters:**
- `advertiserId` (string, required): TikTok Advertiser ID
- `targetingType` (string, optional): Filter by targeting type

### Specialized

#### 15. `tiktok_duplicate_entity`
Duplicate a campaign, ad group, or ad.

**Parameters:**
- `entityType` (string, required): Type of entity to duplicate (`campaign`, `adGroup`, `ad`)
- `advertiserId` (string, required): TikTok Advertiser ID
- `entityId` (string, required): ID of the entity to duplicate
- `options` (object, optional): Duplication options (e.g., rename prefix/suffix)

#### 16. `tiktok_get_audience_estimate`
Get estimated audience size for a targeting configuration.

**Parameters:**
- `advertiserId` (string, required): TikTok Advertiser ID
- `targetingConfig` (object, required): Targeting specification for estimation

#### 17. `tiktok_get_ad_previews`
Get ad preview for video or image ads.

**Parameters:**
- `advertiserId` (string, required): TikTok Advertiser ID
- `adId` (string, required): Ad ID to preview
- `adFormat` (string, optional): Ad format for preview rendering

### Validation

#### 18. `tiktok_validate_entity`
Client-side validation of entity payloads without making API calls.

**Parameters:**
- `entityType` (string, required): Type of entity to validate
- `mode` (string, required): Validation mode (`create` or `update`)
- `data` (object, required): Entity data to validate

## Supported Entity Types

| Entity Type | API Object | Notes |
|-------------|-----------|-------|
| `campaign` | Campaign | Top-level entity under advertiser account |
| `adGroup` | Ad Group | Targeting, budget, schedule, bidding, placement |
| `ad` | Ad | Links creative content to ad group |
| `creative` | Creative | Video/image creative assets |

**Entity Hierarchy:** Advertiser > Campaign > Ad Group > Ad (+ Creatives)

## Current Status

**Phase: Production-Ready**

All 18 tools are fully implemented using TikTok Marketing API v1.3 with Bearer token authentication, async reporting, and targeting discovery.

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

- `TIKTOK_MCP_PORT`: Server port (default: 3007)
- `TIKTOK_MCP_HOST`: Server host (default: `127.0.0.1` in development, `0.0.0.0` in production)
- `MCP_AUTH_MODE`: Authentication mode - `tiktok-bearer` (default), `jwt`, or `none`
- `MCP_AUTH_SECRET_KEY`: Required when `MCP_AUTH_MODE=jwt`
- `TIKTOK_API_BASE_URL`: TikTok Business API base URL (default: `https://business-api.tiktok.com`)
- `TIKTOK_API_VERSION`: API version (default: `v1.3`)
- `TIKTOK_RATE_LIMIT_PER_MINUTE`: Rate limit ceiling (default: 100)
- `TIKTOK_ACCESS_TOKEN`: Access token for stdio mode
- `TIKTOK_ADVERTISER_ID`: Advertiser ID for stdio mode

## Architecture

### Key Components

- **`TikTokHttpClient`** - HTTP client for TikTok Marketing API v1.3
- **`TikTokService`** - CRUD, bulk ops, duplication, targeting, audience estimates, ad previews
- **`TikTokReportingService`** - Async report submission, polling, and download
- **`TikTokBearerAuthStrategy`** - Bearer token + advertiser ID auth
- **`TikTokAuthAdapter`** - Token + advertiser ID management for per-session API calls
- **`SessionServiceStore`** - Per-session service instances keyed by session ID

### Key Gotchas

- `advertiser_id` is automatically injected into GET query params and POST request bodies
- Uses page-based pagination (`page`/`page_size`) not cursor-based
- Reporting is async: submit report -> poll for completion -> download results
- Delete operations accept max 20 entity IDs per call
- `DISABLE` status is used instead of `PAUSED` (TikTok-specific terminology)

### Transport

Streamable HTTP via Hono + `@hono/mcp`. Health check at `/health`.

## Contributing

See root [CLAUDE.md](../../CLAUDE.md) for development guidelines, build system details, and monorepo conventions. See the [root README](../../README.md) for full architecture context.

## License

Business Source License 1.1 — see [LICENSE](../../LICENSE) for details.
