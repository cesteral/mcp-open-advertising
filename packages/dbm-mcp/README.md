# @cesteral/dbm-mcp

DBM MCP Server - Generic cross-platform reporting and metrics server.

## Purpose

Read-only reporting server that provides delivery metrics, performance calculations, time-series data, and pacing status. Platform-agnostic design supports DV360, Google Ads, Meta, The Trade Desk, and Amazon DSP.

## Features

- **Per-session Google auth** via `GoogleAuthAdapter` with `X-DV360-*` request headers
- **Streamable HTTP + stdio transports** via Hono + `@hono/mcp`
- **OpenTelemetry** instrumentation for traces and metrics
- **Rate limiting** via shared `RateLimiter` class
- **Structured logging** via Pino
- **Read-only reporting** -- no write operations, no entity mutation

## MCP Tools

### 1. `get_campaign_delivery`
Fetch delivery metrics (impressions, clicks, spend, conversions) for a campaign within a date range.

**Parameters:**
- `campaignId` (string): Campaign ID
- `advertiserId` (string): DV360 Advertiser ID
- `startDate` (string): Start date (YYYY-MM-DD)
- `endDate` (string): End date (YYYY-MM-DD)

### 2. `get_performance_metrics`
Calculate performance KPIs (CPM, CTR, CPA, ROAS) from delivery data.

**Parameters:**
- `campaignId` (string): Campaign ID
- `startDate` (string): Start date (YYYY-MM-DD)
- `endDate` (string): End date (YYYY-MM-DD)

### 3. `get_historical_metrics`
Fetch time-series historical metrics for trend analysis.

**Parameters:**
- `campaignId` (string): Campaign ID
- `startDate` (string): Start date (YYYY-MM-DD)
- `endDate` (string): End date (YYYY-MM-DD)
- `granularity` (string, optional): "daily" or "hourly" (default: "daily")

### 4. `get_pacing_status`
Get real-time pacing status for a campaign (actual vs expected delivery).

**Parameters:**
- `campaignId` (string): Campaign ID

### 5. `run_custom_query`
Compose and execute a custom Bid Manager report with specified metrics, dimensions, and filters.

**Parameters:**
- `reportType` (string): Report type
- `timeRange` (object): Time range for the report
- `metrics` (string[]): Metrics to include
- `dimensions` (string[]): Dimensions for grouping
- `filters` (object[], optional): Filter conditions
- `advertiserId` (string): DV360 Advertiser ID

## Authentication Modes

| Mode | Header | Description |
|------|--------|-------------|
| `google-headers` (default) | `X-DV360-*` | Google OAuth2 credentials via request headers |
| `jwt` | `Authorization: Bearer <JWT>` | JWT token authentication for hosted deployments |
| `none` | — | No authentication (development only) |

Set via `MCP_AUTH_MODE` environment variable.

## Context Efficiency Notes

- Tools with `outputSchema` provide full typed payloads in `structuredContent`; text output is intentionally summary-focused.
- Use scoped resources when possible to reduce context size:
  - `metric-types://category/{slug}`
  - `filter-types://category/{slug}`
- Full catalogs remain available at `metric-types://all` and `filter-types://all`.

## Architecture

### Transport
- **Streamable HTTP**: MCP protocol via Streamable HTTP transport at `/mcp`
- **Health check**: `/health` endpoint

### Key Gotchas

- Reports are async: create query → run query → poll status → fetch results
- Report results are CSV-formatted; the server parses them into structured JSON
- `advertiserId` is required for all reporting tools
- Rate limits apply per Google Cloud project, not per advertiser
- Read-only server — no entity mutation; use `dv360-mcp` for write operations

### Data Sources
- Bid Manager API v2: DV360 reporting queries

### Current Status
**Phase: Production-Ready**

All tools are fully implemented using Bid Manager API v2 for DV360 reporting. Entity retrieval is handled by the separate `@cesteral/dv360-mcp` server.

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
- `DBM_MCP_HOST`: Server host (default: 0.0.0.0)
- `GCP_PROJECT_ID`: Google Cloud project ID
- `BIGQUERY_DATASET_ID`: BigQuery dataset name

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

## License

Business Source License 1.1 — see [LICENSE](../../LICENSE) for details.
