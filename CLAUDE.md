# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cesteral is an AI-native programmatic advertising optimization platform built on thirteen independent MCP (Model Context Protocol) servers. Each server is purpose-built for a single ad platform with dedicated API clients and auth strategies.

**Phase: Production-Ready** — All thirteen servers are fully implemented with live API integrations.

### Server Reference

| # | Server | Port | API | Entity Types | Tools |
|---|--------|------|-----|-------------|-------|
| 1 | `dbm-mcp` | 3001 | Bid Manager API v2 | _(reporting only)_ | 6 |
| 2 | `dv360-mcp` | 3002 | DV360 API v4 | advertiser, campaign, insertionOrder, lineItem, + more | 25 |
| 3 | `ttd-mcp` | 3003 | TTD REST + GraphQL API | advertiser, campaign, adGroup, creative, conversionTracker, bidList, seed | 55 |
| 4 | `gads-mcp` | 3004 | Google Ads REST API v23 | campaign, adGroup, ad, keyword, campaignBudget, asset | 15 |
| 5 | `meta-mcp` | 3005 | Meta Marketing API v25.0 | campaign, adSet, ad, adCreative, customAudience | 25 |
| 6 | `linkedin-mcp` | 3006 | LinkedIn Marketing API v2 | adAccount, campaignGroup, campaign, creative, conversionRule | 20 |
| 7 | `tiktok-mcp` | 3007 | TikTok Marketing API v1.3 | campaign, adGroup, ad, creative | 23 |
| 8 | `cm360-mcp` | 3008 | CM360 API v5 | campaign, placement, ad, creative, site, advertiser, floodlightActivity, floodlightConfiguration | 20 |
| 9 | `snapchat-mcp` | 3009 | Snapchat Ads API v1 | campaign, adGroup, ad, creative | 22 |
| 10 | `sa360-mcp` | 3010 | SA360 Reporting API v0 + DS v2 | _(reporting + conversions)_ | 15 |
| 11 | `pinterest-mcp` | 3011 | Pinterest Ads API v5 | campaign, adGroup, ad, creative | 22 |
| 12 | `amazon-dsp-mcp` | 3012 | Amazon DSP API | order, lineItem, creative | 18 |
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
- Each MCP server exposes tools via MCP for external AI agents (Claude Desktop, etc.)

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
| `ttd-mcp` | `ttd-token`, `ttd-headers` (alias of `ttd-token`), `jwt`, `none` | `ttd-token` |
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
- SEP-2127 endpoint at `/.well-known/mcp/server-card.json` returns server discovery metadata (name, version, transports, auth modes, capabilities) on every server in every auth mode

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

### ttd-mcp — 55 Tools (Unique: Workflows API, GraphQL, Bid Lists, Seeds)

**CRUD (5):** `ttd_get_entity`, `ttd_list_entities`, `ttd_create_entity`, `ttd_update_entity`, `ttd_delete_entity`

**Bulk (4):** `ttd_bulk_create_entities`, `ttd_bulk_update_entities`, `ttd_bulk_update_status`, `ttd_adjust_bids`

**Utility (4):** `ttd_get_context` (partner IDs for current credentials), `ttd_archive_entities` (soft-delete), `ttd_validate_entity` (offline payload validation), `ttd_get_ad_preview`

**Reporting — REST (6):** `ttd_submit_report`, `ttd_check_report_status`, `ttd_download_report`, `ttd_get_report` (blocking), `ttd_list_report_types`, `ttd_get_report_type_schema`

**Reporting — GraphQL schedules/templates (15):**

| Tool | Description |
|------|-------------|
| `ttd_execute_entity_report` | Execute an immediate dimension-specific report (no polling) |
| `ttd_get_entity_report_types` | Discover available report types for an entity |
| `ttd_create_report_schedule` | Create a named recurring schedule (Once/Daily/Weekly/Monthly) |
| `ttd_update_report_schedule` | Enable or disable a report schedule |
| `ttd_delete_report_schedule` | Permanently delete a report schedule |
| `ttd_list_report_schedules` | List report schedules with optional advertiser filter |
| `ttd_get_report_schedule` | Get full details for a schedule by ID |
| `ttd_rerun_report_schedule` | Immediately rerun an existing schedule |
| `ttd_get_report_executions` | Execution status + download links |
| `ttd_cancel_report_execution` | Cancel an in-progress report execution |
| `ttd_create_report_template` | Create a user-defined report template |
| `ttd_update_report_template` | Fully replace a report template |
| `ttd_get_report_template` | Retrieve full template structure |
| `ttd_list_report_templates` | List template headers |
| `ttd_create_template_schedule` | Create a schedule from a template ID |

**Workflows API (13):** TTD's newer workflow-aware payload API (preferred over REST for campaign/ad group writes).

