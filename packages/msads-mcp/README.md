# @cesteral/msads-mcp

Microsoft Advertising MCP Server - Campaign management and reporting via Microsoft Advertising REST API v13.

## Purpose

Management and reporting server for Microsoft Advertising (Bing Ads). Provides 19 tools for full CRUD operations on campaigns, ad groups, ads, keywords, budgets, ad extensions, audiences, and labels. Includes async reporting with configurable aggregation, Google Ads import via ImportJobs API, and ad extension management. Designed for AI agents to manage Microsoft Ads campaigns programmatically through the Model Context Protocol.

## Features

- **Per-session Bearer token auth** via `MsAdsBearerAuthStrategy`
- **Streamable HTTP + stdio transports** via Hono + `@hono/mcp`
- **OpenTelemetry** instrumentation for traces and metrics
- **Rate limiting** via shared `RateLimiter` class
- **Structured logging** via Pino
- **Google Ads import** via ImportJobs API

## MCP Tools (19 tools)

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

| Tool | Description |
|------|-------------|
| `msads_get_report` | Submit and download async report (blocking) |
| `msads_submit_report` | Submit async report (non-blocking) |
| `msads_check_report_status` | Check report status |
| `msads_download_report` | Download and parse report results |

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
| `msads_get_ad_preview` | Get ad preview |
| `msads_validate_entity` | Validate entity payload |
| `msads_import_from_google` | Import campaigns from Google Ads |

## Current Status

**Phase: Production-Ready**

All 19 tools are fully implemented using Microsoft Advertising REST API v13.

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

- `MSADS_MCP_PORT`: Server port (default: 3013)
- `MCP_AUTH_MODE`: Authentication mode - `msads-bearer` (default), `jwt`, or `none`
- `MCP_AUTH_SECRET_KEY`: Required when `MCP_AUTH_MODE=jwt`

## Contributing

See root [CLAUDE.md](../../CLAUDE.md) for development guidelines, build system details, and monorepo conventions. See the [root README](../../README.md) for full architecture context.

---

## Get Started

**Self-host**: Follow the [deployment guide](../../docs/guides/deployment-instructions.md) to run this server on your own infrastructure.

**Managed hosting**: [Request access](https://cesteral.com/integrations/microsoft-ads?utm_source=github&utm_medium=package-readme&utm_campaign=msads-mcp) -- credentials, governance, and multi-tenant access included.

**Book a demo**: [See it in action](mailto:sales@cesteral.com?subject=Demo%20request%20-%20Microsoft%20Ads%20MCP) with your own ad accounts.

**Compare options**: [Self-hosted vs managed](https://cesteral.com/compare?utm_source=github&utm_medium=package-readme&utm_campaign=msads-mcp)

## License

Apache License 2.0 — see [LICENSE](../../LICENSE.md) for details. This package is part of Cesteral's open-source connector layer; managed hosting and higher-level governance features live outside this repository.
