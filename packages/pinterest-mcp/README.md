# @cesteral/pinterest-mcp

Pinterest Ads MCP Server - Campaign management and reporting via Pinterest Ads API v5.

## Purpose

Management and reporting server for Pinterest Ads (Marketing API v5). Designed
for AI agents to manage Pinterest ad accounts through the Model Context
Protocol with per-session credentials.

Request and response shapes follow Pinterest's published OpenAPI description
(v5.28.0, vendored as `src/generated/types.ts`). No tool has been exercised
against a live account, so every governed tool is at `declared` verification.

## Features

- **Per-session auth** via `PinterestBearerAuthStrategy`: a Bearer access token, or app credentials plus a refresh token (`X-Pinterest-App-Id` / `X-Pinterest-App-Secret` / `X-Pinterest-Refresh-Token`), always with `X-Pinterest-Advertiser-Id` naming the ad account
- **Streamable HTTP + stdio transports** via Hono + `@hono/mcp`
- **OpenTelemetry** instrumentation for traces and metrics
- **Rate limiting** via the shared `RateLimiter` (default 10/min per process; writes draw more than reads). Buckets are per Pinterest user (the token's `/v5/user_account` id): one for the ad account's calls (Pins and media included), one for reporting and one for the rest, so one tenant's traffic never queues another's
- **Structured logging** via Pino
- The ad account is part of every URL path (`/v5/ad_accounts/{ad_account_id}/…`); nothing is injected into request bodies

## MCP Tools

24 tools. Money is integer **micro-currency** (1,000,000 = 1.00 of the account currency) except where a tool says otherwise; times are Unix seconds; `targeting_spec` keys are UPPERCASE.

### Core CRUD

| Tool                         | Description                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| `pinterest_list_entities`    | List campaigns, ad groups, ads or creatives (Pins); cursor pagination via `bookmark`        |
| `pinterest_get_entity`       | Get one entity by ID (GET-by-id endpoints)                                                  |
| `pinterest_create_entity`    | Create an entity (campaigns, ad groups and ads are batch POSTs with per-item `exceptions`)  |
| `pinterest_update_entity`    | Update an entity (batch PATCH)                                                              |
| `pinterest_delete_entity`    | Campaigns, ad groups and ads are **archived** (v5 has no DELETE for them); Pins are deleted |
| `pinterest_list_ad_accounts` | List the ad accounts the token can see                                                      |

### Reporting

| Tool                              | Description                                                                      |
| --------------------------------- | -------------------------------------------------------------------------------- |
| `pinterest_get_report`            | Submit an async report, poll and download it (blocking)                          |
| `pinterest_get_report_breakdowns` | As above, with `targeting_types` breakdowns (level `*_TARGETING`)                |
| `pinterest_submit_report`         | Submit an async report (`level`, `columns`, `granularity`, `report_format: CSV`) |
| `pinterest_check_report_status`   | Check a report token's status                                                    |
| `pinterest_download_report`       | Download and parse a finished report                                             |

A report covers at most 186 days (3 days at `HOUR` granularity); longer ranges are refused before anything is submitted.

### Bulk operations and bids

| Tool                             | Description                                                   |
| -------------------------------- | ------------------------------------------------------------- |
| `pinterest_bulk_create_entities` | Create many entities                                          |
| `pinterest_bulk_update_entities` | Update many entities                                          |
| `pinterest_bulk_update_status`   | Set `ACTIVE`, `PAUSED` or `ARCHIVED` (one PATCH per id)       |
| `pinterest_adjust_bids`          | Set ad-group bids; input in currency units, written as micros |

### Targeting, previews and media

| Tool                              | Description                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `pinterest_search_targeting`      | Search targeting values                                                       |
| `pinterest_get_targeting_options` | `GET /v5/resources/targeting/{targeting_type}`                                |
| `pinterest_get_delivery_estimate` | Audience sizing for a targeting spec                                          |
| `pinterest_get_ad_preview`        | `POST /v5/ad_accounts/{id}/ad_previews` (needs `ads:write`)                   |
| `pinterest_duplicate_entity`      | Copy a campaign (read + create; always created `PAUSED`; children not copied) |
| `pinterest_upload_video`          | Register via `POST /v5/media`, upload to S3, poll `Media.status`              |

### Client-side helpers

| Tool                          | Description                                               |
| ----------------------------- | --------------------------------------------------------- |
| `pinterest_validate_entity`   | Validate a payload against the v5 required fields         |
| `pinterest_get_pacing_status` | Pacing calculator (no API call)                           |
| `pinterest_search_tools`      | Rank this server's tools against a natural-language query |

Pinterest's `/v5/media` endpoint accepts only `media_type: "video"`, so there is no image upload tool: image Pins reference an image URL directly.

## Supported Entity Types

| Entity Type | API Object | Notes                                                        |
| ----------- | ---------- | ------------------------------------------------------------ |
| `campaign`  | Campaign   | Required on create: `name`, `objective_type`                 |
| `adGroup`   | Ad Group   | Required on create: `name`, `campaign_id`, `billable_event`  |
| `ad`        | Ad         | Required on create: `ad_group_id`, `creative_type`, `pin_id` |
| `creative`  | Pin        | `POST /v5/pins`; the ad references it by `pin_id`            |

**Entity Hierarchy:** Ad Account > Campaign > Ad Group > Ad (> Pin)

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

# Regenerate src/generated/types.ts from Pinterest's OpenAPI description
pnpm run generate
```

## Environment Variables

- `PINTEREST_MCP_PORT`: Server port (default: 3011)
- `PINTEREST_MCP_HOST`: Server host (default: `127.0.0.1` in development, `0.0.0.0` in production)
- `MCP_AUTH_MODE`: Authentication mode - `pinterest-bearer` (default), `jwt`, or `none`
- `MCP_AUTH_SECRET_KEY`: Required when `MCP_AUTH_MODE=jwt`
- `PINTEREST_API_BASE_URL`: API base URL (default: `https://api.pinterest.com`; paths carry `/v5`)
- `PINTEREST_API_VERSION`: Parsed but not used to build paths, which are fixed at `/v5`
- `PINTEREST_RATE_LIMIT_PER_MINUTE`: Rate limit ceiling (default: 10)
- `PINTEREST_ACCESS_TOKEN`: Access token for stdio mode
- `PINTEREST_AD_ACCOUNT_ID`: Ad account ID for stdio mode
- `PINTEREST_REPORT_POLL_INTERVAL_MS` / `PINTEREST_REPORT_MAX_POLL_ATTEMPTS`: Report polling (defaults 2000 / 30)
- `PINTEREST_VIDEO_UPLOAD_POLL_INTERVAL_MS` / `PINTEREST_VIDEO_UPLOAD_MAX_POLL_ATTEMPTS`: Video processing polling (defaults 20000 / 30)

## Architecture

### Key Components

- **`PinterestHttpClient`** - HTTP client for the Pinterest Marketing API v5
- **`PinterestService`** - CRUD, bulk ops, duplication, targeting, audience sizing, ad previews
- **`PinterestReportingService`** - Async report submission, polling, and download
- **`PinterestBearerAuthStrategy`** - Access-token or refresh-token auth plus the ad account header
- **`PinterestAuthAdapter`** - Token + ad account management for per-session API calls
- **`SessionServiceStore`** - Per-session service instances keyed by session ID

### Key Gotchas

- Cursor pagination: pass the previous response's `bookmark`; an empty or null bookmark means the last page
- Batch create/update answer HTTP 200 even when items fail; per-item `exceptions` are reported as failures
- Campaigns, ad groups and ads cannot be deleted in v5; `pinterest_delete_entity` archives them (irreversible)
- Status values are `ACTIVE`, `PAUSED` and `ARCHIVED`

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
