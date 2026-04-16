# @cesteral/msads-mcp

Microsoft Advertising MCP Server - campaign management and reporting via Microsoft Advertising API v13 JSON endpoints.

## Purpose

Management and reporting server for Microsoft Advertising (Bing Ads). Provides
full CRUD operations on campaigns, ad groups, ads, keywords, budgets, ad
extensions, audiences, and labels. Includes async reporting with configurable
aggregation, Google Ads import via ImportJobs API, and ad extension management.
Designed for AI agents to manage Microsoft Ads campaigns programmatically
through the Model Context Protocol.

## Features

- **Per-session Bearer token auth** via `MsAdsBearerAuthStrategy`
- **Streamable HTTP + stdio transports** via Hono + `@hono/mcp`
- **OpenTelemetry** instrumentation for traces and metrics
- **Rate limiting** via shared `RateLimiter` class
- **Structured logging** via Pino
- **Google Ads import** via ImportJobs API

## MCP Tools

### Core CRUD

| Tool | Description |
|------|-------------|
| `msads_list_entities` | List Microsoft Ads entities with filters and pagination |
| `msads_get_entity` | Get a single entity by ID |
| `msads_create_entity` | Create a new entity |
| `msads_update_entity` | Update an existing entity |
| `msads_delete_entity` | Delete an entity |
| `msads_list_accounts` | List accessible ad accounts |

### Reporting

All reporting tools below accept the shared bounded report-view params: `mode` (`"summary"` default — headers + counts + 10-row preview, or `"rows"` for a paginated rows page), `columns` (project to selected columns), `offset` (zero-based pagination), and `maxRows` (page size; default 10 for summary, 50 for rows; hard cap 200).

| Tool | Description |
|------|-------------|
| `msads_get_report` | Submit and download async report (blocking) |
| `msads_submit_report` | Submit async report (non-blocking) |
| `msads_check_report_status` | Check report status |
| `msads_download_report` | Download and parse report results |
| `msads_get_report_breakdowns` | Async report with additional breakdown columns |

### Bulk Operations

| Tool | Description |
|------|-------------|
| `msads_bulk_create_entities` | Batch create entities |
| `msads_bulk_update_entities` | Batch update entities |
| `msads_bulk_update_status` | Batch status updates |
| `msads_adjust_bids` | Batch bid adjustments |

### Specialized

| Tool | Description |
|------|-------------|
| `msads_manage_ad_extensions` | Manage ad extensions (sitelinks, callouts, etc.) |
| `msads_manage_criterions` | Manage targeting criterions |
| `msads_search_targeting` | Search available targeting options |
| `msads_get_ad_details` | Get stored ad details (copy, URLs, status) |
| `msads_validate_entity` | Validate entity payload |
| `msads_import_from_google` | Import campaigns from Google Ads |

## Supported Entity Types

| Entity Type    | API Service Path | Parent Entity | Batch Limit | Notes |
|----------------|------------------|---------------|-------------|-------|
| `campaign`     | `/Campaigns/*`   | Account       | 100         | Top-level entity; requires budget reference |
| `adGroup`      | `/AdGroups/*`     | Campaign      | 1000        | Requires parent `CampaignId` |
| `ad`           | `/Ads/*`         | Ad Group      | 50          | Requires parent `AdGroupId` |
| `keyword`      | `/Keywords/*`    | Ad Group      | 1000        | Requires parent `AdGroupId` |
| `budget`       | `/Budgets/*`     | Account       | 100         | Shared budgets; create before campaigns |
| `adExtension`  | `/AdExtensions/*`| Account       | 100         | Sitelinks, callouts, structured snippets, etc. |
| `audience`     | `/Audiences/*`   | Account       | 100         | Remarketing lists, custom audiences |
| `label`        | `/Labels/*`      | Account       | 100         | For organizing and filtering entities |

**Entity Hierarchy:** Account > Budget > Campaign > Ad Group > Ad / Keyword

## Current Status

**Phase: Production-Ready**

All listed tools are implemented against the Microsoft Advertising API v13 JSON endpoints.

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

### Server Configuration

- `MSADS_MCP_PORT`: Server port (default: 3013)
- `MCP_AUTH_MODE`: Authentication mode - `msads-bearer` (default), `jwt`, or `none`
- `MCP_AUTH_SECRET_KEY`: Required when `MCP_AUTH_MODE=jwt`

### Stdio Mode Credentials

When running in stdio transport mode (e.g., Claude Desktop), set these environment variables instead of passing HTTP headers:

