# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

## Project Overview

Cesteral is an AI-native programmatic advertising optimization platform built on thirteen independent MCP (Model Context Protocol) servers. Each server is purpose-built for a single ad platform with dedicated API clients and auth strategies.

**Phase: Production-Ready** — All thirteen servers are fully implemented with live API integrations.

### Server Reference

| # | Server | Port | API | Entity Types | Tools |
|---|--------|------|-----|-------------|-------|
| 1 | `dbm-mcp` | 3001 | Bid Manager API v2 | _(reporting only)_ | 6 |
| 2 | `dv360-mcp` | 3002 | DV360 API v4 | advertiser, campaign, insertionOrder, lineItem, + more | 25 |
| 3 | `ttd-mcp` | 3003 | TTD REST API | advertiser, campaign, adGroup, ad, creative, siteList, deal, conversionTracker, bidList | 36 |
| 4 | `gads-mcp` | 3004 | Google Ads REST API v23 | campaign, adGroup, ad, keyword, campaignBudget, asset | 15 |
| 5 | `meta-mcp` | 3005 | Meta Marketing API v24.0 | campaign, adSet, ad, adCreative, customAudience | 25 |
| 6 | `linkedin-mcp` | 3006 | LinkedIn Marketing API v2 | adAccount, campaignGroup, campaign, creative, conversionRule | 20 |
| 7 | `tiktok-mcp` | 3007 | TikTok Marketing API v1.3 | campaign, adGroup, ad, creative | 23 |
| 8 | `cm360-mcp` | 3008 | CM360 API v5 | campaign, placement, ad, creative, site, advertiser, floodlightActivity, floodlightConfiguration | 20 |
| 9 | `snapchat-mcp` | 3009 | Snapchat Ads API v1 | campaign, adGroup, ad, creative | 23 |
| 10 | `sa360-mcp` | 3010 | SA360 Reporting API v0 + DS v2 | _(reporting + conversions)_ | 15 |
| 11 | `pinterest-mcp` | 3011 | Pinterest Ads API v5 | campaign, adGroup, ad, creative | 23 |
| 12 | `amazon-dsp-mcp` | 3012 | Amazon DSP API | order, lineItem, creative | 19 |
| 13 | `msads-mcp` | 3013 | Microsoft Advertising REST API v13 | campaign, adGroup, ad, keyword, budget, adExtension, audience, label | 24 |

## Essential Commands

```bash
pnpm install                          # Install dependencies
pnpm run build                        # Build all packages (Turborepo)
pnpm run typecheck                    # Type check all packages
pnpm run test                         # Run all tests
pnpm run clean                        # Clean build artifacts

# Run any server locally (uses correct port automatically)
./scripts/dev-server.sh <server-name> # e.g. ./scripts/dev-server.sh dv360-mcp

# Or run directly
cd packages/<server-name> && pnpm run dev:http

# Build/test/typecheck single package
cd packages/<server-name> && pnpm run build
cd packages/<server-name> && pnpm run test
cd packages/<server-name> && pnpm run typecheck
```

**Critical**: When modifying `@cesteral/shared`, rebuild all packages with `pnpm run build`.

## Monorepo Architecture

**pnpm workspace** monorepo managed by **Turborepo**. Workspace: `@cesteral/shared` (types, utilities, auth) + 13 MCP server packages.

- Build pipeline: `build` → `^build` (deps first), `typecheck`/`test` depend on `^build`
- ES modules, Target: ES2022, moduleResolution: bundler
- Each MCP server exposes tools via MCP for external AI agents and MCP clients

## MCP Server Architecture Pattern

```
packages/{server-name}/src/
├── index.ts                              # Entry point
├── config/                               # Environment configuration
├── mcp-server/
│   ├── tools/definitions/{tool}.tool.ts  # Individual tool files
│   ├── tools/index.ts                    # Exports allTools array
│   └── transports/streamable-http-transport.ts  # Hono + @hono/mcp
├── services/                             # Business logic + session services
└── utils/
```

### Creating a New MCP Tool

Each tool is a single file in `src/mcp-server/tools/definitions/` exporting three things:
1. **Zod schema** for parameter validation
2. **Tool metadata** object with `name`, `description`, `inputSchema`
3. **Handler function** that returns `{ content: [{ type: "text", text: ... }] }`

