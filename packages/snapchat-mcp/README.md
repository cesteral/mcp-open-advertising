# @cesteral/snapchat-mcp

Snapchat Ads MCP Server - Campaign management and reporting via Snapchat Ads API v1.

## Purpose

Management server for Snapchat Ads. Provides full CRUD operations, async
reporting, targeting discovery, bulk operations, and specialized features like
audience estimation and ad previews. Designed for AI agents to manage
Snapchat Ads campaigns programmatically through the Model Context Protocol with
per-session Bearer token authentication.

## Features

- **Per-session Bearer token auth** via `SnapchatBearerAuthStrategy` (static access token, or app ID/secret + refresh token with automatic refresh)
- **Streamable HTTP + stdio transports** via Hono + `@hono/mcp`
- **OpenTelemetry** instrumentation for traces and metrics
- **Rate limiting** via shared `RateLimiter` class (`SNAPCHAT_RATE_LIMIT_PER_MINUTE`, default 10/min per process)
- **Structured logging** via Pino
- **Parent-ID injection on create**: `ad_account_id` (campaign, creative), `campaign_id` (ad squad) and `ad_squad_id` (ad) are filled into the request body from the tool's top-level params
- **Single-account sessions**: every tool asserts its `adAccountId`, and entity-ID operations refuse an entity that belongs to a different ad account

## MCP Tools

25 tools: 24 Snapchat tools plus the generated `snapchat_search_tools` discovery tool.
Every tool except `snapchat_list_ad_accounts`, `snapchat_search_targeting`,
`snapchat_get_targeting_options`, `snapchat_get_ad_preview`, `snapchat_download_report`,
`snapchat_validate_entity` and `snapchat_search_tools` takes a required `adAccountId`, which must
equal the session's ad account. Writes accept `dry_run: true`.

### Core CRUD

| Tool                        | Purpose                                                                         | Key parameters                                                   |
| --------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `snapchat_list_entities`    | List campaigns, ad squads, ads or creatives (cursor pagination via `next_link`) | `entityType`, `campaignId` (adGroup), `adSquadId` (ad), `cursor` |
| `snapchat_get_entity`       | Get one entity by ID                                                            | `entityType`, `entityId`                                         |
| `snapchat_create_entity`    | Create one entity                                                               | `entityType`, `data`, `campaignId` (adGroup), `adSquadId` (ad)   |
| `snapchat_update_entity`    | Read-merge-PUT update of one entity                                             | `entityType`, `entityId`, `data`, `campaignId`/`adSquadId`       |
| `snapchat_delete_entity`    | Delete up to 20 entities (one `DELETE` per ID, irreversible)                    | `entityType`, `entityIds`                                        |
| `snapchat_duplicate_entity` | Copy a campaign (read + create)                                                 | `entityType` (`campaign`), `entityId`, `options`                 |

### Account

| Tool                        | Purpose                                                                             | Key parameters    |
| --------------------------- | ----------------------------------------------------------------------------------- | ----------------- |
| `snapchat_list_ad_accounts` | List the organization's ad accounts (needs `X-Snapchat-Org-Id` / `SNAPCHAT_ORG_ID`) | `cursor`, `limit` |

### Reporting

> All Snapchat reporting tools return data using the shared bounded report-view contract: `mode` (`"summary"` default — headers + counts + 10-row preview, or `"rows"` for a paginated rows page), `columns` (project to selected columns), `offset` (zero-based pagination), and `maxRows` (page size; default 10 for summary, 50 for rows; hard cap 200).
>
> `spend` is micro-currency (1,000,000 = 1.00 of the account currency). With `includeComputedMetrics`, `snapchat_get_report` and `snapchat_get_report_breakdowns` convert it before computing CPA/CPM/CPC/ROAS.

| Tool                             | Purpose                                            | Key parameters                                                                                                                                                           |
| -------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `snapchat_get_report`            | Submit, poll and download an async stats report    | `fields`, `datePreset` or `startTime`+`endTime`, `granularity` (`TOTAL`/`DAY`/`HOUR`/`LIFETIME`), `dimensionType` (`CAMPAIGN`/`AD_SQUAD`/`AD`), `includeComputedMetrics` |
| `snapchat_get_report_breakdowns` | Same, with extra `breakdowns` appended to `fields` | as above + `breakdowns`                                                                                                                                                  |
| `snapchat_submit_report`         | Submit without waiting                             | `fields`, dates, `granularity`, `dimensionType`                                                                                                                          |
| `snapchat_check_report_status`   | One status check                                   | `taskId`                                                                                                                                                                 |
| `snapchat_download_report`       | Download and parse a finished report CSV           | `downloadUrl`, `storeRawCsv`                                                                                                                                             |

