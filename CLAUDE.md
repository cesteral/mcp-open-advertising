# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cesteral is an AI-native programmatic advertising optimization platform built on eight independent MCP (Model Context Protocol) servers. The architecture enables clean separation between reporting (dbm-mcp), DV360 campaign management (dv360-mcp), The Trade Desk campaign management (ttd-mcp), Google Ads campaign management (gads-mcp), Meta Ads campaign management (meta-mcp), LinkedIn Ads management (linkedin-mcp), TikTok Ads management (tiktok-mcp), and shared media library (media-mcp).

### Current Project Status

**Phase: Production-Ready ✅**

All eight MCP servers are fully implemented with live API integrations:
- **dbm-mcp**: Bid Manager API v2 for DV360 reporting
- **dv360-mcp**: DV360 API v4 for campaign entity management
- **ttd-mcp**: TTD REST API for The Trade Desk campaign management & reporting
- **gads-mcp**: Google Ads REST API v23 for Google Ads campaign management & reporting
- **meta-mcp**: Meta Marketing API v21.0 for Meta Ads campaign management
- **linkedin-mcp**: LinkedIn Marketing API v2 for LinkedIn Ads management (port 3006)
- **tiktok-mcp**: TikTok Marketing API v1.3 for TikTok Ads management (port 3007)
- **media-mcp**: Supabase Storage-backed media library for upload-once-use-everywhere workflows (port 3008)

## Essential Commands

### Build & Development
```bash
# Install dependencies (first time only)
pnpm install

# Build all packages (via Turborepo)
pnpm run build

# Run specific server in development mode
cd packages/dbm-mcp && pnpm run dev:http
cd packages/dv360-mcp && pnpm run dev:http
cd packages/ttd-mcp && pnpm run dev:http
cd packages/gads-mcp && pnpm run dev:http
cd packages/meta-mcp && pnpm run dev:http
cd packages/linkedin-mcp && pnpm run dev:http
cd packages/tiktok-mcp && pnpm run dev:http
cd packages/media-mcp && pnpm run dev:http

# Type checking across all packages
pnpm run typecheck

# Run tests
pnpm run test

# Clean all build artifacts
pnpm run clean
```

### Testing Individual Packages
```bash
# Build single package
cd packages/dbm-mcp && pnpm run build

# Test single package
cd packages/shared && pnpm run test

# Type check single package
cd packages/dv360-mcp && pnpm run typecheck
```

### Running Servers Locally
Use the dev-server script (automatically uses correct port for each server):
```bash
# Start dbm-mcp (port 3001)
./scripts/dev-server.sh dbm-mcp

# Start dv360-mcp (port 3002)
./scripts/dev-server.sh dv360-mcp

# Start ttd-mcp (port 3003)
./scripts/dev-server.sh ttd-mcp

# Start gads-mcp (port 3004)
./scripts/dev-server.sh gads-mcp

# Start meta-mcp (port 3005)
./scripts/dev-server.sh meta-mcp

# Start linkedin-mcp (port 3006)
./scripts/dev-server.sh linkedin-mcp

# Start tiktok-mcp (port 3007)
./scripts/dev-server.sh tiktok-mcp

# Start media-mcp (port 3008)
./scripts/dev-server.sh media-mcp
```

## Monorepo Architecture

This is a **pnpm workspace** monorepo managed by **Turborepo**. The workspace consists of:

### Core Packages
1. **`@cesteral/shared`** - Shared types, utilities, authentication (Zod schemas, logging via Pino, JWT auth via Jose)

### Eight MCP Servers
1. **`@cesteral/dbm-mcp`** - DV360 reporting queries via Bid Manager API v2 (read-only)
2. **`@cesteral/dv360-mcp`** - DV360 campaign entity management (CRUD via DV360 API & SDF files)
3. **`@cesteral/ttd-mcp`** - The Trade Desk campaign management & reporting (CRUD via TTD REST API)
4. **`@cesteral/gads-mcp`** - Google Ads campaign management & reporting (CRUD via Google Ads REST API v23)
5. **`@cesteral/meta-mcp`** - Meta Ads campaign management (CRUD via Meta Marketing API v21.0)
6. **`@cesteral/linkedin-mcp`** - LinkedIn Ads campaign management (CRUD via LinkedIn Marketing API v2)
7. **`@cesteral/tiktok-mcp`** - TikTok Ads campaign management (CRUD via TikTok Marketing API v1.3)
8. **`@cesteral/media-mcp`** - Shared media library backed by Supabase Storage (upload-once-use-everywhere)