Register by importing the tool definition in `tools/index.ts` and adding to the `allTools` array. `registerToolsFromDefinitions()` picks it up automatically — no switch statements or transport changes.

Tool handlers should focus on business logic; errors propagate to the factory's try/catch wrapper.

### Session Service Pattern

Per-session service instances hold authenticated API clients. Key components in `src/services/session-services.ts`:
- `SessionServiceStore<SessionServices>` — typed map from sessionId → services
- `createSessionServices()` — called on new session connect
- `resolveSessionServices(sdkContext)` — called inside tool handlers

Lifecycle: created on connect → available via `resolveSessionServices()` → cleaned up on close/timeout.

### Dynamic Schema Pattern (DV360 MCP)

Full discriminated union schemas exceed ~1MB (EPIPE on stdio). Solution: simplified schemas for tool registration + MCP Resources for full details on-demand.

- Entity types declared in `STATIC_ENTITY_API_METADATA` in `entity-mapping-dynamic.ts`
- Resource URIs: `entity-schema://{type}`, `entity-fields://{type}`, `entity-examples://{type}`
- Adding new entity: add 5-line entry to `STATIC_ENTITY_API_METADATA`; schemas/resources auto-generated
- Test sizes: `cd packages/dv360-mcp && node tests/test-schema-size.cjs`

### MCP Prompts

On-demand workflow guidance for complex multi-step operations. Located in `src/mcp-server/prompts/`. Register in `prompts/index.ts` via `promptRegistry` Map.

Available: `full_campaign_setup_workflow` (dv360-mcp), `msads_import_from_google` (msads-mcp)

## Auth Mode Configuration

Each server has its own `MCP_AUTH_MODE` options:

| Server | Auth Modes | Default |
|--------|-----------|---------|
| `dbm-mcp`, `dv360-mcp` | `google-headers`, `jwt`, `none` | `google-headers` |
| `gads-mcp` | `gads-headers`, `jwt`, `none` | `gads-headers` |
| `cm360-mcp` | `google-headers`, `jwt`, `none` | `google-headers` |
| `ttd-mcp` | `ttd-token`, `jwt`, `none` | `ttd-token` |
| `meta-mcp` | `meta-bearer`, `jwt`, `none` | `meta-bearer` |
| `linkedin-mcp` | `linkedin-bearer`, `jwt`, `none` | `linkedin-bearer` |
| `tiktok-mcp` | `tiktok-bearer`, `jwt`, `none` | `tiktok-bearer` |
| `sa360-mcp` | `sa360-headers`, `jwt`, `none` | `sa360-headers` |
| `pinterest-mcp` | `pinterest-bearer`, `jwt`, `none` | `pinterest-bearer` |
| `snapchat-mcp` | `snapchat-bearer`, `jwt`, `none` | `snapchat-bearer` |
| `amazon-dsp-mcp` | `amazon-dsp-bearer`, `jwt`, `none` | `amazon-dsp-bearer` |
| `msads-mcp` | `msads-bearer`, `jwt`, `none` | `msads-bearer` |

- `MCP_AUTH_SECRET_KEY`: required for `jwt` mode
- RFC 9728 endpoint at `/.well-known/oauth-protected-resource` returns metadata in `jwt` mode

## Common Development Patterns

```typescript
// Error handling — use McpError or ErrorHandler from shared
import { McpError, ErrorHandler, JsonRpcErrorCode } from "@cesteral/shared";
// Generic: throw McpError.fromError(error)
// Domain-specific: throw new SomeError(message, { code: JsonRpcErrorCode.InternalError })
// In catch blocks: throw SomeDomainError.fromApiError(error)

// Logging — structured via Pino
import { createLogger } from "@cesteral/shared";
const logger = createLogger("component-name");

// Schema validation — always Zod
const params = schema.parse(rawInput);
```

## MCP Tools Catalog

### Standard Tool Pattern

Most servers (linkedin, tiktok, cm360, pinterest, snapchat, amazon-dsp) follow this pattern. Only unique tools per server are listed in detail below.