Known gaps (unverified — Snapchat's docs host is unreachable from this repo): `datePreset` resolves to UTC day
bounds, while Snapchat is reported to require ad-account-timezone boundaries for `DAY` granularity; and
demographic/geo breakdowns are sent inside `fields` rather than Snapchat's `report_dimension` parameter.

### Bulk Operations and Bids

| Tool                            | Purpose                                                                     | Key parameters                                                         |
| ------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `snapchat_bulk_update_status`   | Set `ACTIVE` or `PAUSED` on up to 20 entities                               | `entityType`, `entityIds`, `operationStatus`, `campaignId`/`adSquadId` |
| `snapchat_bulk_create_entities` | Create up to 50 entities in one POST                                        | `entityType`, `items`, `campaignId`/`adSquadId`                        |
| `snapchat_bulk_update_entities` | Update up to 50 entities in one PUT                                         | `entityType`, `items[{entityId, data}]`, `campaignId`/`adSquadId`      |
| `snapchat_adjust_bids`          | Read-modify-write of ad squad `bid_micro` (price given in account currency) | `adjustments[{adGroupId, bidPrice}]`                                   |

### Targeting, Audience and Preview

| Tool                             | Purpose                                                    | Key parameters                                    |
| -------------------------------- | ---------------------------------------------------------- | ------------------------------------------------- |
| `snapchat_search_targeting`      | Keyword search over a targeting list (scans up to 5 pages) | `targetingType`, `countryCode`, `query`, `limit`  |
| `snapchat_get_targeting_options` | Browse a targeting endpoint page by page                   | `targetingType`, `countryCode`, `limit`, `cursor` |
| `snapchat_get_audience_estimate` | Audience size via `audience_size_v2`                       | `targetingConfig`                                 |
| `snapchat_get_ad_preview`        | Creative preview link                                      | `creativeId`                                      |

### Media

| Tool                    | Purpose                                                | Key parameters     |
| ----------------------- | ------------------------------------------------------ | ------------------ |
| `snapchat_upload_image` | Upload an image from a public URL to the media library | `mediaUrl`, `name` |
| `snapchat_upload_video` | Upload a video from a public URL to the media library  | `mediaUrl`, `name` |

### Client-side and Discovery

| Tool                         | Purpose                                                                  | Key parameters                                                                 |
| ---------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `snapchat_validate_entity`   | Validate an entity payload without calling the API                       | `entityType`, `mode` (`create`/`update`), `data`                               |
| `snapchat_get_pacing_status` | Pacing from caller-supplied spend, budget and flight dates (no API call) | `campaignId`, `spendToDate`, `budgetTotal`, `flightStartDate`, `flightEndDate` |
| `snapchat_search_tools`      | Rank this server's tools for a natural-language query                    | `query`, `limit`                                                               |

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

- `SNAPCHAT_MCP_PORT`: Server port (default: 3009)
- `SNAPCHAT_MCP_HOST`: Server host (default: `127.0.0.1` in development, `0.0.0.0` in production)
- `MCP_AUTH_MODE`: Authentication mode - `snapchat-bearer` (default), `jwt`, or `none`
- `MCP_AUTH_SECRET_KEY`: Required when `MCP_AUTH_MODE=jwt`
- `SNAPCHAT_API_BASE_URL`: Snapchat Ads API base URL (default: `https://adsapi.snapchat.com`; all paths are `/v1/...`)
- `SNAPCHAT_RATE_LIMIT_PER_MINUTE`: Per-process rate limit ceiling (default: 10)
- `SNAPCHAT_AD_ACCOUNT_ID`: Ad account ID for stdio mode (and `none`/`jwt` env-credential sessions)
- `SNAPCHAT_ORG_ID`: Organization ID, required by `snapchat_list_ad_accounts`
- `SNAPCHAT_APP_ID`, `SNAPCHAT_APP_SECRET`, `SNAPCHAT_REFRESH_TOKEN`: Refresh-token flow; preferred over a static token when all three are set
- `SNAPCHAT_ACCESS_TOKEN`: Static access token (fallback; stops working when it expires)
- `SNAPCHAT_REPORT_POLL_INTERVAL_MS`, `SNAPCHAT_REPORT_MAX_POLL_ATTEMPTS`: Report polling

## Architecture

### Key Components

- **`SnapchatHttpClient`** - HTTP client for Snapchat Ads API v1
- **`SnapchatService`** - CRUD, bulk ops, targeting, audience estimates, ad previews
- **`SnapchatReportingService`** - Async report submission, polling, and download
- **`SnapchatBearerAuthStrategy`** - Bearer token (or refresh-token headers) + ad account ID auth
- **`SnapchatAuthAdapter`** - Token + ad account ID management for per-session API calls
- **`SessionServiceStore`** - Per-session service instances keyed by session ID

### Key Gotchas

- The ad account is in URL paths (`/v1/adaccounts/{id}/...`); entity-ID routes (`/v1/campaigns/{id}`, `/v1/adsquads/{id}`, …) carry none, so the service checks each fetched entity's account (walking ad → ad squad → campaign when needed) against the session's
- Create injects the parent ID into the body (`ad_account_id` / `campaign_id` / `ad_squad_id`); a conflicting value in `data` is refused
- Cursor-based pagination: `paging.next_link` is returned as the cursor and followed verbatim
- Reporting is async: submit report -> poll for completion -> download results
- Status values are `ACTIVE` and `PAUSED`; deletion is a separate, irreversible tool (max 20 IDs per call)
- Money fields are micro-currency (`daily_budget_micro`, `bid_micro`, report `spend`)

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