- `MSADS_ACCESS_TOKEN`: Microsoft Ads OAuth2 access token
- `MSADS_DEVELOPER_TOKEN`: Per-app developer token (from Microsoft Advertising Developer Portal)
- `MSADS_CUSTOMER_ID`: Manager account (customer) ID
- `MSADS_ACCOUNT_ID`: Ad account (customer account) ID

### Advanced Configuration

- `MSADS_CAMPAIGN_API_BASE_URL`: Campaign Management API base URL (default: `https://campaign.api.bingads.microsoft.com/CampaignManagement/v13`)
- `MSADS_REPORTING_API_BASE_URL`: Reporting API base URL (default: `https://reporting.api.bingads.microsoft.com/Reporting/v13`)
- `MSADS_CUSTOMER_API_BASE_URL`: Customer Management API base URL (default: `https://clientcenter.api.bingads.microsoft.com/CustomerManagement/v13`)
- `MSADS_RATE_LIMIT_PER_MINUTE`: Rate limit per minute (default: 10)
- `MSADS_REPORT_POLL_INTERVAL_MS`: Report poll interval in ms (default: 3000)
- `MSADS_REPORT_MAX_POLL_ATTEMPTS`: Max report poll attempts (default: 30)

## Architecture

### Key Components

- **`MsAdsHttpClient`** (`src/services/msads/msads-http-client.ts`) — HTTP client for Microsoft Advertising API v13 JSON endpoints with retry on 429/5xx, timeout handling, and OpenTelemetry tracing
- **`MsAdsService`** (`src/services/msads/msads-service.ts`) — Generic entity CRUD wrapping `MsAdsHttpClient`; routes operations to collection and query endpoints via entity mapping
- **`MsAdsReportingService`** (`src/services/msads/msads-reporting-service.ts`) — Async reporting flow: SubmitGenerateReport, PollGenerateReport, download CSV/TSV
- **`MsAdsBearerAuthStrategy`** (`src/auth/msads-auth-strategy.ts`) — Extracts OAuth2 token + 3 additional credentials from HTTP headers; validates via Customer Management API
- **`MsAdsAccessTokenAdapter`** (`src/auth/msads-auth-adapter.ts`) — Holds pre-generated OAuth2 token plus developer token and account identifiers; validates via the Customer Management user query endpoint
- **`SessionServiceStore`** — Per-session service instances keyed by session ID (created on connect, cleaned up on close/timeout)

### Key Gotchas

- **All operations use POST** — Microsoft Advertising JSON endpoints use POST for both mutations and queries.
- **4 auth headers required per request** — Every JSON API call must include `Authorization: Bearer <token>`, `DeveloperToken`, `CustomerId`, and `CustomerAccountId`.
- **No hard delete for most entities** — Use status change (e.g., set status to `Deleted` or `Paused`) rather than expecting a true DELETE operation. The `delete_entity` tool wraps the platform's delete endpoint, but behavior varies by entity type.
- **Collection + query routing** — Mutations use collection endpoints such as `/Campaigns`, while reads use query endpoints such as `/Campaigns/QueryByAccountId` and `/Campaigns/QueryByIds`.
- **Batch limits vary by entity type** — Ads have a limit of 50 per batch, while keywords and ad groups allow up to 1000.

### Transport

- **Streamable HTTP**: MCP protocol via Hono + `@hono/mcp`
- **Health check**: `/health` endpoint

## Contributing

See root [CLAUDE.md](../../CLAUDE.md) for development guidelines, build system details, and monorepo conventions. See the [root README](../../README.md) for full architecture context.

---

## Get Started

**Self-host**: Follow the [deployment guide](../../docs/guides/deployment-instructions.md) to run this server on your own infrastructure.

**Cesteral Intelligence**: [Request access](https://cesteral.com/integrations/microsoft-ads?utm_source=github&utm_medium=package-readme&utm_campaign=msads-mcp) -- governed execution with credential brokering, approvals, audit, and multi-tenant access.

**Book a workflow demo**: [See it in action](mailto:sales@cesteral.com?subject=Workflow%20demo%20-%20Microsoft%20Ads%20MCP) with your own ad accounts.

**Compare options**: [OSS connectors vs Cesteral Intelligence](https://cesteral.com/compare?utm_source=github&utm_medium=package-readme&utm_campaign=msads-mcp)

## License

Apache License 2.0 — see [LICENSE](../../LICENSE.md) for details. This package is part of Cesteral's open-source connector layer; managed hosting and higher-level governance features live outside this repository.