| Category | Tools | Description |
|----------|-------|-------------|
| **CRUD** | `{prefix}_list_entities`, `get_entity`, `create_entity`, `update_entity`, `delete_entity` | Standard entity CRUD |
| **Account** | `{prefix}_list_accounts` / `list_advertisers` / `list_profiles` | List accessible accounts |
| **Reporting** | `{prefix}_get_report`, `get_report_breakdowns`, `submit_report`, `check_report_status`, `download_report` | Async report flow (submit → poll → download) |
| **Bulk** | `{prefix}_bulk_create_entities`, `bulk_update_entities`, `bulk_update_status`, `adjust_bids` | Batch operations (up to 50) |
| **Targeting** | `{prefix}_search_targeting`, `get_targeting_options` | Audience/interest search |
| **Specialized** | `{prefix}_duplicate_entity`, `get_delivery_estimate`/`get_audience_estimate`, `get_ad_preview`, `validate_entity` | Copy, preview, validate |
| **Media** | `{prefix}_upload_image`, `upload_video` | Binary upload via URL (where supported) |

### dbm-mcp — 6 Tools (Reporting Only)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `dbm_get_campaign_delivery` | Fetch delivery metrics via Bid Manager API | `campaignId`, `advertiserId`, `startDate`, `endDate` |
| `dbm_get_performance_metrics` | Calculate CPM, CTR, CPA, ROAS | `campaignId`, `advertiserId`, `dateRange` |
| `dbm_get_historical_metrics` | Time-series data for trends | `campaignId`, `advertiserId`, `startDate`, `endDate`, `granularity` |
| `dbm_get_pacing_status` | Real-time pacing calculation | `campaignId`, `advertiserId` |
| `dbm_run_custom_query` | Execute custom Bid Manager reports (blocking) | `reportType`, `timeRange`, `metrics`, `dimensions`, `filters` |
| `dbm_run_custom_query_async` | Submit custom query (non-blocking, task-based) | `reportType`, `timeRange`, `metrics`, `dimensions`, `filters` |

### dv360-mcp — 25 Tools (Unique Tools Beyond Standard Pattern)

Standard CRUD/bulk/targeting/validation/preview tools plus:

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `dv360_adjust_line_item_bids` | Batch adjust line item bids | `advertiserId`, `adjustments[]` |
| `dv360_create_custom_bidding_algorithm` | Create custom bidding algorithm | `advertiserId`, `data` |
| `dv360_manage_custom_bidding_script` | Upload/manage custom bidding scripts | `algorithmId`, `data` |
| `dv360_manage_custom_bidding_rules` | Manage rules for custom bidding | `algorithmId`, `data` |
| `dv360_list_custom_bidding_algorithms` | List custom bidding algorithms | `advertiserId`, filters |
| `dv360_list_assigned_targeting` | List assigned targeting options | `entityType`, entity IDs |
| `dv360_get_assigned_targeting` | Get specific targeting assignment | `entityType`, entity IDs, `targetingType` |
| `dv360_create_assigned_targeting` | Create targeting assignment | `entityType`, entity IDs, `data` |
| `dv360_delete_assigned_targeting` | Delete targeting assignment | `entityType`, entity IDs, `targetingType` |
| `dv360_validate_targeting_config` | Validate targeting configuration | `entityType`, entity IDs, `config` |
| `dv360_duplicate_entity` | Copy/duplicate entities | `entityType`, entity IDs, `options?` |
| `dv360_get_delivery_estimate` | Audience size and delivery estimation | `advertiserId`, `targetingConfig` |
| `dv360_upload_image` | Upload image from URL | `advertiserId`, `mediaUrl`, `name?` |
| `dv360_upload_video` | Upload video from URL | `advertiserId`, `mediaUrl`, `title?` |

### ttd-mcp — 28 Tools (Unique: GraphQL)

