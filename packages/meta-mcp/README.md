# @cesteral/meta-mcp

Meta Ads MCP Server - Campaign management via the configured Meta Graph API (default: v26.0).

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
- **Rate limiting** via shared `RateLimiter` class (20/min default per process, override with `META_RATE_LIMIT_PER_MINUTE`; writes cost 3x)
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

> All Meta reporting tools (`meta_get_insights`, `meta_get_insights_breakdowns`, and the `meta_download_report` tool used in async report flows) return data using the shared bounded report-view contract: `mode` (`"summary"` default — headers + counts + 10-row preview, or `"rows"` for a paginated rows page), `columns` (project to selected columns), `offset` (zero-based pagination), and `maxRows` (page size; default 10 for summary, 50 for rows; hard cap 200). `limit` and `after` remain available for cursoring across upstream Meta pages.

#### 7. `meta_get_insights`

Get performance insights for a Meta Ads entity (account, campaign, ad set, or ad).

**Parameters:**

- `entityId` (string, required): Entity ID to get insights for
- `fields` (string[], optional): Metrics/fields to return
- `datePreset` (string, optional): Date preset (`today`, `yesterday`, `last_7d`, `last_30d`, etc.)
- `timeRange` (object, optional): Object with `since` and `until` (YYYY-MM-DD)
- `timeIncrement` (string, optional): Granularity (`1` for daily, `7` for weekly, `monthly`, `all_days`)
- `level` (string, optional): Aggregation level (`account`, `campaign`, `adset`, `ad`)
- `limit` (number, optional): Upstream Meta page size (1-500). Use `maxRows` to control the bounded view's returned-row count.
- `after` (string, optional): Cursor for next upstream page
- `mode`, `columns`, `offset`, `maxRows` (optional): Bounded report-view params (see note above)

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
- `limit` (number, optional): Upstream Meta page size (1-500). Use `maxRows` for bounded-view row count.
- `after` (string, optional): Cursor for next upstream page
- `mode`, `columns`, `offset`, `maxRows` (optional): Bounded report-view params (see note above)

#### 9. `meta_get_available_metrics`

List the Insights metrics, breakdowns and action breakdowns available (static catalog), grouped by category. Use it to discover valid `fields` before calling the insights tools.

**Parameters:**

- `level` (string, optional): `account`, `campaign`, `adset`, or `ad`

### Async Reporting

#### 10. `meta_submit_report`

Submit an async insights report (`POST /{id}/insights` with `async=1`) and return a `reportRunId` immediately.

**Parameters:**

- `entityId` (string, required): Account (`act_XXX`), campaign, ad set, or ad ID
- `fields`, `datePreset`, `timeRange`, `timeIncrement`, `level`, `breakdowns` (optional): As for `meta_get_insights` (`datePreset` and `timeRange` are mutually exclusive)
- `dry_run` (boolean, optional): Validate without submitting

#### 11. `meta_check_report_status`

Poll an async report. Meta's `async_status` is mapped to canonical states — `"Job Completed"` → `complete`, `"Job Failed"` → `failed`; the raw string is returned as `rawStatus`.

**Parameters:**

- `reportRunId` (string, required): Report run ID from `meta_submit_report`

#### 12. `meta_download_report`

Download rows from a completed async report (bounded report-view contract).

**Parameters:**

- `reportRunId` (string, required): Report run ID
- `cursor` (string, optional): `nextCursor` from a previous call
- `includeComputedMetrics` (boolean, optional): Append `cpa`, `roas`, `cpm`, `ctr`, `cpc` columns, computed from `spend`, `impressions`, `clicks`, `actions` and `action_values`
- `mode`, `columns`, `maxRows` (optional): Bounded report-view params

### Bulk Operations

#### 13. `meta_bulk_update_status`

Batch update status for multiple Meta Ads entities.

**Parameters:**

- `entityType` (string, optional): Type of entities to update (informational only, not used in API call)
- `entityIds` (string[], required): Entity IDs to update (max 50)
- `status` (string, required): `ACTIVE`, `PAUSED`, or `ARCHIVED`

#### 14. `meta_bulk_create_entities`

Batch create multiple entities of the same type.

**Parameters:**

- `entityType` (string, required): Type of entities to create
- `adAccountId` (string, required): Ad Account ID
- `items` (array, required): Array of entity data objects (max 50)

#### 15. `meta_bulk_update_entities`

Batch update multiple entities with individual data payloads.

**Parameters:**

- `entityType` (string, optional): Type of entities being updated (informational only, not used in API call)
- `items` (array, required): Array of update items (max 50), each with `entityId` and `data`

### Targeting

#### 16. `meta_search_targeting`

Search for targeting options (interests, behaviors, demographics) by keyword.

**Parameters:**