**Important**: Each MCP server exposes tools via the Model Context Protocol (MCP) for external AI agents (Claude Desktop, etc.).

## Build System & Dependencies

### Turborepo Task Pipeline
Build tasks have dependencies defined in `turbo.json`:
- `build` depends on `^build` (dependencies build first)
- `typecheck` depends on `^build`
- `test` depends on `^build`

**Critical**: When modifying `@cesteral/shared`, rebuild all packages:
```bash
pnpm run build
```

### TypeScript Configuration
- Root `tsconfig.json` sets base config
- Each package has its own `tsconfig.json` extending the root
- Uses ES modules (`"type": "module"` in package.json)
- Target: ES2022, Module: ESNext, moduleResolution: bundler

## MCP Server Architecture Pattern

Each MCP server follows this structure:

```
packages/{server-name}/
├── src/
│   ├── index.ts                    # Entry point (starts HTTP server)
│   ├── config/                     # Environment configuration
│   ├── mcp-server/
│   │   ├── tools/                  # MCP tool definitions
│   │   │   ├── index.ts            # Exports all tools
│   │   │   └── definitions/        # Individual tool files
│   │   │       └── {tool-name}.tool.ts
│   │   └── transports/
│   │       └── streamable-http-transport.ts  # Hono app with Streamable HTTP transport (@hono/mcp)
│   ├── services/                   # Business logic services
│   └── utils/                      # Helper utilities
```


### Creating a New MCP Tool

Each tool should be a single file in `src/mcp-server/tools/definitions/`:

```typescript
// Example: get-campaign-delivery.tool.ts (dbm-mcp)
import { z } from "zod";

// 1. Define Zod schema for parameters
export const getCampaignDeliveryParamsSchema = z.object({
  campaignId: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  advertiserId: z.string(),
});

// 2. Define tool metadata for MCP
export const getCampaignDeliveryTool = {
  name: "get_campaign_delivery",
  description: "Fetch DV360 delivery metrics for a campaign via Bid Manager API",
  inputSchema: {
    type: "object",
    properties: {
      campaignId: { type: "string", description: "DV360 Campaign ID" },
      advertiserId: { type: "string", description: "DV360 Advertiser ID" },
      startDate: { type: "string", description: "Start date (YYYY-MM-DD)" },
      endDate: { type: "string", description: "End date (YYYY-MM-DD)" },
    },
    required: ["campaignId", "advertiserId", "startDate", "endDate"],
  },
};

// 3. Define handler function
export async function handleGetCampaignDelivery(
  params: z.infer<typeof getCampaignDeliveryParamsSchema>
) {
  // Implementation uses BidManagerService to create/run report query
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
```

Then register in `src/mcp-server/tools/index.ts`:
1. Import the tool definition object at the top of the file
2. Add it to the `allTools` array

`registerToolsFromDefinitions()` in `src/mcp-server/server.ts` picks up `allTools` automatically — no switch statements or transport changes needed.

**Tool Handler Pattern**: `registerToolsFromDefinitions()` wraps all tool calls in try/catch blocks. Tool handlers should focus on business logic and let errors propagate up to be caught and formatted by the factory.

### Session Service Pattern

Each server uses per-session service instances to hold authenticated API clients and request state. This pattern allows multiple concurrent sessions (different users/API keys) on a single server process.

**Key components (all in `src/services/session-services.ts`):**

```typescript
// 1. SessionServiceStore — typed map from sessionId → SessionServices
//    Exported from @cesteral/shared:
import { SessionServiceStore } from "@cesteral/shared";
export const sessionServiceStore = new SessionServiceStore<SessionServices>();

// 2. createSessionServices() — called when a new session connects
export async function createSessionServices(
  sessionId: string,
  authAdapter: GoogleAuthAdapter  // or platform-specific adapter
): Promise<SessionServices> { ... }

// 3. resolveSessionServices() — called inside every tool handler
import { resolveSessionServices } from "../tools/utils/resolve-session.js";
export async function handleMyTool(params, _extra, sdkContext) {
  const { myApiService } = resolveSessionServices(sdkContext);
  // use myApiService...
}
```

**Session lifecycle:**
- Created: `createSessionServices()` called in the transport layer when a client connects with valid credentials
- Available: tool handlers retrieve services via `resolveSessionServices(sdkContext)`
- Cleaned up: `sessionServiceStore.delete(sessionId)` on transport close or session timeout

### Dynamic Schema Pattern (DV360 MCP)

