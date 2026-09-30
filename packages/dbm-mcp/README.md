# @cesteral/dbm-mcp

DBM MCP Server - DV360 reporting through the Bid Manager API v2.

## Purpose

Read-only reporting server for Display & Video 360: delivery metrics, performance calculations, time-series data, pacing status and custom Bid Manager queries. It covers the Bid Manager API only; entity management is in `@cesteral/dv360-mcp`.

Every tool call creates a saved Bid Manager query, runs it, downloads the report and then deletes the query (best-effort). Report data lags real time by hours, and money is in the advertiser currency.

## Features

- **Per-session Google auth** via `GoogleAuthAdapter` with `X-Google-*` request headers (`X-Google-Auth-Type`, `X-Google-Credentials`, or `X-Google-Client-Id` / `X-Google-Client-Secret` / `X-Google-Refresh-Token`)
- **Streamable HTTP + stdio transports** via Hono + `@hono/mcp`
- **OpenTelemetry** instrumentation for traces and metrics
- **Rate limiting** via shared `RateLimiter` class
- **Structured logging** via Pino
- **Read-only reporting** -- no entity mutation; the saved query each call creates is deleted afterwards (best-effort)

## MCP Tools

### 1. `dbm_get_campaign_delivery`

Fetch delivery metrics (impressions, clicks, spend, conversions, revenue) for a campaign within a date range.

**Parameters:**

- `advertiserId` (string): DV360 Advertiser ID
- `campaignId` (string): Campaign ID
- `startDate` (string): Start date (YYYY-MM-DD)
- `endDate` (string): End date (YYYY-MM-DD), not before `startDate`

### 2. `dbm_get_performance_metrics`

Calculate performance KPIs (CPM, CTR, CPC, CPA, ROAS) from delivery data.

**Parameters:**

- `advertiserId` (string): DV360 Advertiser ID
- `campaignId` (string): Campaign ID
- `startDate` (string): Start date (YYYY-MM-DD)
- `endDate` (string): End date (YYYY-MM-DD)

### 3. `dbm_get_historical_metrics`

Fetch time-series historical metrics for trend analysis.

**Parameters:**

- `advertiserId` (string): DV360 Advertiser ID
- `campaignId` (string): Campaign ID
- `startDate` (string): Start date (YYYY-MM-DD)
- `endDate` (string): End date (YYYY-MM-DD)
- `granularity` (string, optional): `daily`, `weekly` or `monthly` (default: `daily`)

### 4. `dbm_get_pacing_status`

Pacing status for a campaign (actual vs expected delivery) from Bid Manager report data.

**Parameters:**

- `advertiserId` (string): DV360 Advertiser ID
- `campaignId` (string): Campaign ID
- `budgetTotal` (number): Total campaign budget in advertiser currency
- `flightStartDate` / `flightEndDate` (string): Flight dates (YYYY-MM-DD); a flight that has not started is refused
- `currency` (string, optional): Currency code printed with amounts (default: `USD`)

### 5. `dbm_run_custom_query`

Compose and execute a custom Bid Manager report with specified metrics, group-bys and filters.

**Parameters:**

- `reportType` (string, default `STANDARD`): Report type (see `report-types://all`)
- `groupBys` (string[]): `FILTER_*` dimensions to group by
- `metrics` (string[]): `METRIC_*` metrics to include
- `filters` (object[], optional): `{ type, value }` filter conditions (e.g. `FILTER_ADVERTISER`)
- `dateRange` (object): `{ preset }` (e.g. `LAST_7_DAYS`) or `{ startDate, endDate }`
- `strictValidation` (boolean, default `true`): reject report types, filters and metrics missing from the bundled catalogue
- `mode`, `columns`, `offset`, `maxRows` (optional): Bounded report-view params — `mode` is `"summary"` (default — headers + counts + 10-row preview) or `"rows"` (paginated rows page); `columns` projects to selected columns; `offset` paginates; `maxRows` caps page size (default 10/50; hard cap 200).

### 6. `dbm_run_custom_query_async`

Submit a custom Bid Manager report without waiting for completion (non-blocking). Uses MCP Tasks to return a task handle immediately; clients call it task-augmented (MCP 2025-11-25 tasks), poll via `tasks/get` and retrieve results via `tasks/result`. Tasks live in memory on the instance holding the session, so on a scaled-out HTTP deploy a poll that lands on another instance finds no task.