- `type` (string, required): Search type (`adinterest`, `adinterestsuggestion`, `adgeolocation`, `adlocale`, etc.)
- `query` (string, required): Search keyword
- `targetingClass` (string, optional): Meta's `class` parameter, used with `adTargetingCategory`
- `limit` (number, optional): Max results (1-100, default 25)
- `after` (string, optional): `pagination.nextCursor` from a previous response

#### 17. `meta_get_targeting_options`

Browse available targeting categories for an ad account.

**Parameters:**

- `adAccountId` (string, required): Ad Account ID
- `type` (string, optional): Filter by targeting type (e.g., `interests`, `behaviors`)

### Specialized

#### 18. `meta_duplicate_entity`

Duplicate a campaign, ad set, or ad via `POST /{id}/copies`.

**Parameters:**

- `entityType` (string, required): Type of entity to duplicate (`campaign`, `adSet`, `ad`)
- `entityId` (string, required): ID of the entity to duplicate
- `renameOptions` (object, optional): Object with `prefix` and/or `suffix` for naming
- `statusOption` (string, optional): Status for copy (`ACTIVE`, `PAUSED`, `INHERITED_FROM_SOURCE`)

#### 19. `meta_get_delivery_estimate`

Get estimated audience size and delivery estimates for a targeting spec.

**Parameters:**

- `adAccountId` (string, required): Ad Account ID
- `targetingSpec` (object, required): Targeting specification (must include `geo_locations` or `custom_audiences`)
- `optimizationGoal` (string, optional): Optimization goal (e.g., `LINK_CLICKS`, `REACH`, `OFFSITE_CONVERSIONS`)

#### 20. `meta_get_ad_preview`

Get preview HTML for an ad in a specific format.

**Parameters:**

- `adId` (string, required): Ad ID to preview
- `adFormat` (string, required): Ad format (e.g., `DESKTOP_FEED_STANDARD`, `MOBILE_FEED_STANDARD`, `INSTAGRAM_STANDARD`)

#### 21. `meta_adjust_bids`

Batch adjust ad set bid amounts with percentage or absolute changes.

**Parameters:**

- `adAccountId` (string, required): Ad Account ID
- `adjustments` (array, required): Array of bid adjustments (max 50), each with `adSetId`, `adjustmentType` (percentage/absolute), and `value`

#### 22. `meta_validate_entity`

Client-side validation of entity payloads without making API calls.

**Parameters:**

- `entityType` (string, required): Type of entity to validate
- `mode` (string, required): Validation mode (`create` or `update`)
- `data` (object, required): Entity data to validate
- `adAccountId` (string, optional): Required for create mode
- `entityId` (string, optional): Required for update mode

#### 23. `meta_upload_image`

Download an image from a URL and upload it to the ad account's image library (`/act_{id}/adimages`). Returns the image hash for creative payloads.

**Parameters:**

- `adAccountId` (string, required): Ad Account ID
- `mediaUrl` (string, required): Publicly accessible image URL
- `name` (string, optional): Name in the media library
- `dry_run` (boolean, optional): Validate without uploading

#### 24. `meta_upload_video`

Download a video from a URL, upload it to `/act_{id}/advideos`, and poll until processing completes.

**Parameters:**

- `adAccountId` (string, required): Ad Account ID
- `mediaUrl` (string, required): Publicly accessible video URL
- `title`, `description` (string, optional): Video metadata
- `dry_run` (boolean, optional): Validate without uploading

#### 25. `meta_manage_budget_schedule`

Create or list budget schedules (high-demand periods) on a campaign via `/{campaignId}/budget_schedules`.

**Parameters:**

- `operation` (string, required): `create` or `list`
- `campaignId` (string, required): Campaign ID
- `data` (object, required for create): `budget_value` (integer), `budget_value_type` (`ABSOLUTE` or `MULTIPLIER`), `time_start` and `time_end` (Unix timestamps in seconds)
- `dry_run` (boolean, optional): Validate without creating

#### 26. `meta_get_pacing_status`

Client-side pacing calculator (no Meta API call): actual vs expected spend for a flight.

**Parameters:**

- `adAccountId`, `campaignId` (string, required)
- `spendToDate`, `budgetTotal` (number, required): In account currency
- `flightStartDate`, `flightEndDate` (string, required): `YYYY-MM-DD`
- `currency` (string, optional): Default `USD`

### Discovery

#### 27. `meta_search_tools`

Rank this server's tools against a natural-language query.

**Parameters:**

- `query` (string, required): What you want to do
- `limit` (number, optional): Max results (default 10)

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
- `META_API_BASE_URL`: Graph API base URL (default: `https://graph.facebook.com/v26.0`)
- `META_API_VERSION`: Graph API version (e.g. `v26.0`); used to build the base URL on `graph.facebook.com` when `META_API_BASE_URL` is not set. An explicit `META_API_BASE_URL` wins.
- `META_RATE_LIMIT_PER_MINUTE`: Rate limit ceiling per process (default: 20)
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
