# @cesteral/sa360-mcp

**Search Ads 360 MCP Server** — Cross-engine unified reporting and offline conversion upload via SA360 Reporting API v0 and legacy v2 API.

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](../../LICENSE.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-2024--11--05-green)](https://modelcontextprotocol.io/)

---

## Overview

SA360 (Search Ads 360) sits above Google Ads, Microsoft Ads, Yahoo Japan, and Baidu, providing cross-engine unified reporting and automated bidding. This MCP server exposes SA360's capabilities through 16 tools:

- **8 read-only tools** for cross-engine reporting, entity browsing, field discovery, and custom columns
- **3 async reporting tools** for the submit → poll → download report workflow via the v2 API
- **2 write tools** for offline conversion upload and modification via the legacy v2 API
- **1 validation tool** for pre-flight conversion payload checks
- **1 audit tool** for entity change history tracking
- **1 query tool** for flexible cross-engine search

The SA360 API is **read-only for campaign entities** — there are no mutate/CRUD operations for campaigns, ad groups, or ads. Write capabilities are limited to offline conversion management and async reporting.

### APIs Used

| API | Base URL | Capabilities |
|-----|----------|-------------|
| SA360 Reporting API v0 | `https://searchads360.googleapis.com/v0` | Read-only queries (SQL-like, mirrors GAQL syntax) |
| SA360 v2 (DoubleClick Search) | `https://www.googleapis.com/doubleclicksearch/v2` | Conversion insert/update, async reporting |

---

## Quick Start

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 8.0.0
- Google OAuth2 credentials with `https://www.googleapis.com/auth/doubleclicksearch` scope

### 1. Install & Build

```bash
# From repository root
pnpm install
pnpm run build
```

### 2. Configure Environment

```bash
cp packages/sa360-mcp/.env.example packages/sa360-mcp/.env
```

Edit `.env` with your credentials:

```env
SA360_MCP_PORT=3010
MCP_AUTH_MODE=sa360-headers

# For stdio mode (Claude Desktop, MCP Inspector)
SA360_CLIENT_ID=your-client-id
SA360_CLIENT_SECRET=your-client-secret
SA360_REFRESH_TOKEN=your-refresh-token
# SA360_LOGIN_CUSTOMER_ID=your-mcc-customer-id  # Optional, for manager accounts
```

### 3. Run Locally

```bash
# HTTP mode (port 3010)
./scripts/dev-server.sh sa360-mcp

# Or directly
cd packages/sa360-mcp && pnpm run dev:http
```

### 4. Verify

```bash
# Health check
curl http://localhost:3010/health

# List tools
curl -X POST http://localhost:3010/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

---

## Authentication

SA360 uses OAuth2 refresh token authentication. Unlike Google Ads, **no developer token** is required.

### HTTP Mode (sa360-headers)

Pass credentials via HTTP headers on each request:

| Header | Required | Description |
|--------|----------|-------------|
| `X-SA360-Client-Id` | Yes | OAuth2 client ID |
| `X-SA360-Client-Secret` | Yes | OAuth2 client secret |
| `X-SA360-Refresh-Token` | Yes | OAuth2 refresh token |
| `X-SA360-Login-Customer-Id` | No | Manager account ID (for MCC access) |

### Stdio Mode

Set environment variables for stdio transport (Claude Desktop, MCP Inspector):

```env
SA360_CLIENT_ID=your-client-id
SA360_CLIENT_SECRET=your-client-secret
SA360_REFRESH_TOKEN=your-refresh-token
SA360_LOGIN_CUSTOMER_ID=your-mcc-customer-id  # Optional
```

### JWT Mode

For managed deployments with centralized auth:

```env
MCP_AUTH_MODE=jwt
MCP_AUTH_SECRET_KEY=your-jwt-secret
```

### Getting OAuth2 Credentials

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the **Search Ads 360 API** and **DoubleClick Search API**
3. Create OAuth2 credentials (Desktop application type)
4. Generate a refresh token with scope `https://www.googleapis.com/auth/doubleclicksearch`

---

## Tools Reference

### Reporting API v0 Tools (Read-Only)

#### `sa360_search`
Execute raw SA360 query language queries against any SA360 resource. Same syntax as GAQL (Google Ads Query Language).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `customerId` | string | Yes | SA360 customer ID (no dashes) |
| `query` | string | Yes | SA360 query (SELECT ... FROM ... WHERE ...) |
| `pageSize` | number | No | Results per page (default 1000, max 10000) |
| `pageToken` | string | No | Pagination token from previous response |

```json
{
  "customerId": "1234567890",
  "query": "SELECT campaign.id, campaign.name, campaign.engine_id, metrics.impressions, metrics.clicks, metrics.cost_micros FROM campaign WHERE segments.date DURING LAST_30_DAYS ORDER BY metrics.impressions DESC LIMIT 50"
}
```

#### `sa360_list_accounts`
List all SA360 customer accounts accessible to the authenticated user.

No parameters required.

#### `sa360_list_entities`
List SA360 entities with optional query filters and pagination.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `entityType` | enum | Yes | Entity type (see supported types below) |
| `customerId` | string | Yes | SA360 customer ID |
| `filters` | object | No | Field:value filter conditions |
| `pageSize` | number | No | Results per page (default 100) |
| `pageToken` | string | No | Pagination token |
| `orderBy` | string | No | ORDER BY clause |

**Supported entity types:** `customer`, `campaign`, `adGroup`, `adGroupAd`, `adGroupCriterion`, `campaignCriterion`, `biddingStrategy`, `conversionAction`

#### `sa360_get_entity`
Get a single entity by type and ID.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `entityType` | enum | Yes | Entity type |
| `customerId` | string | Yes | SA360 customer ID |
| `entityId` | string | Yes | Entity ID to retrieve |

#### `sa360_get_insights`
Performance metrics with preset or custom date ranges. Convenience wrapper that builds queries from simple parameters.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `customerId` | string | Yes | SA360 customer ID |
| `entityType` | enum | Yes | customer, campaign, adGroup, adGroupAd, adGroupCriterion, or campaignCriterion |
| `entityId` | string | No | Filter to specific entity |
| `dateRange` | enum | No* | TODAY, YESTERDAY, LAST_7_DAYS, LAST_30_DAYS, THIS_MONTH, LAST_MONTH, LAST_90_DAYS |
| `startDate` | string | No* | Custom start date (YYYY-MM-DD) |
| `endDate` | string | No* | Custom end date (YYYY-MM-DD) |
| `metrics` | string[] | No | Custom metrics (defaults: impressions, clicks, cost_micros, conversions, ctr, average_cpc) |
| `includeComputedMetrics` | boolean | No | Add derived CPA, ROAS, CPM (default false) |
| `limit` | number | No | Max results (default 50) |

*Provide either `dateRange` OR both `startDate` + `endDate`.

#### `sa360_get_insights_breakdowns`
Performance metrics with dimensional breakdowns (device, date, network, etc.).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `customerId` | string | Yes | SA360 customer ID |
| `entityType` | enum | Yes | customer, campaign, adGroup, adGroupAd, adGroupCriterion, or campaignCriterion |
| `entityId` | string | No | Filter to specific entity |
| `dateRange` | enum | No* | Date range preset |
| `startDate` | string | No* | Custom start date (YYYY-MM-DD) |
| `endDate` | string | No* | Custom end date (YYYY-MM-DD) |
| `breakdowns` | string[] | Yes | Segment dimensions (e.g., `segments.date`, `segments.device`) |
| `metrics` | string[] | No | Custom metrics |
| `includeComputedMetrics` | boolean | No | Add derived CPA, ROAS, CPM (default false) |
| `limit` | number | No | Max results (default 100) |

*Provide either `dateRange` OR both `startDate` + `endDate`.

**Supported breakdowns:** `segments.date`, `segments.device`, `segments.ad_network_type`, `segments.conversion_action`, `segments.day_of_week`, `segments.month`, `segments.quarter`, `segments.week`, `segments.year`

#### `sa360_list_custom_columns`
List custom columns defined for an SA360 customer account.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `customerId` | string | Yes | SA360 customer ID |

#### `sa360_search_fields`
Discover available fields, resources, and metrics in the SA360 API schema.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Field discovery query |
| `pageSize` | number | No | Max results (default 100) |

```json
{
  "query": "SELECT name, category, data_type, selectable, filterable, sortable FROM searchAds360Fields WHERE name LIKE 'campaign.%'"
}
```

#### `sa360_get_change_history`
Get change history for SA360 entities using the `change_event` resource.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `customerId` | string | Yes | SA360 customer ID |
| `startDate` | string | Yes | Start date (YYYY-MM-DD) |
| `endDate` | string | Yes | End date (YYYY-MM-DD) |
| `resourceType` | enum | No | Filter: CAMPAIGN, AD_GROUP, AD, KEYWORD, CRITERION |
| `limit` | number | No | Max results (default 100) |

### Async Reporting Tools (v2 API)

#### `sa360_submit_report`
Submit an asynchronous report request. Returns a report ID for polling.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `agencyId` | string | Yes | SA360 agency ID |
| `advertiserId` | string | No | SA360 advertiser ID |
| `reportType` | enum | Yes | campaign, adGroup, keyword, ad, advertiser, etc. |
| `columns` | array | Yes | Columns to include (min 1) |
| `startDate` | string | Yes | Report start date (YYYY-MM-DD) |
| `endDate` | string | Yes | Report end date (YYYY-MM-DD) |
| `filters` | array | No | Filter conditions |
| `includeRemovedEntities` | boolean | No | Include deleted entities |

#### `sa360_check_report_status`
Poll a submitted report until ready.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `reportId` | string | Yes | Report ID from submit_report |

#### `sa360_download_report`
Download a completed report file as parsed CSV.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `downloadUrl` | string | Yes | File URL from check_report_status |
| `maxRows` | number | No | Max rows to return (default 1000, max 10000) |

### Conversion API v2 Tools (Write)

#### `sa360_insert_conversions`
Insert offline conversions via the legacy v2 API.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `agencyId` | string | Yes | SA360 agency ID |
| `advertiserId` | string | Yes | SA360 advertiser ID |
| `conversions` | array | Yes | Conversion rows (max 200) |

Each conversion row:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `clickId` | string | No | SA360 click ID |
| `gclid` | string | No | Google click ID |
| `conversionTimestamp` | string | Yes | Epoch milliseconds |
| `revenueMicros` | string | No | Revenue (1,000,000 = 1 currency unit) |
| `currencyCode` | string | No | ISO 4217 currency code |
| `segmentationType` | string | Yes | Segment type (default: FLOODLIGHT) |
| `floodlightActivityId` | string | No | Floodlight activity ID |
| `type` | string | No | ACTION or TRANSACTION |

#### `sa360_update_conversions`
Update existing conversions via the legacy v2 API.

Same parameters as `sa360_insert_conversions`, but each conversion row **must** include `conversionId` (returned from the original insert). Set `state: "REMOVED"` to delete a conversion.

### Validation

#### `sa360_validate_conversion`
Validate a conversion payload before uploading (no API call).

---

## Key Gotchas

| Issue | Details |
|-------|---------|
| **SA360 is read-only for entities** | No create/update/delete for campaigns, ad groups, or ads. Only conversions and reports are writable. |
| **cost_micros convention** | All monetary values are in micros (1,000,000 = 1 currency unit). Divide by 1M for display. |
| **Dual API** | Reporting API v0 for reads, legacy v2 API for conversions and async reports. Different auth headers. |
| **login-customer-id** | Required for MCC (manager) accounts to access sub-accounts. Set via `SA360_LOGIN_CUSTOMER_ID`. |
| **No developer token** | Unlike Google Ads, SA360 does not require a developer token — just OAuth2 credentials. |
| **90-day conversion window** | Conversions older than 90 days are rejected by the v2 API. |

## Rate Limiting

- Default: 100 requests/minute per customer ID
- Separate rate limit pools for reporting API v0 and v2 API
- Automatic exponential backoff on 429/5xx responses (max 3 retries)
- Configurable via `SA360_RATE_LIMIT_PER_MINUTE` environment variable

---

## Entity Types

SA360 supports 8 entity types for read-only access:

| Entity Type | Query Resource | ID Field | Has Status |
|-------------|---------------|----------|------------|
| `customer` | `customer` | `customer.id` | No |
| `campaign` | `campaign` | `campaign.id` | Yes |
| `adGroup` | `ad_group` | `ad_group.id` | Yes |
| `adGroupAd` | `ad_group_ad` | `ad_group_ad.ad.id` | Yes |
| `adGroupCriterion` | `ad_group_criterion` | `ad_group_criterion.criterion_id` | Yes |
| `campaignCriterion` | `campaign_criterion` | `campaign_criterion.criterion_id` | No |
| `biddingStrategy` | `bidding_strategy` | `bidding_strategy.id` | Yes |
| `conversionAction` | `conversion_action` | `conversion_action.id` | Yes |

SA360 entities include an `engine_id` field that maps back to the source engine (Google Ads, Microsoft Ads, etc.), enabling cross-engine correlation.

---

## Example Workflows

### Cross-Engine Performance Analysis

```
User: "Compare campaign performance across all search engines for last month"

AI Agent:
1. sa360_list_accounts → discover accessible accounts
2. sa360_get_insights → campaign performance with LAST_MONTH date range
3. sa360_get_insights_breakdowns → break down by segments.ad_network_type
4. Synthesize cross-engine comparison report
```

### Async Report for Large Datasets

```
User: "Pull keyword-level performance for Q1 across all advertisers"

AI Agent:
1. sa360_submit_report → submit async keyword report with Q1 date range
2. sa360_check_report_status → poll until isReportReady is true
3. sa360_download_report → download and parse CSV results
4. Analyze keyword performance across engines
```

### Offline Conversion Upload

```
User: "Upload these CRM conversions to SA360 for bid optimization"

AI Agent:
1. sa360_list_entities (conversionAction) → find the right floodlight activity
2. sa360_insert_conversions → upload conversion data with gclids
3. Confirm upload with count and any errors
```

### Field Discovery

```
User: "What metrics are available for SA360 campaign reporting?"

AI Agent:
1. sa360_search_fields → query for metrics.* fields
2. Present available metrics with data types and descriptions
```

---

## Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `SA360_MCP_PORT` | `3010` | HTTP server port |
| `SA360_MCP_HOST` | `127.0.0.1` | HTTP server bind address |
| `MCP_AUTH_MODE` | `sa360-headers` | Auth mode: `sa360-headers`, `jwt`, `none` |
| `MCP_AUTH_SECRET_KEY` | — | JWT secret (jwt mode only) |
| `SA360_API_BASE_URL` | `https://searchads360.googleapis.com/v0` | Reporting API base URL |
| `SA360_V2_API_BASE_URL` | `https://www.googleapis.com/doubleclicksearch/v2` | Legacy v2 API base URL |
| `SA360_RATE_LIMIT_PER_MINUTE` | `100` | Rate limit per customer ID |
| `SA360_CLIENT_ID` | — | OAuth2 client ID (stdio mode) |
| `SA360_CLIENT_SECRET` | — | OAuth2 client secret (stdio mode) |
| `SA360_REFRESH_TOKEN` | — | OAuth2 refresh token (stdio mode) |
| `SA360_LOGIN_CUSTOMER_ID` | — | Manager account ID (optional) |
| `LOG_LEVEL` | `info` | Logging level |
| `OTEL_ENABLED` | `false` | Enable OpenTelemetry |
| `OTEL_SERVICE_NAME` | `sa360-mcp` | OTEL service name |

---

## Architecture

```
packages/sa360-mcp/
├── package.json
├── tsconfig.json
├── .env.example
├── README.md
├── src/
│   ├── index.ts                          # Entry point (bootstrap)
│   ├── config/
│   │   └── index.ts                      # Environment config (Zod schema)
│   ├── auth/
│   │   ├── sa360-auth-adapter.ts         # OAuth2 refresh token adapter
│   │   └── sa360-auth-strategy.ts        # HTTP headers auth strategy
│   ├── services/
│   │   ├── session-services.ts           # Per-session service factory
│   │   ├── sa360/
│   │   │   ├── sa360-http-client.ts      # Reporting API v0 HTTP client
│   │   │   └── sa360-service.ts          # Query, entity, field operations
│   │   └── sa360-v2/
│   │       ├── sa360-v2-http-client.ts   # Legacy v2 HTTP client
│   │       ├── conversion-service.ts     # Conversion insert/update
│   │       └── reporting-service.ts      # Async report submit/poll/download
│   ├── mcp-server/
│   │   ├── server.ts                     # MCP server setup
│   │   ├── tools/
│   │   │   ├── index.ts
│   │   │   ├── definitions/              # 16 tool files
│   │   │   │   ├── sa360-search.tool.ts
│   │   │   │   ├── list-accounts.tool.ts
│   │   │   │   ├── list-entities.tool.ts
│   │   │   │   ├── get-entity.tool.ts
│   │   │   │   ├── get-insights.tool.ts
│   │   │   │   ├── get-insights-breakdowns.tool.ts
│   │   │   │   ├── list-custom-columns.tool.ts
│   │   │   │   ├── search-fields.tool.ts
│   │   │   │   ├── submit-report.tool.ts
│   │   │   │   ├── check-report-status.tool.ts
│   │   │   │   ├── download-report.tool.ts
│   │   │   │   ├── insert-conversions.tool.ts
│   │   │   │   ├── update-conversions.tool.ts
│   │   │   │   ├── validate-conversion.tool.ts
│   │   │   │   ├── get-change-history.tool.ts
│   │   │   │   └── index.ts
│   │   │   └── utils/
│   │   │       ├── entity-mapping.ts     # 8 entity type configs
│   │   │       ├── query-helpers.ts      # Query builder functions
│   │   │       ├── computed-metrics.ts   # Derived CPA/ROAS/CPM
│   │   │       └── resolve-session.ts    # Session service resolver
│   │   ├── resources/
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   ├── prompts/
│   │   │   └── index.ts
│   │   └── transports/
│   │       └── streamable-http-transport.ts
│   ├── types-global/
│   │   └── mcp.ts
│   └── utils/
│       ├── telemetry/
│       │   ├── tracing.ts
│       │   └── index.ts
│       └── security/
│           └── rate-limiter.ts
└── tests/                                # 30 test files, 459 tests
```

### Key Design Decisions

- **Dual HTTP clients**: Separate clients for Reporting API v0 and legacy v2, since they have different base URLs, error formats, and auth requirements
- **No mutate operations**: SA360 is read-only for entities — the server intentionally omits create/update/delete entity tools
- **GAQL-compatible query language**: SA360 uses the same query syntax as Google Ads (GAQL), making it familiar for users of gads-mcp
- **Session services pattern**: Per-session `SessionServices` with 5 service instances (httpClient, v2HttpClient, sa360Service, conversionService, reportingService)

---

## Development

```bash
# Build
cd packages/sa360-mcp && pnpm run build

# Type check
pnpm run typecheck

# Run tests (459 tests)
pnpm run test

# Dev mode with hot reload
pnpm run dev:http
```

---

---

## Get Started

**Self-host**: Follow the [deployment guide](../../docs/guides/deployment-instructions.md) to run this server on your own infrastructure.

**Managed hosting**: [Request access](https://cesteral.com/integrations/search-ads-360?utm_source=github&utm_medium=package-readme&utm_campaign=sa360-mcp) -- credentials, governance, and multi-tenant access included.

**Book a demo**: [See it in action](mailto:sales@cesteral.com?subject=Demo%20request%20-%20Search%20Ads%20360%20MCP) with your own ad accounts.

**Compare options**: [Self-hosted vs managed](https://cesteral.com/compare?utm_source=github&utm_medium=package-readme&utm_campaign=sa360-mcp)

## License

[Apache License 2.0](../../LICENSE.md)
