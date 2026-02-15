# @cesteral/gads-mcp

Google Ads MCP Server - Campaign entity management and reporting via Google Ads REST API v23.

## Purpose

Management and reporting server for Google Ads. Provides full CRUD operations on Google Ads campaign entities (campaigns, ad groups, ads, keywords, assets, budgets) and arbitrary GAQL query execution. Designed for AI agents to manage Google Ads campaigns programmatically through the Model Context Protocol.

## Features

- **Per-session authentication** via `SessionServiceStore` pattern
- **OAuth2 refresh token auth** using `X-GAds-*` headers (developer token, client ID, client secret, refresh token)
- **OpenTelemetry** instrumentation for traces and metrics
- **Rate limiting** via shared `RateLimiter` class
- **MCP protocol** with Streamable HTTP transport (Hono)
- **Structured output** with `outputSchema` on all tools
- **GAQL query support** for flexible read operations

## MCP Tools

### Read Tools

#### 1. `gads_gaql_search`
Execute arbitrary GAQL queries against the Google Ads API.

**Parameters:**
- `customerId` (string): Google Ads customer ID (no dashes)
- `query` (string): GAQL query string
- `pageSize` (number, optional): Results per page (default 1000, max 10000)
- `pageToken` (string, optional): Pagination token

#### 2. `gads_list_accounts`
List all Google Ads customer accounts accessible to the authenticated user.

**Parameters:** None

#### 3. `gads_get_entity`
Get a single Google Ads entity by type and ID.

**Parameters:**
- `entityType` (string): Type of entity to retrieve
- `customerId` (string): Google Ads customer ID
- `entityId` (string): The entity ID

#### 4. `gads_list_entities`
List entities with optional GAQL filters and pagination.

**Parameters:**
- `entityType` (string): Type of entities to list
- `customerId` (string): Google Ads customer ID
- `filters` (object, optional): GAQL filter conditions
- `pageSize` (number, optional): Results per page (default 100, max 10000)
- `pageToken` (string, optional): Pagination token
- `orderBy` (string, optional): GAQL ORDER BY clause

### Write Tools

#### 5. `gads_create_entity`
Create a new Google Ads entity via the :mutate API.

**Parameters:**
- `entityType` (string): Type of entity to create
- `customerId` (string): Google Ads customer ID
- `data` (object): Entity data fields

#### 6. `gads_update_entity`
Update an existing entity with updateMask discipline.

**Parameters:**
- `entityType` (string): Type of entity to update
- `customerId` (string): Google Ads customer ID
- `entityId` (string): The entity ID
- `data` (object): Fields to update
- `updateMask` (string): Comma-separated list of fields to update

#### 7. `gads_remove_entity`
Remove an entity via the :mutate API (sets status to REMOVED).

**Parameters:**
- `entityType` (string): Type of entity to remove
- `customerId` (string): Google Ads customer ID
- `entityId` (string): The entity ID

#### 8. `gads_bulk_mutate`
Execute multiple create/update/remove operations in a single API call.

**Parameters:**
- `entityType` (string): Type of entities to mutate
- `customerId` (string): Google Ads customer ID
- `operations` (array): Array of mutate operation objects
- `partialFailure` (boolean, optional): Allow partial success (default: false)

#### 9. `gads_bulk_update_status`
Batch update statuses for multiple entities.

**Parameters:**
- `entityType` (string): Type of entities to update
- `customerId` (string): Google Ads customer ID
- `entityIds` (string[]): Entity IDs to update (max 100)
- `status` (string): `ENABLED`, `PAUSED`, or `REMOVED`

## Supported Entity Types

| Entity Type | GAQL Resource | Mutate Endpoint | Notes |
|-------------|---------------|-----------------|-------|
| `campaign` | `campaign` | `campaigns:mutate` | Requires campaignBudget reference |
| `adGroup` | `ad_group` | `adGroups:mutate` | Requires campaign reference |
| `ad` | `ad_group_ad` | `adGroupAds:mutate` | Composite ID: `{adGroupId}~{adId}` |
| `keyword` | `ad_group_criterion` | `adGroupCriteria:mutate` | Composite ID: `{adGroupId}~{criterionId}` |
| `campaignBudget` | `campaign_budget` | `campaignBudgets:mutate` | Create before campaign |
| `asset` | `asset` | `assets:mutate` | Reusable text/image/sitelink/callout |

**Entity Hierarchy:** Customer > Campaign Budget > Campaign > Ad Group > Ad / Keyword

## Current Status

**Phase: Production-Ready**

All tools are fully implemented using Google Ads REST API v23. Entity CRUD, GAQL queries, and bulk operations are operational via OAuth2 refresh token authentication.

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

# Run tests
pnpm run test
```

## Environment Variables

- `GADS_MCP_PORT`: Server port (default: 3004)
- `GADS_DEVELOPER_TOKEN`: Google Ads developer token (required for stdio mode)
- `GADS_CLIENT_ID`: OAuth2 client ID (required for stdio mode)
- `GADS_CLIENT_SECRET`: OAuth2 client secret (required for stdio mode)
- `GADS_REFRESH_TOKEN`: OAuth2 refresh token (required for stdio mode)
- `GADS_LOGIN_CUSTOMER_ID`: Manager account ID (optional, for stdio mode)
- `MCP_AUTH_MODE`: Authentication mode - `gads-headers` (default), `jwt`, or `none`
- `MCP_AUTH_SECRET_KEY`: Required when `MCP_AUTH_MODE=jwt`

## Architecture

### Key Components

- **`GAdsHttpClient`** - HTTP client for Google Ads API v23 with retry logic and error parsing
- **`GAdsService`** - GAQL queries, account listing, and generic CRUD via :mutate API
- **`GAdsRefreshTokenAuthAdapter`** - OAuth2 token caching with mutex for concurrent requests
- **`GAdsHeadersAuthStrategy`** - Reads credentials from request headers
- **`SessionServiceStore`** - Per-session service instances keyed by session ID

### Transport

- **Streamable HTTP**: MCP protocol via Hono + `@hono/mcp`
- **Health check**: `/health` endpoint

## Contributing

See root [CLAUDE.md](../../CLAUDE.md) for development guidelines, build system details, and monorepo conventions.

## License

Private - Cesteral Internal Use Only