Standard CRUD/bulk/reporting/preview/validate tools plus:

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `ttd_archive_entities` | Batch archive (soft-delete) | `entityType`, `entityIds[]` |
| `ttd_graphql_query` | Execute GraphQL query/mutation | `query`, `variables` |
| `ttd_graphql_query_bulk` | Bulk GraphQL queries | `query`, `variables[]` |
| `ttd_graphql_mutation_bulk` | Bulk GraphQL mutations | `mutation`, `inputs[]` |
| `ttd_graphql_bulk_job` | Check async bulk GraphQL job status | `jobId` |
| `ttd_graphql_cancel_bulk_job` | Cancel bulk GraphQL query job | `jobId` |
| `ttd_execute_entity_report` | Execute immediate entity report via GraphQL (no polling) | `entityType`, `entityId`, `reportType` |
| `ttd_get_entity_report_types` | Discover available report types for an entity | `entityType`, `entityId`, `tile` |
| `ttd_create_report_schedule` | Create named recurring report schedule | `reportName`, `scheduleType`, `dateRange` |
| `ttd_delete_report_schedule` | Delete a report schedule | `scheduleId` |
| `ttd_list_report_schedules` | List report schedules with optional advertiser filter | `advertiserIds?`, `pageSize?` |
| `ttd_get_report_schedule` | Get a specific report schedule by ID | `scheduleId` |
| `ttd_list_report_templates` | List read-only report templates created in TTD UI | `pageSize?` |
| `ttd_create_report_template` | Create a user-defined report template via GraphQL | `name`, `format`, `resultSets[]` |
| `ttd_update_report_template` | Update (fully replace) a report template via GraphQL | `id`, `name`, `resultSets[]` |
| `ttd_get_report_template` | Get full structure of a report template via GraphQL | `id` |
| `ttd_create_template_schedule` | Create a report schedule from a template ID via GraphQL | `templateId`, `reportName`, `frequency`, `dateRange` |
| `ttd_update_report_schedule` | Enable or disable a report schedule via GraphQL | `scheduleId`, `status` |
| `ttd_cancel_report_execution` | Cancel an in-progress report execution via GraphQL | `executionId` |
| `ttd_rerun_report_schedule` | Immediately rerun an existing schedule via GraphQL | `scheduleId` |
| `ttd_get_report_executions` | Get schedule execution status + download links via GraphQL | `scheduleId?`, `lastStatusChangeAfter?`, `first?` |

### gads-mcp — 15 Tools (Unique: GAQL)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `gads_gaql_search` | Execute arbitrary GAQL queries | `customerId`, `query`, `pageSize` |
| `gads_list_accounts` | List accessible customer accounts | _(none)_ |
| `gads_get_insights` | Performance insights with presets | `customerId`, `entityType`, `dateRange` |
| `gads_bulk_mutate` | Multi-operation mutate (create+update+remove) | `entityType`, `customerId`, `operations[]` |

Plus standard CRUD (`get_entity`, `list_entities`, `create_entity`, `update_entity`, `remove_entity`), `bulk_create_entities`, `bulk_update_status`, `adjust_bids`, `validate_entity`, `get_ad_preview`.

### meta-mcp — 25 Tools (Unique: Insights, Delivery, Budget Schedules, Async Reporting, Pacing)

Standard CRUD/bulk/targeting/media tools plus:

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `meta_list_ad_accounts` | List accessible ad accounts | `fields`, `limit` |
| `meta_get_insights` | Performance metrics for an entity | `entityId`, `fields`, `datePreset`, `timeRange` |
| `meta_get_insights_breakdowns` | Metrics with dimensional breakdowns | `entityId`, `breakdowns`, `fields`, `datePreset` |
| `meta_duplicate_entity` | Copy campaigns/adSets/ads | `entityId`, `options` |
| `meta_get_delivery_estimate` | Audience size estimation (reachestimate with delivery_estimate fallback) | `adAccountId`, `targetingSpec` |
| `meta_manage_budget_schedule` | Create/list budget schedules for high-demand periods | `operation`, `campaignId`, `data` |

### sa360-mcp — 15 Tools (Reporting + Conversions)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `sa360_search` | Execute SA360 query language queries | `customerId`, `query`, `pageSize?` |
| `sa360_list_accounts` | List accessible accounts | _(none)_ |
| `sa360_get_entity` | Get entity by type/ID | `entityType`, `customerId`, `entityId` |
| `sa360_list_entities` | List entities with filters | `entityType`, `customerId`, `filters?` |
| `sa360_get_insights` | Performance insights | `customerId`, `entityType`, `dateRange` |
| `sa360_get_insights_breakdowns` | Metrics with segment breakdowns | `customerId`, `entityType`, `dateRange`, `breakdowns[]` |
| `sa360_list_custom_columns` | List custom columns | `customerId` |
| `sa360_search_fields` | Search available query fields | `query?`, `resourceType?` |
| `sa360_insert_conversions` | Insert offline conversions (v2 API) | `agencyId`, `advertiserId`, `conversions[]` |