| Tool | Description |
|------|-------------|
| `ttd_create_campaign_workflow` | Create a campaign via Workflows API |
| `ttd_update_campaign_workflow` | Update a campaign (PATCH semantics) |
| `ttd_get_campaign_version` | Get a campaign's Workflows version payload |
| `ttd_create_ad_group_workflow` | Create an ad group via Workflows API |
| `ttd_update_ad_group_workflow` | Update an ad group (PATCH semantics) |
| `ttd_create_campaigns_job` | Async job: create multiple campaigns |
| `ttd_update_campaigns_job` | Async job: update multiple campaigns |
| `ttd_create_ad_groups_job` | Async job: create multiple ad groups |
| `ttd_update_ad_groups_job` | Async job: update multiple ad groups |
| `ttd_get_first_party_data_job` | Async job: retrieve first-party data for an advertiser |
| `ttd_get_third_party_data_job` | Async job: retrieve third-party data for a partner |
| `ttd_get_job_status` | Poll status of a Workflows job |
| `ttd_rest_request` | Escape hatch: arbitrary REST request through Workflows API |

**GraphQL (5):** `ttd_graphql_query`, `ttd_graphql_query_bulk`, `ttd_graphql_mutation_bulk`, `ttd_graphql_bulk_job` (status), `ttd_graphql_cancel_bulk_job`

**Bid Lists & Seeds (3):** `ttd_manage_bid_list` (create/get/update single), `ttd_bulk_manage_bid_lists` (batch up to 50), `ttd_manage_seed` (audience seeds via GraphQL)

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
| `sa360_update_conversions` | Update existing conversions (v2 API) | `agencyId`, `advertiserId`, `conversions[]` |
| `sa360_submit_report` | Submit async report (v2 API) | `agencyId`, `advertiserId`, `reportType` |
| `sa360_check_report_status` | Check report generation status | `reportId` |
| `sa360_download_report` | Download completed report results | `reportId` |
| `sa360_validate_conversion` | Validate conversion payload | `mode`, `conversion` |
| `sa360_get_change_history` | Get change history for entities | `customerId`, `entityType?`, `dateRange?` |

### msads-mcp — 24 Tools (Unique: Google Import, Ad Extensions, Report Scheduling)

Standard CRUD/bulk/reporting tools plus:

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `msads_manage_ad_extensions` | Add/update/delete ad extensions | `accountId`, `adExtensions[]` |
| `msads_manage_criterions` | Manage targeting criteria | `entityType`, `accountId`, `parentId?`, `items[]` |
| `msads_import_from_google` | Import campaigns from Google Ads | `operation`, `data` |
| `msads_create_report_schedule` | Create a scheduled report request | `accountId`, `scheduleName`, `reportType`, `columns`, `schedule` |
| `msads_list_report_schedules` | List scheduled reports (guidance, no API endpoint) | _(none)_ |
| `msads_delete_report_schedule` | Delete a report schedule (guidance, no API endpoint) | `scheduleId` |
| `msads_get_report_breakdowns` | Run report with additional breakdown columns | `reportType`, `accountId`, `columns`, `breakdownColumns`, dates |

### Server-Specific Notes

