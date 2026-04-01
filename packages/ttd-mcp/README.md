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

### Core CRUD

| Tool                  | Description                                              |
| --------------------- | -------------------------------------------------------- |
| `ttd_list_entities`   | List TTD entities with optional filtering and pagination |
| `ttd_get_entity`      | Get a single TTD entity by ID                            |
| `ttd_create_entity`   | Create a new TTD entity                                  |
| `ttd_update_entity`   | Update an existing TTD entity (PUT)                      |
| `ttd_delete_entity`   | Delete a TTD entity by ID                                |
| `ttd_validate_entity` | Dry-run validate entity payload without persisting       |

### Reporting

| Tool                      | Description                                  |
| ------------------------- | -------------------------------------------- |
| `ttd_get_report`          | Generate async report via MyReports V3 API   |
| `ttd_download_report`     | Download and parse report CSV from URL       |
| `ttd_submit_report`       | Submit report without waiting (non-blocking) |
| `ttd_check_report_status` | Single status check for a submitted report   |

### Bulk Operations

| Tool                       | Description                                             |
| -------------------------- | ------------------------------------------------------- |
| `ttd_bulk_create_entities` | Batch create campaigns/ad groups (up to 50)             |
| `ttd_bulk_update_entities` | Batch update campaigns/ad groups (up to 50)             |
| `ttd_bulk_update_status`   | Batch pause/resume/archive entities                     |
| `ttd_archive_entities`     | Batch archive (soft-delete) entities                    |
| `ttd_adjust_bids`          | Batch adjust ad group bid CPMs (safe read-modify-write) |

### Advanced (GraphQL)

| Tool                          | Description                                            |
| ----------------------------- | ------------------------------------------------------ |
| `ttd_graphql_query`           | Execute GraphQL query/mutation against TTD GraphQL API |
| `ttd_graphql_query_bulk`      | Execute bulk GraphQL queries                           |
| `ttd_graphql_mutation_bulk`   | Execute bulk GraphQL mutations                         |
| `ttd_graphql_bulk_job`        | Submit a GraphQL bulk job                              |
| `ttd_graphql_cancel_bulk_job` | Cancel a running GraphQL bulk job                      |

### MyReports Templates and Schedules

| Tool                           | Description                                                    |
| ------------------------------ | -------------------------------------------------------------- |
| `ttd_create_report_template`   | Create a MyReports template via GraphQL                        |
| `ttd_update_report_template`   | Replace an existing MyReports template via GraphQL             |
| `ttd_get_report_template`      | Retrieve template structure, including result-set column IDs   |
| `ttd_list_report_templates`    | List template headers via GraphQL cursor pagination            |
| `ttd_create_template_schedule` | Create a one-time or recurring template schedule via GraphQL   |
| `ttd_update_report_schedule`   | Enable or disable an existing report schedule via GraphQL      |
| `ttd_cancel_report_execution`  | Cancel an in-progress report execution via GraphQL             |
| `ttd_rerun_report_schedule`    | Trigger a fresh execution from an existing schedule            |
| `ttd_get_report_executions`    | Retrieve execution history, statuses, and download links       |
| `ttd_create_report_schedule`   | Legacy-compatible REST wrapper for schedule creation           |
| `ttd_list_report_schedules`    | List existing report schedules                                 |
| `ttd_get_report_schedule`      | Get a specific report schedule                                 |
| `ttd_delete_report_schedule`   | Delete a report schedule                                       |

### Preview

| Tool                 | Description                                       |
| -------------------- | ------------------------------------------------- |
| `ttd_get_ad_preview` | Get preview URL and metadata for a TTD creative   |

## Supported Entity Types

| Entity Type         | API Path               | ID Field        |
| ------------------- | ---------------------- | --------------- |
| `advertiser`        | `/advertiser`          | `AdvertiserId`  |
| `campaign`          | `/campaign`            | `CampaignId`    |
| `adGroup`           | `/adgroup`             | `AdGroupId`     |
| `ad`                | `/ad`                  | `AdId`          |
| `creative`          | `/creative`            | `CreativeId`    |
| `siteList`          | `/sitelist`            | `SiteListId`    |
| `deal`              | `/deal`                | `DealId`        |
| `conversionTracker` | `/tracking/conversion` | `TrackingTagId` |
| `bidList`           | `/bidlist`             | `BidListId`     |

**Entity Hierarchy:** partner > advertiser > campaign > adGroup > ad

## Current Status

**Phase: Production-Ready**

All listed tools are implemented using TTD API v3 and GraphQL. Entity CRUD,
bulk operations, GraphQL passthrough, MyReports templates/schedules, and
creative preview are available via partner token authentication.

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

### Key Gotchas

- TTD uses PUT for updates (full entity replacement, not PATCH)
- `AdvertiserId` is required in most entity payloads
- Report generation is async: submit → poll → download CSV
- MyReports templates and schedules are separate concepts; GraphQL is the primary path for template-driven reporting
- Archive is a soft-delete; archived entities cannot be reactivated
- GraphQL API is separate from REST and uses different auth flow

### Transport

- **Streamable HTTP**: MCP protocol via Hono + `@hono/mcp`
- **Health check**: `/health` endpoint

## Contributing

See root [CLAUDE.md](../../CLAUDE.md) for development guidelines, build system details, and monorepo conventions. See the [root README](../../README.md) for full architecture context.

---

## Get Started

**Self-host**: Follow the [deployment guide](../../docs/guides/deployment-instructions.md) to run this server on your own infrastructure.

**Cesteral Intelligence**: [Request access](https://cesteral.com/integrations/the-trade-desk?utm_source=github&utm_medium=package-readme&utm_campaign=ttd-mcp) -- governed execution with credential brokering, approvals, audit, and multi-tenant access.

**Book a workflow demo**: [See it in action](mailto:sales@cesteral.com?subject=Workflow%20demo%20-%20The%20Trade%20Desk%20MCP) with your own ad accounts.

**Compare options**: [OSS connectors vs Cesteral Intelligence](https://cesteral.com/compare?utm_source=github&utm_medium=package-readme&utm_campaign=ttd-mcp)

## License

Apache License 2.0 — see [LICENSE](../../LICENSE.md) for details. This package is part of Cesteral's open-source connector layer; managed hosting and higher-level governance features live outside this repository.