**Parameters:** Same as `dbm_run_custom_query` (including the bounded report-view params).

## Authentication Modes

| Mode                       | Header                        | Description                                     |
| -------------------------- | ----------------------------- | ----------------------------------------------- |
| `google-headers` (default) | `X-Google-*`                  | Google OAuth2 credentials via request headers   |
| `jwt`                      | `Authorization: Bearer <JWT>` | JWT token authentication for hosted deployments |
| `none`                     | —                             | No authentication (development only)            |

Set via `MCP_AUTH_MODE` environment variable.

## Context Efficiency Notes

- Tools with `outputSchema` provide full typed payloads in `structuredContent`; text output is intentionally summary-focused.
- Use scoped resources when possible to reduce context size:
  - `metric-types://category/{slug}`
  - `filter-types://category/{slug}`
- Full catalogs remain available at `metric-types://all` and `filter-types://all`.

## Architecture

### Key Components

- **`BidManagerService`** - Core service for Bid Manager API v2: query creation, execution, polling, and CSV report parsing
- **`BidManagerClient`** - googleapis-based client for the Bid Manager API v2
- **`auth-bridge.ts`** - Adapts shared `GoogleAuthAdapter` to the googleapis `OAuth2Client` shape
- **`SessionServiceStore`** - Per-session service instances keyed by session ID
- **`report-parser.ts`** - CSV-to-JSON parser for Bid Manager report results

### Transport

- **Streamable HTTP**: MCP protocol via Streamable HTTP transport at `/mcp`
- **Health check**: `/health` endpoint

### Key Gotchas

- Reports are async: create query → run query → poll status → fetch results
- Report results are CSV-formatted; the server parses them into structured JSON
- `advertiserId` is required by every tool except `dbm_run_custom_query`, which filters through `filters`
- Rate limits apply per Google Cloud project, not per advertiser
- Read-only server — no entity mutation; use `dv360-mcp` for write operations

### Data Sources

- Bid Manager API v2: DV360 reporting queries

### Current Status

**Phase: Production-Ready**

The reporting and query tools are fully implemented using Bid Manager API v2 for
DV360 reporting. Entity retrieval is handled by the separate
`@cesteral/dv360-mcp` server.

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

# Lint
pnpm run lint
```

## Environment Variables

See root `.env.example` for all required variables:

- `DBM_MCP_PORT`: Server port (default: 3001)
- `DBM_MCP_HOST`: Server host (default: `127.0.0.1`, or `0.0.0.0` when `NODE_ENV=production`; `MCP_HTTP_HOST` overrides)
- `GCP_PROJECT_ID`: Google Cloud project ID

## Testing with MCP Inspector

```bash
# Start the server
pnpm run dev:http

# In another terminal, use MCP Inspector
npx @modelcontextprotocol/inspector http://localhost:3001/mcp
```

## API Endpoints

- `GET /health` - Health check
- `POST /mcp` - MCP protocol via Streamable HTTP transport

## Contributing

See root [CLAUDE.md](../../CLAUDE.md) for development guidelines, build system details, and monorepo conventions. See the [root README](../../README.md) for full architecture context.

---

## Get Started

**Self-host**: Follow the [deployment guide](../../docs/guides/deployment-instructions.md) to run this server on your own infrastructure.

**Cesteral Intelligence**: [Request access](https://cesteral.com/integrations/bid-manager?utm_source=github&utm_medium=package-readme&utm_campaign=dbm-mcp) -- governed execution with credential brokering, approvals, audit, and multi-tenant access.

**Book a workflow demo**: [See it in action](mailto:sales@cesteral.com?subject=Workflow%20demo%20-%20Bid%20Manager%20MCP) with your own ad accounts.

**Compare options**: [OSS connectors vs Cesteral Intelligence](https://cesteral.com/compare?utm_source=github&utm_medium=package-readme&utm_campaign=dbm-mcp)

## License

Apache License 2.0 — see [LICENSE](../../LICENSE.md) for details. This package is part of Cesteral's open-source connector layer; managed hosting and higher-level governance features live outside this repository.