**Problem**: Full discriminated union schemas for all entity types exceed ~1MB, causing EPIPE errors on stdio transport (e.g., Claude Desktop).

**Solution**: Simplified schemas for tool registration + MCP Resources for full schema details.

#### How It Works

```
STATIC_ENTITY_API_METADATA (entity-mapping-dynamic.ts)
    ↓ (static registry — one entry per entity type)
getSupportedEntityTypes()
    ↓ (used by BOTH)
┌─────────────────────┬──────────────────────┐
│ Simplified Schemas  │  Full Schemas        │
│ (for MCP tools)     │  (server validation) │
└─────────────────────┴──────────────────────┘
         ↓                      ↓
    MCP Resources (one per entity type)
```

**Key Features**:
1. ✅ **Static Registry** - Entity types declared in `STATIC_ENTITY_API_METADATA` in `entity-mapping-dynamic.ts`
2. ✅ **Single Source of Truth** - All entity discovery flows through the static registry
3. ✅ **Stdio Compatible** - Simplified schemas are ~2KB vs ~1MB+ for full schemas
4. ✅ **Complete Validation** - Server-side still uses full Zod schemas for strict validation

#### MCP Resources for Schema Discovery

AI agents fetch detailed schemas on-demand via MCP Resources:

```typescript
// Resource URIs (automatically available for all entity types)
entity-schema://lineItem     → Full JSON Schema with all fields
entity-fields://lineItem     → Flat list of all field paths (for updateMask)
entity-examples://lineItem   → Curated example payloads with common patterns
```

**Workflow for AI Agents**:
1. See `entityType` enum in simplified tool schema
2. Fetch `entity-schema://{entityType}` to understand required fields
3. Review `entity-examples://{entityType}` for common patterns
4. Build data payload and call tool
5. Server validates with full schema and returns errors if invalid

#### Adding New Entity Types

When adding a new entity type:
1. Add a 5-line entry to `STATIC_ENTITY_API_METADATA` in `packages/dv360-mcp/src/mcp-server/tools/utils/entity-mapping-dynamic.ts` (entity type key, API path, ID field name, parent ID field, and Zod schema reference)
2. Simplified schemas automatically include the new type in the enum (derived from the registry)
3. Full schemas automatically add the type to the discriminated union (derived from the registry)
4. MCP Resources automatically provide schema/fields/examples for the new type

#### Testing Schema Sizes

Run schema size validation test to ensure schemas stay under stdio limits:

```bash
cd packages/dv360-mcp
node tests/test-schema-size.cjs
```

This validates all tool schemas stay under 100KB (safe stdio limit).

#### When to Use This Pattern

**Use simplified schemas + MCP Resources when**:
- Tool schema exceeds 100KB (stdio safe limit)
- You have many entity types (10+) with complex schemas
- Entity types are dynamically discovered
- Schema details change frequently

**Alternative: Entity-specific tools** (if Resources UX is poor):
- Auto-generate dedicated tools per entity type
- Each tool has full schema for that entity
- Trade-off: More tools (15-30) vs simpler schemas

## MCP Prompts (Workflow Guidance)

**Purpose**: MCP Prompts provide step-by-step workflow guidance for complex multi-step operations.

### Why Use Prompts?

**Context Efficiency**:
- **Tools**: Always loaded (~2KB per simplified tool = ~20KB for 10 tools)
- **Resources**: On-demand only (0KB unless requested)
- **Prompts**: On-demand only (0KB unless invoked)

