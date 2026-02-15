# @cesteral/ttd-mcp

TTD MCP Server - The Trade Desk campaign entity management and reporting via TTD API v3.

## Purpose

Management and reporting server for The Trade Desk. Provides full CRUD operations on TTD campaign entities (advertisers, campaigns, ad groups, ads) and on-demand report generation via the MyReports API. Designed for AI agents to manage TTD campaigns programmatically through the Model Context Protocol.

## Features

- **Per-session authentication** via `SessionServiceStore` pattern
- **Partner token auth** using `X-TTD-Partner-Id` and `X-TTD-Api-Secret` headers
- **OpenTelemetry** instrumentation for traces and metrics
- **Rate limiting** via shared `RateLimiter` class
- **MCP protocol** with Streamable HTTP transport (Hono)
- **Structured output** with `outputSchema` on all tools

## MCP Tools

### 1. `ttd_create_entity`
Create a new TTD entity. Required fields vary by entity type.

**Parameters:**
- `entityType` (string): Type of entity to create
- `advertiserId` (string, optional): Advertiser ID (required for campaigns, ad groups, ads)
- `data` (object): Entity data fields

### 2. `ttd_get_entity`
Get a single TTD entity by ID.

**Parameters:**
- `entityType` (string): Type of entity to retrieve
- `entityId` (string): The entity ID

### 3. `ttd_list_entities`
List TTD entities with optional filtering and pagination.

**Parameters:**
- `entityType` (string): Type of entities to list
- `advertiserId` (string, optional): Advertiser ID filter
- `campaignId` (string, optional): Campaign ID filter
- `filter` (object, optional): Additional filter fields
- `pageToken` (string, optional): Pagination token
- `pageSize` (number, optional): Results per page (1-100)

### 4. `ttd_update_entity`
Update an existing TTD entity via PUT endpoint.

**Parameters:**
- `entityType` (string): Type of entity to update
- `entityId` (string): The entity ID
- `data` (object): Entity data fields to update

### 5. `ttd_delete_entity`
Delete a TTD entity by ID. Destructive and cannot be undone.

**Parameters:**
- `entityType` (string): Type of entity to delete
- `entityId` (string): The entity ID
- `reason` (string, optional): Reason for deletion (audit logging)

### 6. `ttd_get_report`
Generate and retrieve a report via the TTD MyReports API. Async operation that creates a report schedule, polls for execution, and returns results.

**Parameters:**
- `reportName` (string): Name for the report
- `dateRange` (string): Date range (e.g., "Last7Days", "Last30Days", "Yesterday", "Custom")
- `dimensions` (string[], optional): Report dimensions (e.g., ["AdvertiserId", "CampaignId"])
- `metrics` (string[], optional): Report metrics (e.g., ["Impressions", "Clicks", "TotalCost"])
- `advertiserIds` (string[], optional): Filter by advertiser IDs
- `additionalConfig` (object, optional): Additional report configuration fields

## Supported Entity Types

| Entity Type | API Path | ID Field |
|-------------|----------|----------|
| `advertiser` | `/advertiser` | `AdvertiserId` |
| `campaign` | `/campaign` | `CampaignId` |
| `adGroup` | `/adgroup` | `AdGroupId` |
| `ad` | `/ad` | `AdId` |

**Entity Hierarchy:** partner > advertiser > campaign > adGroup > ad

## Current Status

**Phase: Production-Ready**

All tools are fully implemented using TTD API v3. Entity CRUD and reporting are operational via partner token authentication.

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

- `TTD_MCP_PORT`: Server port (default: 3003)
- `TTD_PARTNER_ID`: TTD Partner ID (required for stdio mode)
- `TTD_API_SECRET`: TTD API Secret (required for stdio mode)
- `MCP_AUTH_MODE`: Authentication mode - `ttd-headers` (default), `jwt`, or `none`
- `MCP_AUTH_SECRET_KEY`: Required when `MCP_AUTH_MODE=jwt`

## Architecture

### Key Components

- **`TtdHttpClient`** - HTTP client for TTD API v3, accepts `TtdAuthAdapter`
- **`TtdEntityService`** - CRUD operations for all supported entity types
- **`TtdReportingService`** - Report generation via MyReports API
- **`TtdHeadersAuthStrategy`** - Reads partner credentials from request headers
- **`SessionServiceStore`** - Per-session service instances keyed by session ID

### Transport

- **Streamable HTTP**: MCP protocol via Hono + `@hono/mcp`
- **Health check**: `/health` endpoint

## Contributing

See root [CLAUDE.md](../../CLAUDE.md) for development guidelines, build system details, and monorepo conventions.

## License

Private - Cesteral Internal Use Only
