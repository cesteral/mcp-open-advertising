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

#### 5. `gads_get_insights`

Get performance insights for Google Ads entities using preset parameters. Convenience wrapper around GAQL.

**Parameters:**

- `customerId` (string): Google Ads customer ID
- `entityType` (string): Entity type (`campaign`, `adGroup`, `ad`, `keyword`)
- `entityId` (string, optional): Filter to a specific entity
- `dateRange` (string): Date range preset (`TODAY`, `YESTERDAY`, `LAST_7_DAYS`, `LAST_30_DAYS`, `THIS_MONTH`, `LAST_MONTH`, `LAST_90_DAYS`)
- `metrics` (string[], optional): Custom metrics (defaults to impressions, clicks, cost_micros, conversions, ctr, average_cpc)
- `limit` (number, optional): Max results (default 50)

### Write Tools

#### 6. `gads_create_entity`

Create a new Google Ads entity via the :mutate API.

**Parameters:**

- `entityType` (string): Type of entity to create
- `customerId` (string): Google Ads customer ID
- `data` (object): Entity data fields

#### 7. `gads_update_entity`

Update an existing entity with updateMask discipline.

**Parameters:**

- `entityType` (string): Type of entity to update
- `customerId` (string): Google Ads customer ID
- `entityId` (string): The entity ID
- `data` (object): Fields to update
- `updateMask` (string): Comma-separated list of fields to update

#### 8. `gads_remove_entity`

Remove an entity via the :mutate API (sets status to REMOVED).

**Parameters:**

- `entityType` (string): Type of entity to remove
- `customerId` (string): Google Ads customer ID
- `entityId` (string): The entity ID

#### 9. `gads_bulk_mutate`

Execute multiple create/update/remove operations in a single API call.

**Parameters:**

- `entityType` (string): Type of entities to mutate
- `customerId` (string): Google Ads customer ID
- `operations` (array): Array of mutate operation objects
- `partialFailure` (boolean, optional): Allow partial success (default: false)

#### 10. `gads_bulk_update_status`

Batch update statuses for multiple entities.

**Parameters:**

- `entityType` (string): Type of entities to update
- `customerId` (string): Google Ads customer ID
- `entityIds` (string[]): Entity IDs to update (max 100)
- `status` (string): `ENABLED`, `PAUSED`, or `REMOVED`

#### 11. `gads_adjust_bids`

Batch adjust ad group bids with safe read-modify-write pattern.

**Parameters:**

- `customerId` (string): Google Ads customer ID
- `adjustments` (array): Array of bid adjustments (max 50), each with `adGroupId` and optional `cpcBidMicros`/`cpmBidMicros`
- `reason` (string, optional): Reason for the bid adjustment (for audit trail)

### Validate Tools

#### 12. `gads_validate_entity`

Dry-run validate an entity payload via the Google Ads API with `validateOnly: true`.

**Parameters:**

- `entityType` (string): Type of entity to validate
- `customerId` (string): Google Ads customer ID
- `mode` (string): `create` or `update`
- `data` (object): Entity data to validate
- `entityId` (string, optional): Required for update mode
- `updateMask` (string, optional): Required for update mode

## Supported Entity Types

| Entity Type      | GAQL Resource        | Mutate Endpoint          | Notes                                     |
| ---------------- | -------------------- | ------------------------ | ----------------------------------------- |
| `campaign`       | `campaign`           | `campaigns:mutate`       | Requires campaignBudget reference         |
| `adGroup`        | `ad_group`           | `adGroups:mutate`        | Requires campaign reference               |
| `ad`             | `ad_group_ad`        | `adGroupAds:mutate`      | Composite ID: `{adGroupId}~{adId}`        |
| `keyword`        | `ad_group_criterion` | `adGroupCriteria:mutate` | Composite ID: `{adGroupId}~{criterionId}` |
| `campaignBudget` | `campaign_budget`    | `campaignBudgets:mutate` | Create before campaign                    |
| `asset`          | `asset`              | `assets:mutate`          | Reusable text/image/sitelink/callout      |

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

### Key Gotchas

- `customerId` must be numeric with no dashes (e.g., `1234567890` not `123-456-7890`)
- Budget amounts are in **micros** (e.g., `1000000` = $1.00)
- `campaignBudget` must be created before the campaign that references it
- `REMOVED` status is permanent — equivalent to delete
- `gads_validate_entity` calls the real API with `validateOnly: true` (not client-side only)
- Composite IDs for ads: `{adGroupId}~{adId}`, for keywords: `{adGroupId}~{criterionId}`

### Transport

- **Streamable HTTP**: MCP protocol via Hono + `@hono/mcp`
- **Health check**: `/health` endpoint

## Contributing

See root [CLAUDE.md](../../CLAUDE.md) for development guidelines, build system details, and monorepo conventions. See the [root README](../../README.md) for full architecture context.

---

## Get Started

**Self-host**: Follow the [deployment guide](../../docs/guides/deployment-instructions.md) to run this server on your own infrastructure.

**Managed hosting**: [Request access](https://cesteral.com/integrations/google-ads?utm_source=github&utm_medium=package-readme&utm_campaign=gads-mcp) -- credentials, governance, and multi-tenant access included.

**Book a demo**: [See it in action](mailto:sales@cesteral.com?subject=Demo%20request%20-%20Google%20Ads%20MCP) with your own ad accounts.

**Compare options**: [Self-hosted vs managed](https://cesteral.com/compare?utm_source=github&utm_medium=package-readme&utm_campaign=gads-mcp)

## License

Apache License 2.0 — see [LICENSE](../../LICENSE.md) for details. This package is part of Cesteral's open-source connector layer; managed hosting and higher-level governance features live outside this repository.