**Best Use Cases**:
- Multi-step workflows requiring specific ordering (e.g., Campaign → IO → Line Items)
- Operations with DV360-specific gotchas (e.g., campaigns can't be DRAFT, IOs must be DRAFT)
- Workflows needing validation gates between steps
- Complex troubleshooting sequences

**When NOT to Use Prompts**:
- Simple single-tool operations (tool description is sufficient)
- Reference documentation (use MCP Resources instead)

### Available Prompts (dv360-mcp)

| Prompt | Description | Key Arguments |
|--------|-------------|---------------|
| `full_campaign_setup_workflow` | Complete campaign creation (Campaign → IO → Line Items → Targeting) | `advertiserId` (required), `includeTargeting` (optional) |

### Creating New Prompts

Location: `packages/{server-name}/src/mcp-server/prompts/`

```typescript
// 1. Define prompt metadata
export const myWorkflowPrompt: Prompt = {
  name: "my_workflow",
  description: "Step-by-step guide for...",
  arguments: [
    {
      name: "advertiserId",
      description: "DV360 Advertiser ID",
      required: true,
    },
  ],
};

// 2. Define message generator
export function getMyWorkflowPromptMessage(args?: Record<string, string>): string {
  const advertiserId = args?.advertiserId || "{advertiserId}";

  return `# My Workflow Guide

## Step 1: ...
...
  `;
}
```

Then register in `src/mcp-server/prompts/index.ts`:
```typescript
export const promptRegistry: Map<string, PromptDefinition> = new Map([
  [myWorkflowPrompt.name, {
    prompt: myWorkflowPrompt,
    generateMessage: getMyWorkflowPromptMessage,
  }],
]);
```

**Prompt Message Guidelines**:
- Use markdown for formatting (headings, code blocks, tables, lists)
- Include ⚠️ **GOTCHA** callouts for DV360-specific quirks
- Provide example tool calls with exact JSON syntax
- Add success criteria checklists
- Include common errors table with solutions
- Reference MCP Resources for schema details
- Keep tone instructional but friendly

## Common Development Patterns

### Error Handling
Use `formatErrorForMcp` from `@cesteral/shared` for consistent error responses:

```typescript
import { formatErrorForMcp } from "@cesteral/shared";

try {
  // Tool logic
} catch (error) {
  logger.error({ error }, "Tool execution failed");
  return formatErrorForMcp(error);
}
```

### Logging
Use structured logging via Pino:

```typescript
import { createLogger } from "@cesteral/shared";

const logger = createLogger("component-name");

logger.info({ userId: 123, action: "login" }, "User logged in");
logger.error({ error, context }, "Operation failed");
```

### Schema Validation
Always use Zod for runtime validation:

```typescript
import { z } from "zod";

const schema = z.object({
  id: z.string(),
  count: z.number().min(1).max(100),
});

const params = schema.parse(rawInput); // Throws on invalid input
```

## MCP Tools Catalog

Complete reference of all MCP tools across the five servers:

### dbm-mcp (Reporting Server) Tools

Uses Bid Manager API v2 for DV360 reporting. Reports are async (create query → run → poll → fetch results).

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `get_campaign_delivery` | Fetch DV360 delivery metrics via Bid Manager API | `campaignId`, `advertiserId`, `startDate`, `endDate` |
| `get_performance_metrics` | Calculate CPM, CTR, CPA, ROAS from report data | `campaignId`, `advertiserId`, `dateRange` |
| `get_historical_metrics` | Time-series data for trends | `campaignId`, `advertiserId`, `startDate`, `endDate`, `granularity` |
| `get_pacing_status` | Real-time pacing calculation | `campaignId`, `advertiserId` |
| `run_custom_query` | Compose and execute custom Bid Manager reports | `reportType`, `timeRange`, `metrics`, `dimensions`, `filters` |

### dv360-mcp (Management Server) Tools — 20 Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `dv360_list_entities` | List supported DV360 entities with filters/paging | `entityType`, IDs, optional filters |
| `dv360_get_entity` | Retrieve a single DV360 entity by type/id | `entityType`, entity IDs |
| `dv360_create_entity` | Create any supported DV360 entity | `entityType`, IDs, `data` |
| `dv360_update_entity` | Update any supported DV360 entity with updateMask discipline | `entityType`, IDs, `data`, `updateMask` |
| `dv360_delete_entity` | Delete supported DV360 entities | `entityType`, entity IDs |
| `dv360_adjust_line_item_bids` | Batch adjust line item bids | `advertiserId`, `adjustments[]` |
| `dv360_bulk_update_status` | Batch update statuses for entities | `entityType`, `entityIds[]`, `entityStatus` |
| `dv360_bulk_create_entities` | Batch create DV360 entities | `entityType`, `advertiserId`, `items[]` |
| `dv360_bulk_update_entities` | Batch update DV360 entities | `entityType`, `advertiserId`, `items[]` |

#### Custom Bidding
| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `dv360_create_custom_bidding_algorithm` | Create a custom bidding algorithm | `advertiserId`, `data` |
| `dv360_manage_custom_bidding_script` | Upload/manage custom bidding scripts | `algorithmId`, `data` |
| `dv360_manage_custom_bidding_rules` | Manage rules for custom bidding | `algorithmId`, `data` |
| `dv360_list_custom_bidding_algorithms` | List custom bidding algorithms | `advertiserId`, filters |

#### Targeting
| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `dv360_list_assigned_targeting` | List assigned targeting options | `entityType`, entity IDs |
| `dv360_get_assigned_targeting` | Get a specific targeting assignment | `entityType`, entity IDs, `targetingType` |
| `dv360_create_assigned_targeting` | Create targeting assignment | `entityType`, entity IDs, `data` |
| `dv360_delete_assigned_targeting` | Delete targeting assignment | `entityType`, entity IDs, `targetingType` |
| `dv360_validate_targeting_config` | Validate targeting configuration | `entityType`, entity IDs, `config` |

#### Validation
| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `dv360_validate_entity` | Client-side schema validation (no API call) | `entityType`, `mode`, `data` |

#### Ad Previews
| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `dv360_get_ad_preview` | Get preview URL for a creative | `advertiserId`, `creativeId` |

### ttd-mcp (The Trade Desk Server) Tools — 21 Tools, 9 Entity Types

**Supported entity types:** `advertiser`, `campaign`, `adGroup`, `ad`, `creative`, `siteList`, `deal`, `conversionTracker`, `bidList`

#### Core CRUD
| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `ttd_list_entities` | List TTD entities with filters/paging | `entityType`, optional filters |
| `ttd_get_entity` | Retrieve a single TTD entity by type/id | `entityType`, `entityId` |
| `ttd_create_entity` | Create a TTD entity | `entityType`, `data` |
| `ttd_update_entity` | Update a TTD entity (PUT) | `entityType`, `entityId`, `data` |
| `ttd_delete_entity` | Delete a TTD entity | `entityType`, `entityId` |
| `ttd_validate_entity` | Dry-run validate entity payload | `entityType`, `mode`, `data` |

#### Reporting
| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `ttd_get_report` | Generate async report via MyReports V3 API (blocking) | `reportName`, `dateRange`, `dimensions`, `metrics`, `advertiserIds` |
| `ttd_download_report` | Download & parse report CSV from URL | `downloadUrl`, `maxRows` |
| `ttd_submit_report` | Submit report without waiting (non-blocking) | `reportName`, `dateRange`, `dimensions`, `metrics`, `advertiserIds` |
| `ttd_check_report_status` | Single status check for a submitted report | `reportScheduleId` |

#### Bulk Operations
| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `ttd_bulk_create_entities` | Batch create campaigns/ad groups (up to 50) | `entityType`, `items[]` |
| `ttd_bulk_update_entities` | Batch update campaigns/ad groups (up to 50) | `entityType`, `items[]` |
| `ttd_bulk_update_status` | Batch pause/resume/archive entities | `entityType`, `entityIds[]`, `status` |
| `ttd_archive_entities` | Batch archive (soft-delete) entities | `entityType`, `entityIds[]` |
| `ttd_adjust_bids` | Batch adjust ad group bid CPMs (safe read-modify-write) | `adjustments[]` |

#### Advanced
| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `ttd_graphql_query` | Execute GraphQL query/mutation against TTD GraphQL API | `query`, `variables` |
| `ttd_graphql_query_bulk` | Execute bulk GraphQL queries against TTD API | `queries[]` |
| `ttd_graphql_mutation_bulk` | Execute bulk GraphQL mutations against TTD API | `mutations[]` |
| `ttd_graphql_bulk_job` | Submit async bulk GraphQL job | `operation`, `variables` |
| `ttd_graphql_cancel_bulk_job` | Cancel a running bulk GraphQL job | `jobId` |

#### Ad Previews
| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `ttd_get_ad_preview` | Get preview URL for a creative | `creativeId` |

### gads-mcp (Google Ads Server) Tools — 13 Tools, 6 Entity Types

**Supported entity types:** `campaign`, `adGroup`, `ad`, `keyword`, `campaignBudget`, `asset`

#### Read Tools
| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `gads_gaql_search` | Execute arbitrary GAQL queries | `customerId`, `query`, `pageSize` |
| `gads_list_accounts` | List accessible customer accounts | _(none)_ |
| `gads_get_entity` | Get a single entity by type and ID | `entityType`, `customerId`, `entityId` |
| `gads_list_entities` | List entities with GAQL filters | `entityType`, `customerId`, `filters` |
| `gads_get_insights` | Performance insights with preset params | `customerId`, `entityType`, `dateRange` |

#### Write Tools
| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `gads_create_entity` | Create entity via :mutate API | `entityType`, `customerId`, `data` |
| `gads_update_entity` | Update entity with updateMask | `entityType`, `customerId`, `entityId`, `data`, `updateMask` |
| `gads_remove_entity` | Remove entity via :mutate API | `entityType`, `customerId`, `entityId` |
| `gads_bulk_mutate` | Multi-operation mutate (create+update+remove) | `entityType`, `customerId`, `operations[]` |
| `gads_bulk_update_status` | Batch enable/pause/remove entities | `entityType`, `customerId`, `entityIds[]`, `status` |
| `gads_adjust_bids` | Batch adjust ad group bids (safe read-modify-write) | `customerId`, `adjustments[]` |
| `gads_validate_entity` | Dry-run validate entity payload | `entityType`, `customerId`, `mode`, `data` |
| `gads_get_ad_preview` | Get ad preview HTML/URL | `customerId`, `adId` |

### meta-mcp (Meta Ads Server) Tools — 20 Tools, 5 Entity Types

**Supported entity types:** `campaign`, `adSet`, `ad`, `adCreative`, `customAudience`

#### Core CRUD
| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `meta_list_entities` | List Meta Ads entities with filters/paging | `entityType`, `adAccountId`, `fields`, `filtering` |
| `meta_get_entity` | Retrieve a single entity by type/id | `entityType`, `entityId`, `fields` |
| `meta_create_entity` | Create a Meta Ads entity | `entityType`, `adAccountId`, `data` |
| `meta_update_entity` | Update entity (POST with PATCH semantics) | `entityId`, `data` |
| `meta_delete_entity` | Delete a Meta Ads entity | `entityId` |

#### Account
| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `meta_list_ad_accounts` | List accessible ad accounts | `fields`, `limit` |

#### Insights
| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `meta_get_insights` | Performance metrics for an entity | `entityId`, `fields`, `datePreset`, `timeRange` |
| `meta_get_insights_breakdowns` | Metrics with dimensional breakdowns | `entityId`, `breakdowns`, `fields`, `datePreset` |

#### Bulk Operations
| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `meta_bulk_update_status` | Batch status updates | `entityIds[]`, `status` |
| `meta_bulk_create_entities` | Batch entity creation | `entityType`, `adAccountId`, `items[]` |
| `meta_bulk_update_entities` | Batch entity updates | `items[]` (each with `entityId` + `data`) |

#### Targeting
| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `meta_search_targeting` | Search interests, locations, etc. | `type`, `query`, `limit` |
| `meta_get_targeting_options` | Browse targeting categories | `adAccountId`, `type` |

#### Specialized
| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `meta_duplicate_entity` | Copy campaigns/adSets/ads | `entityId`, `options` |
| `meta_get_delivery_estimate` | Audience size estimation | `adAccountId`, `targetingSpec` |
| `meta_get_ad_previews` | Ad preview HTML | `adId`, `adFormat` |
| `meta_adjust_bids` | Batch adjust ad set bids | `adAccountId`, `adjustments[]` |
| `meta_validate_entity` | Dry-run validate entity payload | `entityType`, `mode`, `data` |
| `meta_upload_image` | Upload image from URL to ad images library | `adAccountId`, `mediaUrl`, `name?` |
| `meta_upload_video` | Upload video from URL to ad videos library (polls until ready) | `adAccountId`, `mediaUrl`, `title?` |

### linkedin-mcp (LinkedIn Ads Server) Tools — 19 Tools, 5 Entity Types

**Supported entity types:** `adAccount`, `campaignGroup`, `campaign`, `creative`, `conversionRule`
**Auth:** `MCP_AUTH_MODE=linkedin-bearer`, `LINKEDIN_ACCESS_TOKEN` env var, `LinkedIn-Version: 202409` header on all requests

#### Core CRUD
| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `linkedin_list_entities` | List LinkedIn entities with offset pagination | `entityType`, `adAccountUrn?`, `start?`, `count?` |
| `linkedin_get_entity` | Get single entity by URN | `entityType`, `entityUrn` |
| `linkedin_create_entity` | Create a LinkedIn entity | `entityType`, `data` |
| `linkedin_update_entity` | Update entity (PATCH) | `entityType`, `entityUrn`, `data` |
| `linkedin_delete_entity` | Delete a LinkedIn entity | `entityType`, `entityUrn` |
| `linkedin_list_ad_accounts` | List accessible ad accounts | `start?`, `count?` |

#### Analytics
| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `linkedin_get_analytics` | Delivery metrics via `/v2/adAnalytics` | `adAccountUrn`, `startDate`, `endDate`, `metrics?`, `pivot?` |
| `linkedin_get_analytics_breakdowns` | Metrics with breakdowns (geo, device, etc.) | `adAccountUrn`, `startDate`, `endDate`, `pivots[]` |

#### Bulk Operations
| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `linkedin_bulk_update_status` | Batch pause/archive entities | `entityType`, `entityUrns[]`, `status` |
| `linkedin_bulk_create_entities` | Batch entity creation (up to 50) | `entityType`, `items[]` |
| `linkedin_bulk_update_entities` | Batch entity updates (up to 50) | `entityType`, `items[]` |
| `linkedin_adjust_bids` | Batch adjust campaign bids (read-modify-write) | `adjustments[]` |

#### Targeting & Specialized
| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `linkedin_search_targeting` | Search audience facets (skills, companies, locations) | `facetType`, `query?`, `limit?` |
| `linkedin_get_targeting_options` | Browse targeting categories | `adAccountUrn`, `facetType?` |
| `linkedin_duplicate_entity` | Copy campaign groups, campaigns, creatives | `entityType`, `entityUrn`, `options?` |
| `linkedin_get_delivery_forecast` | Audience/delivery forecast for targeting config | `adAccountUrn`, `targetingCriteria` |
| `linkedin_get_ad_previews` | Ad preview rendering | `creativeUrn`, `adFormat?` |
| `linkedin_validate_entity` | Dry-run validate entity payload (no API call) | `entityType`, `mode`, `data` |
| `linkedin_upload_image` | Upload image from URL via 3-step LinkedIn flow | `adAccountUrn`, `mediaUrl`, `filename?` |

### tiktok-mcp (TikTok Ads Server) Tools — 23 Tools, 4 Entity Types

**Supported entity types:** `campaign`, `adGroup`, `ad`, `creative`
**Auth:** `MCP_AUTH_MODE=tiktok-bearer`, `TIKTOK_ACCESS_TOKEN` + `TIKTOK_ADVERTISER_ID` env vars, `X-TikTok-Advertiser-Id` header in HTTP mode

#### Core CRUD
| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `tiktok_list_entities` | List entities with page pagination | `entityType`, `advertiserId`, `filters?`, `page?`, `pageSize?` |
| `tiktok_get_entity` | Get single entity by ID | `entityType`, `advertiserId`, `entityId` |
| `tiktok_create_entity` | Create a TikTok entity | `entityType`, `advertiserId`, `data` |
| `tiktok_update_entity` | Update entity fields | `entityType`, `advertiserId`, `entityId`, `data` |
| `tiktok_delete_entity` | Delete entities | `entityType`, `advertiserId`, `entityIds[]` |
| `tiktok_list_advertisers` | List accessible advertiser accounts | _(none)_ |

#### Reporting (Async)
| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `tiktok_get_report` | Submit async report and download results (blocking) | `advertiserId`, `dimensions[]`, `metrics[]`, `startDate`, `endDate` |
| `tiktok_get_report_breakdowns` | Report with breakdown dimensions (blocking) | `advertiserId`, `dimensions[]`, `breakdowns[]`, `metrics[]`, `startDate`, `endDate` |
| `tiktok_submit_report` | Submit report without waiting (non-blocking) | `advertiserId`, `dimensions[]`, `metrics[]`, `startDate`, `endDate` |
| `tiktok_check_report_status` | Single status check for a submitted report | `advertiserId`, `taskId` |
| `tiktok_download_report` | Download & parse report CSV from URL | `downloadUrl`, `maxRows` |

#### Bulk Operations
| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `tiktok_bulk_update_status` | Batch enable/disable/delete entities | `entityType`, `advertiserId`, `entityIds[]`, `operationStatus` |
| `tiktok_bulk_create_entities` | Batch entity creation (up to 50) | `entityType`, `advertiserId`, `items[]` |
| `tiktok_bulk_update_entities` | Batch entity updates (up to 50) | `entityType`, `advertiserId`, `items[]` |
| `tiktok_adjust_bids` | Batch adjust ad group bid prices (read-modify-write) | `advertiserId`, `adjustments[]` |

#### Targeting & Specialized
| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `tiktok_search_targeting` | Search interest categories, behaviors, demographics | `advertiserId`, `targetingType`, `query?` |
| `tiktok_get_targeting_options` | Browse targeting categories | `advertiserId`, `targetingType?` |
| `tiktok_duplicate_entity` | Copy campaigns, ad groups, ads | `entityType`, `advertiserId`, `entityId`, `options?` |
| `tiktok_get_audience_estimate` | Audience size estimation for targeting config | `advertiserId`, `targetingConfig` |
| `tiktok_get_ad_previews` | Ad preview for video/image ads | `advertiserId`, `adId`, `adFormat?` |
| `tiktok_validate_entity` | Dry-run validate entity payload (no API call) | `entityType`, `mode`, `data` |
| `tiktok_upload_image` | Upload image from URL to TikTok ad image library | `advertiserId`, `mediaUrl`, `filename?` |
| `tiktok_upload_video` | Upload video from URL to TikTok ad video library (polls) | `advertiserId`, `mediaUrl`, `videoName?` |

### How the Eight Servers Work Together

**Example: Investigating and fixing an underdelivering campaign**
1. AI agent calls **dbm-mcp** → `get_pacing_status` to detect underdelivery (72% pacing)
2. AI agent calls **dbm-mcp** → `get_performance_metrics` to analyze current CPMs
3. AI agent calculates bid adjustments needed based on pacing data
4. AI agent calls **dv360-mcp** → `dv360_adjust_line_item_bids` for batched line item updates
5. AI agent confirms changes and monitors delivery improvement

## Deployment & Infrastructure

- **Platform**: GCP Cloud Run (containerized services)
- **Reporting**: Bid Manager API v2 (DV360 delivery metrics)
- **Secrets**: GCP Secret Manager
- **IaC**: Terraform (in `terraform/` directory)
- **CI/CD**: Cloud Build (`cloudbuild.yaml`)

### Local Testing
Each server runs on a different port:
- `dbm-mcp`: port 3001
- `dv360-mcp`: port 3002
- `ttd-mcp`: port 3003
- `gads-mcp`: port 3004
- `meta-mcp`: port 3005
- `linkedin-mcp`: port 3006
- `tiktok-mcp`: port 3007
- `media-mcp`: port 3008

Test MCP endpoint:
```bash
curl -X POST http://localhost:3001/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"ping","id":1}'
```

Test health check:
```bash
curl http://localhost:3001/health
```

### GCP Monitoring & Debugging

View logs for specific server:
```bash
# Real-time logs
gcloud run services logs tail dbm-mcp --region=europe-west2

# Recent errors across all servers
gcloud logging read 'severity>=ERROR AND resource.labels.service_name=~"(dbm|dv360|ttd|gads|meta)-mcp"' --limit=50
```

View costs:
```bash
gcloud billing accounts list
gcloud beta billing projects describe YOUR_PROJECT_ID
```

### Claude Desktop Configuration

After deploying to Cloud Run, configure Claude Desktop to connect to the MCP servers:

```json
{
  "mcpServers": {
    "cesteral-reporting": {
      "url": "https://reporting.cesteral.com/mcp",
      "apiKey": "your-reporting-api-key"
    },
    "cesteral-management": {
      "url": "https://management.cesteral.com/mcp",
      "apiKey": "your-management-api-key"
    }
  }
}
```

## Key Design Principles

1. **Separation of Concerns**: Five MCP servers with distinct responsibilities (reporting, DV360 management, TTD management, Google Ads management, Meta Ads management)
2. **Multi-Platform**: Servers are purpose-built per platform (Bid Manager API for reporting, DV360 API for DV360 management, TTD REST API for TTD management, Google Ads REST API for Google Ads management, Meta Marketing API for Meta management)
3. **Stateless**: Servers are stateless - no persistent state between requests
4. **Type Safety**: Zod schemas for runtime validation, TypeScript for compile-time safety
5. **Observability**: OTEL traces + metrics (GCP Cloud Trace/Monitoring), Pino structured logs (GCP Cloud Logging), InteractionLogger (local JSONL debugging)

## Important Files

- `package.json` (root) - Workspace configuration and scripts
- `turbo.json` - Build pipeline configuration
- `pnpm-workspace.yaml` - Workspace package definitions
- `docs/PRD.md` - Product requirements document
- `README.md` - User-facing documentation with quick start guide

## TypeScript Build Issues

If you encounter TypeScript errors related to type inference (e.g., "The inferred type cannot be named"), add explicit return type annotations:

```typescript
// Before (may fail)
export function createMcpHttpServer() {
  const app = express();
  return app;
}

// After (explicit type)
export function createMcpHttpServer(): express.Application {
  const app = express();
  return app;
}
```

## Working with Multiple Packages

When making changes that span multiple packages:

1. Make changes to `@cesteral/shared`
2. Build from root: `pnpm run build` (Turborepo handles dependency order)
3. Changes automatically available to dependent packages via workspace protocol (`workspace:*`)

No need to manually rebuild individual packages - Turborepo's dependency graph handles this automatically.

