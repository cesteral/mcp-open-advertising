# @cesteral/cm360-mcp

**Campaign Manager 360 MCP Server** -- Ad serving, trafficking, and Floodlight conversion management via CM360 API v5.

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](../../LICENSE.md)
[![MCP](https://img.shields.io/badge/MCP-2025--11--25-green)](https://modelcontextprotocol.io/)

---

## Overview

`cm360-mcp` is a Model Context Protocol (MCP) server that enables AI agents to manage Campaign Manager 360 campaigns, placements, ads, creatives, Floodlight activities, and generate delivery reports -- all via MCP tools.

CM360 complements the existing Google stack in this monorepo:
- **dbm-mcp** -- DV360 reporting (Bid Manager API v2)
- **dv360-mcp** -- DV360 campaign management (DV360 API v4)
- **cm360-mcp** -- Ad serving & trafficking (CM360 API v5)

**API**: CM360 Reporting API v5 (`https://dfareporting.googleapis.com/dfareporting/v5`)
**Auth**: Google OAuth2 via `GoogleAuthAdapter` (same pattern as dbm-mcp/dv360-mcp)
**Port**: 3008

---

## Quick Start

### Prerequisites

- Node.js >= 20
- pnpm >= 8
- Google Cloud service account with CM360 API access (scopes: `dfareporting` for reporting, `dfatrafficking` for entity CRUD)

### 1. Install & Build

```bash
# From monorepo root
pnpm install
pnpm run build

# Or build just cm360-mcp
cd packages/cm360-mcp && pnpm run build
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Choose one:
CM360_SERVICE_ACCOUNT_FILE=/path/to/service-account.json
# or
CM360_SERVICE_ACCOUNT_JSON=<base64-encoded-json>

# Auth mode (use 'none' for local dev)
MCP_AUTH_MODE=none
```

### 3. Run

```bash
# Via dev script (from monorepo root)
./scripts/dev-server.sh cm360-mcp

# Or directly
cd packages/cm360-mcp && pnpm run dev:http
```

### 4. Verify

```bash
# Health check
curl http://localhost:3008/health

# MCP ping
curl -X POST http://localhost:3008/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"ping","id":1}'

# List tools
curl -X POST http://localhost:3008/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":2}'
```

---

## Authentication

### HTTP Mode (Streamable HTTP Transport)

Three auth modes, configured via `MCP_AUTH_MODE`:

| Mode | Header | Use Case |
|------|--------|----------|
| `google-headers` | `X-Google-Auth-Type` + credential headers | Production (per-session Google creds) |
| `jwt` | `Authorization: Bearer <jwt>` | Centralized or governed deployments |
| `none` | _(no auth)_ | Local development |

**Google Headers mode** -- clients pass Google OAuth2 credentials via HTTP headers on each session:
- `X-Google-Auth-Type`: `service_account` or `oauth2`
- `X-Google-Credentials`: base64-encoded service account JSON (for SA)
- `X-Google-Client-Id` / `X-Google-Client-Secret` / `X-Google-Refresh-Token` (for OAuth2)

### Stdio Mode (Claude Desktop)

Set credentials via environment variables:

```env
CM360_SERVICE_ACCOUNT_FILE=/path/to/service-account.json
# or
CM360_SERVICE_ACCOUNT_JSON=<base64-encoded-json>
```

---

## Entity Types

CM360 entities managed by this server:

| Entity Type | API Collection | Supports Delete | Notes |
|---|---|---|---|
| `campaign` | campaigns | No | Archive via status update |
| `placement` | placements | No | |
| `ad` | ads | No | |
| `creative` | creatives | No | |
| `site` | sites | No | |
| `advertiser` | advertisers | No | |
| `floodlightActivity` | floodlightActivities | Yes | Conversion tracking |
| `floodlightConfiguration` | floodlightConfigurations | No | Floodlight setup |

All API paths follow: `GET/POST/PUT/DELETE /userprofiles/{profileId}/{collection}[/{id}]`

---

## MCP Tools Reference (16 Tools)

### Bootstrap

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `cm360_list_user_profiles` | List accessible CM360 user profiles | _(none)_ |

> Call this first to discover your `profileId` -- required for all other operations.

### Core CRUD

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `cm360_list_entities` | List entities with filters/pagination | `profileId`, `entityType`, `filters?`, `pageToken?`, `maxResults?` |
| `cm360_get_entity` | Get a single entity by ID | `profileId`, `entityType`, `entityId` |
| `cm360_create_entity` | Create any supported entity | `profileId`, `entityType`, `data` |
| `cm360_update_entity` | Update entity (PUT semantics -- full object required) | `profileId`, `entityType`, `entityId`, `data` |
| `cm360_delete_entity` | Delete entity (floodlightActivity only) | `profileId`, `entityType`, `entityId` |
| `cm360_validate_entity` | Dry-run validate payload (no API call) | `entityType`, `mode`, `data` |

**CM360 update pattern**: CM360 uses PUT (full replacement), not PATCH. Always fetch the current entity with `cm360_get_entity` first, modify the fields you need, then pass the complete object to `cm360_update_entity`.

### Reporting

CM360 reports are asynchronous. Two workflows available:

**Blocking (simple):**
1. `cm360_get_report` -- creates, runs, and polls until complete (30-120s)

**Non-blocking (for long reports):**
1. `cm360_submit_report` -- creates and runs, returns immediately
2. `cm360_check_report_status` -- poll until `REPORT_AVAILABLE`
3. `cm360_download_report` -- fetch and parse results

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `cm360_get_report` | Create + run + poll (blocking) | `profileId`, `name`, `type`, `criteria?` |
| `cm360_submit_report` | Create + run (non-blocking) | `profileId`, `name`, `type`, `criteria?` |
| `cm360_check_report_status` | Single status check | `profileId`, `reportId`, `fileId` |
| `cm360_download_report` | Download and parse CSV results | `downloadUrl`, `maxRows?` |

**Report types**: `STANDARD`, `REACH`, `PATH_TO_CONVERSION`, `CROSS_DIMENSION_REACH`, `FLOODLIGHT`

**Report statuses**: `PROCESSING` -> `REPORT_AVAILABLE` | `FAILED` | `CANCELLED`

### Bulk Operations

No native batch API -- bulk tools loop individual calls with rate limiting. At ~1 QPS, 50 items takes ~50 seconds.

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `cm360_bulk_update_status` | Batch status updates (up to 50) | `profileId`, `entityType`, `entityIds[]`, `status` |
| `cm360_bulk_create_entities` | Batch entity creation (up to 50) | `profileId`, `entityType`, `items[]` |
| `cm360_bulk_update_entities` | Batch entity updates (up to 50) | `profileId`, `entityType`, `items[]` |

### Specialized

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `cm360_get_ad_preview` | Get ad details and click-through configuration | `profileId`, `adId` |
| `cm360_list_targeting_options` | Browse targeting options (browsers, OS, geo, etc.) | `profileId`, `targetingType` |

**Targeting types**: `browsers`, `connectionTypes`, `contentCategories`, `countries`, `languages`, `metros`, `mobileCarriers`, `operatingSystemVersions`, `operatingSystems`, `platformTypes`, `postalCodes`, `regions`, `cities`

---

## Example Workflows

### Discover Profiles and List Campaigns

```
1. cm360_list_user_profiles
   -> profileId: "123456"

2. cm360_list_entities
   -> profileId: "123456", entityType: "campaign", maxResults: 50

3. cm360_list_entities
   -> profileId: "123456", entityType: "placement",
      filters: { campaignIds: "789012" }
```

### Generate a Delivery Report

```
1. cm360_get_report
   -> profileId: "123456"
      name: "Campaign Delivery - Last 7 Days"
      type: "STANDARD"
      criteria: {
        dateRange: { relativeDateRange: "LAST_7_DAYS" },
        dimensions: [{ name: "campaign" }, { name: "date" }],
        metricNames: ["impressions", "clicks", "totalConversions", "mediaCost"]
      }

2. cm360_download_report
   -> downloadUrl: "<url from step 1>"
      maxRows: 500
```

### Set Up Floodlight Tracking

```
1. cm360_list_entities
   -> profileId: "123456", entityType: "floodlightConfiguration",
      filters: { advertiserId: "789" }

2. cm360_create_entity
   -> profileId: "123456", entityType: "floodlightActivity"
      data: {
        name: "Purchase Confirmation",
        floodlightConfigurationId: "456",
        floodlightActivityGroupId: "111",
        countingMethod: "STANDARD_COUNTING"
      }
```

### Archive Campaigns in Bulk

```
1. cm360_bulk_update_status
   -> profileId: "123456", entityType: "campaign",
      entityIds: ["111", "222", "333"], status: "ARCHIVED"
```

---

## Configuration Reference

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CM360_MCP_PORT` | No | `3008` | HTTP server port |
| `CM360_MCP_HOST` | No | `0.0.0.0` | HTTP server host |
| `MCP_AUTH_MODE` | No | `google-headers` | Auth mode: `google-headers`, `jwt`, `none` |
| `MCP_AUTH_SECRET_KEY` | If jwt | -- | JWT signing secret |
| `CM360_API_BASE_URL` | No | `https://dfareporting.googleapis.com/dfareporting/v5` | CM360 API base URL |
| `CM360_RATE_LIMIT_PER_MINUTE` | No | `50` | API rate limit (requests/min) |
| `CM360_SERVICE_ACCOUNT_FILE` | Stdio | -- | Path to service account JSON |
| `CM360_SERVICE_ACCOUNT_JSON` | Stdio | -- | Base64-encoded service account JSON |
| `MCP_SESSION_MODE` | No | `auto` | Session mode: `stateless`, `stateful`, `auto` |
| `MCP_STATEFUL_SESSION_TIMEOUT_MS` | No | `3600000` | Session timeout (ms) |
| `MCP_ALLOWED_ORIGINS` | No | -- | CORS allowed origins (comma-separated) |
| `OTEL_ENABLED` | No | `false` | Enable OpenTelemetry |
| `OTEL_SERVICE_NAME` | No | `cm360-mcp` | OTEL service name |
| `LOG_LEVEL` | No | `info` | Log level |

### Rate Limiting

CM360 API quota: ~50K requests/day (~1 QPS sustained). The server enforces a configurable rate limit (default: 50 requests/minute) with automatic retry on 429 responses using exponential backoff.

---

## Architecture

```
packages/cm360-mcp/
├── src/
│   ├── index.ts                          # Entry point (bootstrap)
│   ├── config/
│   │   └── index.ts                      # Zod-validated config from env
│   ├── types-global/
│   │   └── mcp.ts                        # Re-exported shared types
│   ├── services/
│   │   ├── session-services.ts           # Per-session service store
│   │   └── cm360/
│   │       ├── cm360-http-client.ts      # Authenticated HTTP client (retry, backoff)
│   │       ├── cm360-service.ts          # CRUD operations
│   │       └── cm360-reporting-service.ts # Async report workflow
│   ├── mcp-server/
│   │   ├── server.ts                     # McpServer setup + tool registration
│   │   ├── transports/
│   │   │   └── streamable-http-transport.ts  # Hono + @hono/mcp transport
│   │   ├── tools/
│   │   │   ├── index.ts                  # Barrel export
│   │   │   ├── utils/
│   │   │   │   ├── entity-mapping.ts     # Entity type -> API collection mapping
│   │   │   │   └── resolve-session.ts    # Session service resolution
│   │   │   └── definitions/
│   │   │       ├── index.ts              # allTools array
│   │   │       ├── list-user-profiles.tool.ts
│   │   │       ├── list-entities.tool.ts
│   │   │       ├── get-entity.tool.ts
│   │   │       ├── create-entity.tool.ts
│   │   │       ├── update-entity.tool.ts
│   │   │       ├── delete-entity.tool.ts
│   │   │       ├── validate-entity.tool.ts
│   │   │       ├── get-report.tool.ts
│   │   │       ├── submit-report.tool.ts
│   │   │       ├── check-report-status.tool.ts
│   │   │       ├── download-report.tool.ts
│   │   │       ├── bulk-update-status.tool.ts
│   │   │       ├── bulk-create-entities.tool.ts
│   │   │       ├── bulk-update-entities.tool.ts
│   │   │       ├── get-ad-preview.tool.ts
│   │   │       └── list-targeting-options.tool.ts
│   │   ├── prompts/
│   │   │   └── index.ts                  # Empty registry (extensible)
│   │   └── resources/
│   │       └── index.ts                  # Empty registry (extensible)
│   └── utils/
│       ├── errors/
│       │   └── index.ts                  # Re-exported shared error types
│       ├── security/
│       │   └── rate-limiter.ts           # Pre-configured CM360 rate limiter
│       └── telemetry/
│           ├── tracing.ts                # OTEL + withCM360ApiSpan helper
│           └── index.ts                  # Barrel export
├── .env.example
├── package.json
└── tsconfig.json
```

---

## Claude Desktop Configuration

### Stdio (Local)

```json
{
  "mcpServers": {
    "cesteral-cm360": {
      "command": "node",
      "args": ["packages/cm360-mcp/dist/index.js"],
      "env": {
        "CM360_SERVICE_ACCOUNT_FILE": "/path/to/service-account.json"
      }
    }
  }
}
```

### HTTP (Self-hosted)

```json
{
  "mcpServers": {
    "cesteral-cm360": {
      "url": "https://cm360.your-domain.com/mcp",
      "apiKey": "your-api-key"
    }
  }
}
```

---

## Development

```bash
# Build
pnpm run build

# Type check
pnpm run typecheck

# Run tests
pnpm run test

# Dev mode (auto-reload)
pnpm run dev:http

# Lint
pnpm run lint
```

---

---

## Get Started

**Self-host**: Follow the [deployment guide](../../docs/guides/deployment-instructions.md) to run this server on your own infrastructure.

**Cesteral Intelligence**: [Request access](https://cesteral.com/integrations/campaign-manager-360?utm_source=github&utm_medium=package-readme&utm_campaign=cm360-mcp) -- governed execution with credential brokering, approvals, audit, and multi-tenant access.

**Book a workflow demo**: [See it in action](mailto:sales@cesteral.com?subject=Workflow%20demo%20-%20Campaign%20Manager%20360%20MCP) with your own ad accounts.

**Compare options**: [OSS connectors vs Cesteral Intelligence](https://cesteral.com/compare?utm_source=github&utm_medium=package-readme&utm_campaign=cm360-mcp)

## License

[Apache License 2.0](../../LICENSE.md)
