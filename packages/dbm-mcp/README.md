# @bidshifter/dbm-mcp

DBM MCP Server - Generic cross-platform reporting and metrics server.

## Purpose

Read-only reporting server that provides delivery metrics, performance calculations, time-series data, and pacing status. Platform-agnostic design supports DV360, Google Ads, Meta, The Trade Desk, and Amazon DSP.

## MCP Tools

### 1. `get_campaign_delivery`
Fetch delivery metrics (impressions, clicks, spend, conversions) for a campaign within a date range.

**Parameters:**
- `campaignId` (string): Campaign ID
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

### 4. `get_platform_entities`
Fetch campaign hierarchy (advertisers → campaigns → line items) for a platform.

**Parameters:**
- `advertiserId` (string): Advertiser ID
- `platform` (string, optional): "dv360" | "google_ads" | "meta" | "ttd" | "amazon" (default: "dv360")

### 5. `get_pacing_status`
Get real-time pacing status for a campaign (actual vs expected delivery).

**Parameters:**
- `campaignId` (string): Campaign ID

## Architecture

### Transport
- **HTTP/SSE**: MCP protocol over Server-Sent Events at `/sse`
- **Health check**: `/health` endpoint

### Data Sources
- BigQuery: Normalized delivery metrics (to be implemented)

### Current Status
**Phase: Scaffolding**

All tools return stub/mock data. Actual implementations pending:
- BigQuery integration for delivery metrics
- Platform-specific data normalization

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
npx @modelcontextprotocol/inspector http://localhost:3001/sse
```

## API Endpoints

- `GET /health` - Health check
- `GET /sse` - MCP protocol via Server-Sent Events
- `POST /message` - Not implemented (use SSE)