- **linkedin-mcp** (20 tools): URN-based entity IDs, `LinkedIn-Version: 202409` header, analytics via `/v2/adAnalytics` with pivot breakdowns
- **tiktok-mcp** (23 tools): `X-TikTok-Advertiser-Id` header in HTTP mode, image/video upload
- **cm360-mcp** (20 tools): `profileId` required on all calls, `list_user_profiles` for profile discovery, `list_targeting_options` for targeting; scheduling via `create/list/delete_report_schedule`
- **pinterest-mcp** (22 tools): cursor-based pagination via `bookmark` tokens. Video upload via `/v5/media`; image creatives reference URLs directly (Pinterest's `/v5/media` endpoint only supports `media_type="video"`)
- **snapchat-mcp** (22 tools): Ad Squads (adGroups), cursor-based pagination
- **amazon-dsp-mcp** (18 tools): Orders (campaigns), Line Items (ad groups), no hard delete (archive via status). Reporting v3 is scoped by `accountId` (DSP entity ID) in the URL path, distinct from the profile header.

### How the Servers Work Together

**Example: Fixing an underdelivering campaign**
1. **dbm-mcp** → `dbm_get_pacing_status` detects 72% pacing
2. **dbm-mcp** → `dbm_get_performance_metrics` analyzes CPMs
3. AI calculates bid adjustments
4. **dv360-mcp** → `dv360_adjust_line_item_bids` applies changes
5. Monitor delivery improvement

## Deployment & Infrastructure

- **Platform**: GCP Cloud Run (containerized)
- **Secrets**: GCP Secret Manager
- **IaC**: Terraform (`terraform/`)
- **CI/CD**: Cloud Build (`cloudbuild.yaml`)

```bash
# Test endpoints
curl -X POST http://localhost:<port>/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"ping","id":1}'
curl http://localhost:<port>/health

# View logs
gcloud run services logs tail <server-name> --region=europe-west2
```

## Key Design Principles

1. **Separation of Concerns**: One server per ad platform
2. **Stateless**: No persistent state between requests
3. **Type Safety**: Zod for runtime, TypeScript for compile-time
4. **Observability**: OTEL traces + metrics, Pino structured logs, InteractionLogger for tool-call + tool-failure persistence
5. **Scale-out-safe sessions**: the streamable-HTTP transport factory rebuilds session services on cache miss. A follow-up request whose `Mcp-Session-Id` is unknown to the receiving Cloud Run instance triggers a re-auth + `createSessionForAuth` using the client-supplied session ID. The existing credential fingerprint check runs on every call, so rebuild does not weaken session binding. Per-instance state that is *not* reconstructible from credentials (rate-limiter counters, in-memory `report-csv://` resources) may behave slightly differently after a scale-out event — documented inline in each subsystem.

## Tool Failure Logging

Every tool invocation is captured by `InteractionLogger` (`packages/shared/src/utils/interaction-logger.ts`). On failure, the entry includes the captured upstream HTTP trail (method, URL, status, redacted request/response bodies, per-attempt durations) recorded by `executeWithRetry` via `http-request-recorder.ts`.

Record shape (JSONL):

```
{ "type": "tool_failure", "ts", "sessionId", "requestId", "tool", "platform",
  "params" (redacted), "errorCode", "errorMessage", "errorData",
  "upstream": [ { "method", "url", "status", "attempt", "durationMs",
                  "requestBodyRedacted", "responseBodyRedacted",
                  "requestHeadersRedacted", "responseHeadersRedacted" } ] }
```

Destination is chosen by `INTERACTION_LOG_MODE`:

| Mode | When | Storage |
|------|------|---------|
| `gcs` | Hosted Cloud Run (default when `GCS_BUCKET_NAME` is set) | Instance-unique JSONL in GCS, flushed every 5s |
| `file` | Self-host default | Rotating JSONL at `~/.cesteral/interactions/` |
| `stdout` | Self-host with external log pipeline | Pino `info`/`error` line per entry — ship via any stdout log agent |

Query hosted data in BigQuery via an external table:

```sql
CREATE EXTERNAL TABLE mcp_interactions
OPTIONS (format='JSON',
         uris=['gs://<bucket>/<server-name>/interactions/*.jsonl']);

-- Top failing tools by platform in the last 7 days
SELECT tool, platform, JSON_VALUE(upstream[OFFSET(0)].status) AS status, COUNT(*) AS n
FROM mcp_interactions
WHERE type = 'tool_failure' AND ts > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
GROUP BY 1,2,3 ORDER BY n DESC LIMIT 50;
```

Redaction lives in `http-request-recorder.ts` (headers: Authorization, TTD-Auth, DeveloperToken, etc.; body: bearer tokens, `access_token`/`refresh_token`/`client_secret`/`password` JSON fields). Response bodies are truncated at 8 KB.

## Report CSV Spill

Large report CSVs (TTD, TikTok, Snapchat, Amazon DSP, Pinterest, MSADS) can be spilled to GCS so the MCP response stays bounded while the full body is still fetchable via a signed URL. Controlled by `@cesteral/shared`'s `spillCsvToGcs` helper, wired into each server's `download_report` tool; the helper reads these envs at call time:

| Env | Default | Behavior |
|-----|---------|----------|
| `REPORT_SPILL_BUCKET` | _(unset)_ | When unset, spill is disabled entirely — the download tool returns only the bounded view. When set, the bucket receives CSV/JSON bodies that exceed the thresholds. |
| `REPORT_SPILL_THRESHOLD_BYTES` | `16777216` (16 MB) | Minimum UTF-8 byte size that triggers a spill. |
| `REPORT_SPILL_THRESHOLD_ROWS` | `100000` | Minimum parsed row count that triggers a spill (OR'd with the byte threshold — either can fire). |
| `REPORT_SPILL_SIGNED_URL_TTL_SECONDS` | `3600` (1h) | Expiry on the V4 signed URL returned in `spill.signedUrl`. |

**Object path:** `{server}/{sessionId?}/{reportId}-{timestamp}.{csv\|json}`. Sessioned prefixes enable per-session cleanup sweeps via `SessionServiceStore.onDelete` hooks (wired in each server's `session-services.ts`). A 24-hour GCS lifecycle rule on the `report_spill` bucket (provisioned in `terraform/main.tf`) is the primary cost control; the session hook is a belt-and-braces deletion that runs earlier when possible.

**Failure modes never break the response.** If spill is enabled but the GCS write fails (permissions, quota, network), the download tool returns `{ spill: { error } }` plus a bounded-view warning, not an error — callers always get their summary/rows.

Terraform variables `enable_report_spill` + `report_spill_bucket_name` gate the bucket provisioning.

## TypeScript Build Issues

If you encounter "The inferred type cannot be named" errors, add explicit return type annotations:
```typescript
export function createMcpHttpServer(): express.Application { ... }
```

## Working with Multiple Packages

1. Make changes to `@cesteral/shared`
2. Build from root: `pnpm run build` (Turborepo handles dependency order)
3. Changes automatically available via workspace protocol (`workspace:*`)
