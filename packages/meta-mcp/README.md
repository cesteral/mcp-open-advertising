# @cesteral/meta-mcp

Meta Ads MCP Server - Campaign management via the configured Meta Graph API (default: v24.0).

## Purpose

Management server for Meta Ads. Provides full CRUD operations, performance
insights, targeting discovery, bulk operations, and specialized features like
entity duplication and delivery estimates. Designed for AI agents to manage Meta
Ads campaigns programmatically through the Model Context Protocol with
per-session Bearer token authentication.

## Choose Your Path

- **Self-host this connector** when you want direct control of credentials,
  infrastructure, and Meta Ads API access.
- **Use Cesteral Intelligence** when the workflow needs approvals before spend
  commits, credential brokering, auditability, and cross-platform execution.

[Self-host quickstart](../../docs/guides/quickstart.md) | [Compare OSS vs Cesteral Intelligence](https://cesteral.com/compare?utm_source=github&utm_medium=package-readme&utm_campaign=meta-mcp) | [Book a workflow demo](mailto:sales@cesteral.com?subject=Workflow%20demo%20-%20Meta%20Ads%20MCP)

## Features

- **Per-session Bearer token auth** via `MetaBearerAuthStrategy` (validates tokens against `GET /me`)
- **Streamable HTTP + stdio transports** via Hono + `@hono/mcp`
- **OpenTelemetry** instrumentation for traces and metrics
- **Rate limiting** via shared `RateLimiter` class (200/min default, writes cost 3x)
- **Structured logging** via Pino
- **MCP Resources** for entity schemas, examples, insights reference, and targeting reference
- **MCP Prompts** for campaign setup, insights reporting, troubleshooting, and schema exploration

## MCP Tools

### Core CRUD

#### 1. `meta_list_entities`

List Meta Ads entities with optional filtering and cursor-based pagination.

**Parameters:**

- `entityType` (string, required): Type of entity to list
- `adAccountId` (string, required): Ad Account ID (with or without `act_` prefix)
- `fields` (string[], optional): Field names to return
- `filtering` (array, optional): Filter objects in Meta filtering format
- `limit` (number, optional): Results per page (1-100, default 25)
- `after` (string, optional): Cursor for next page

#### 2. `meta_get_entity`

Get a single Meta Ads entity by ID.

**Parameters:**

- `entityType` (string, required): Type of entity to retrieve
- `entityId` (string, required): The entity ID
- `fields` (string[], optional): Field names to return

#### 3. `meta_create_entity`

Create a new Meta Ads entity.

**Parameters:**

- `entityType` (string, required): Type of entity to create
- `adAccountId` (string, required): Ad Account ID
- `data` (object, required): Entity fields as key-value pairs

#### 4. `meta_update_entity`

Update an existing Meta Ads entity (POST with PATCH semantics).

**Parameters:**

- `entityType` (string, optional): Type of entity to update (informational only, not used in API call)
- `entityId` (string, required): The entity ID to update
- `data` (object, required): Fields to update as key-value pairs

#### 5. `meta_delete_entity`

Delete a Meta Ads entity.

**Parameters:**

- `entityType` (string, required): Type of entity to delete
- `entityId` (string, required): The entity ID to delete

### Account

#### 6. `meta_list_ad_accounts`

List ad accounts accessible to the authenticated user.

**Parameters:**

- `fields` (string[], optional): Field names to return (defaults to id, name, account_status, currency, timezone_name, amount_spent, balance)
- `limit` (number, optional): Number of accounts to return (1-100)
- `after` (string, optional): Pagination cursor from previous response

### Insights

#### 7. `meta_get_insights`

Get performance insights for a Meta Ads entity (account, campaign, ad set, or ad).

**Parameters:**

- `entityId` (string, required): Entity ID to get insights for
- `fields` (string[], optional): Metrics/fields to return
- `datePreset` (string, optional): Date preset (`today`, `yesterday`, `last_7d`, `last_30d`, etc.)
- `timeRange` (object, optional): Object with `since` and `until` (YYYY-MM-DD)
- `timeIncrement` (string, optional): Granularity (`1` for daily, `7` for weekly, `monthly`, `all_days`)
- `level` (string, optional): Aggregation level (`account`, `campaign`, `adset`, `ad`)
- `limit` (number, optional): Results per page (1-500)
- `after` (string, optional): Cursor for next page

#### 8. `meta_get_insights_breakdowns`

Get performance insights broken down by dimension (age, gender, country, device, etc.).

**Parameters:**

- `entityId` (string, required): Entity ID to get insights for
- `breakdowns` (string[], required): Breakdown dimensions (e.g., `['age', 'gender']`)
- `fields` (string[], optional): Metrics to return
- `datePreset` (string, optional): Date preset
- `timeRange` (object, optional): Object with `since` and `until`
- `timeIncrement` (string, optional): Time granularity
- `level` (string, optional): Aggregation level
- `actionAttributionWindows` (string[], optional): Attribution windows (e.g., `['1d_click', '7d_click']`)
- `limit` (number, optional): Results per page (1-500)
- `after` (string, optional): Cursor for next page

### Bulk Operations

#### 9. `meta_bulk_update_status`

Batch update status for multiple Meta Ads entities.

**Parameters:**

- `entityType` (string, optional): Type of entities to update (informational only, not used in API call)
- `entityIds` (string[], required): Entity IDs to update (max 50)
- `status` (string, required): `ACTIVE`, `PAUSED`, or `ARCHIVED`

#### 10. `meta_bulk_create_entities`

Batch create multiple entities of the same type.

**Parameters:**

- `entityType` (string, required): Type of entities to create
- `adAccountId` (string, required): Ad Account ID
- `items` (array, required): Array of entity data objects (max 50)

#### 11. `meta_bulk_update_entities`

Batch update multiple entities with individual data payloads.

**Parameters:**

- `entityType` (string, optional): Type of entities being updated (informational only, not used in API call)
- `items` (array, required): Array of update items (max 50), each with `entityId` and `data`

### Targeting

#### 12. `meta_search_targeting`

Search for targeting options (interests, behaviors, demographics) by keyword.

**Parameters:**

- `type` (string, required): Search type (`adinterest`, `adinterestsuggestion`, `adgeolocation`, `adlocale`, etc.)
- `query` (string, required): Search keyword
- `limit` (number, optional): Max results (1-100, default 25)

#### 13. `meta_get_targeting_options`

Browse available targeting categories for an ad account.

**Parameters:**

- `adAccountId` (string, required): Ad Account ID
- `type` (string, optional): Filter by targeting type (e.g., `interests`, `behaviors`)

### Specialized

#### 14. `meta_duplicate_entity`

Duplicate a campaign, ad set, or ad via `POST /{id}/copies`.

**Parameters:**

- `entityType` (string, required): Type of entity to duplicate (`campaign`, `adSet`, `ad`)
- `entityId` (string, required): ID of the entity to duplicate
- `renameOptions` (object, optional): Object with `prefix` and/or `suffix` for naming
- `statusOption` (string, optional): Status for copy (`ACTIVE`, `PAUSED`, `INHERITED`)

#### 15. `meta_get_delivery_estimate`

Get estimated audience size and delivery estimates for a targeting spec.

**Parameters:**

- `adAccountId` (string, required): Ad Account ID
- `targetingSpec` (object, required): Targeting specification (must include `geo_locations` or `custom_audiences`)
- `optimizationGoal` (string, optional): Optimization goal (e.g., `LINK_CLICKS`, `REACH`, `CONVERSIONS`)

#### 16. `meta_get_ad_preview`

Get preview HTML for an ad in a specific format.

**Parameters:**

- `adId` (string, required): Ad ID to preview
- `adFormat` (string, required): Ad format (e.g., `DESKTOP_FEED_STANDARD`, `MOBILE_FEED_STANDARD`, `INSTAGRAM_STANDARD`)

#### 17. `meta_adjust_bids`

Batch adjust ad set bid amounts with percentage or absolute changes.

**Parameters:**

- `adAccountId` (string, required): Ad Account ID
- `adjustments` (array, required): Array of bid adjustments (max 50), each with `adSetId`, `adjustmentType` (percentage/absolute), and `value`

#### 18. `meta_validate_entity`

Client-side validation of entity payloads without making API calls.

**Parameters:**

- `entityType` (string, required): Type of entity to validate
- `mode` (string, required): Validation mode (`create` or `update`)
- `data` (object, required): Entity data to validate
- `adAccountId` (string, optional): Required for create mode
- `entityId` (string, optional): Required for update mode

## Supported Entity Types

| Entity Type      | API Object      | Notes                                       |
| ---------------- | --------------- | ------------------------------------------- |
| `campaign`       | Campaign        | Top-level entity under ad account           |
| `adSet`          | Ad Set          | Targeting, budget, schedule, bidding        |
| `ad`             | Ad              | Links ad creative to ad set                 |
| `adCreative`     | Ad Creative     | Creative content (images, videos, copy)     |
| `customAudience` | Custom Audience | Lookalike, website, customer list audiences |

**Entity Hierarchy:** Ad Account > Campaign > Ad Set > Ad (+ Ad Creatives, Custom Audiences)

## Current Status

**Phase: Production-Ready**

All listed tools are fully implemented using the configured Meta Graph API with
Bearer token authentication, insights reporting, and targeting discovery.

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

- `META_MCP_PORT`: Server port (default: 3005)
- `META_MCP_HOST`: Server host (default: 127.0.0.1)
- `MCP_AUTH_MODE`: Authentication mode - `meta-bearer` (default), `jwt`, or `none`
- `MCP_AUTH_SECRET_KEY`: Required when `MCP_AUTH_MODE=jwt`
- `META_API_BASE_URL`: Graph API base URL (default: `https://graph.facebook.com/v24.0`)
- `META_API_VERSION`: API version (default: `v24.0`)
- `META_RATE_LIMIT_PER_MINUTE`: Rate limit ceiling (default: 200)
- `META_ACCESS_TOKEN`: Access token for stdio mode
- `META_VIDEO_UPLOAD_MAX_BUFFERED_BYTES`: Max buffered video upload size in bytes (default: `268435456`)

## Architecture

### Key Components

- **`MetaGraphApiClient`** - HTTP client for the configured Graph API version with form-encoded POST for writes
- **`MetaService`** - CRUD, bulk ops, duplication, delivery estimates, ad previews
- **`MetaInsightsService`** - Insights queries with breakdowns, attribution windows, and time series
- **`MetaTargetingService`** - Targeting search and category browsing
- **`MetaBearerAuthStrategy`** - Bearer token auth via `GET /me` validation
- **`MetaAuthAdapter`** - Token management for per-session API calls
- **`SessionServiceStore`** - Per-session service instances keyed by session ID

### Key Gotchas

- Budget values are in **cents** (e.g., `1000` = $10.00)
- `special_ad_categories` is required on campaign creation even if empty (`[]`)
- `meta_update_entity` returns `{success: true}` — fetch the entity after to confirm changes
- `targeting` on ad sets replaces entirely on update (no merge semantics)
- `ARCHIVED` status is permanent and cannot be reversed
- Insights data may lag up to 48 hours for recent activity
- Video uploads use a buffered proxy path and are intentionally capped below Meta's largest native upload limits

### Transport

Streamable HTTP via Hono + `@hono/mcp`. Health check at `/health`.

## Contributing

See root [CLAUDE.md](../../CLAUDE.md) for development guidelines, build system details, and monorepo conventions. See the [root README](../../README.md) for full architecture context.

---

## Get Started

**Self-host**: Follow the [deployment guide](../../docs/guides/deployment-instructions.md) to run this server on your own infrastructure.

**Cesteral Intelligence**: [Request access](https://cesteral.com/integrations/meta-ads?utm_source=github&utm_medium=package-readme&utm_campaign=meta-mcp) -- governed execution with credential brokering, approvals, audit, and multi-tenant access.

**Book a workflow demo**: [See it in action](mailto:sales@cesteral.com?subject=Workflow%20demo%20-%20Meta%20Ads%20MCP) with your own ad accounts.

**Compare options**: [OSS connectors vs Cesteral Intelligence](https://cesteral.com/compare?utm_source=github&utm_medium=package-readme&utm_campaign=meta-mcp)

## License

Apache License 2.0 — see [LICENSE](../../LICENSE.md) for details. This package is part of Cesteral's open-source connector layer; managed hosting and higher-level governance features live outside this repository.
