# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cesteral is an AI-native programmatic advertising optimization platform built on five independent MCP (Model Context Protocol) servers. The architecture enables clean separation between reporting (dbm-mcp), DV360 campaign management (dv360-mcp), The Trade Desk campaign management (ttd-mcp), Google Ads campaign management (gads-mcp), and Meta Ads campaign management (meta-mcp).

### Current Project Status

**Phase: Production-Ready ✅**

All five MCP servers are fully implemented with live API integrations:
- **dbm-mcp**: Bid Manager API v2 for DV360 reporting
- **dv360-mcp**: DV360 API v4 for campaign entity management
- **ttd-mcp**: TTD REST API for The Trade Desk campaign management & reporting
- **gads-mcp**: Google Ads REST API v23 for Google Ads campaign management & reporting
- **meta-mcp**: Meta Marketing API v21.0 for Meta Ads campaign management

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
```

## Monorepo Architecture

This is a **pnpm workspace** monorepo managed by **Turborepo**. The workspace consists of:

### Core Packages
1. **`@cesteral/shared`** - Shared types, utilities, authentication (Zod schemas, logging via Pino, JWT auth via Jose)

### Five MCP Servers
1. **`@cesteral/dbm-mcp`** - DV360 reporting queries via Bid Manager API v2 (read-only)
2. **`@cesteral/dv360-mcp`** - DV360 campaign entity management (CRUD via DV360 API & SDF files)
3. **`@cesteral/ttd-mcp`** - The Trade Desk campaign management & reporting (CRUD via TTD REST API)
4. **`@cesteral/gads-mcp`** - Google Ads campaign management & reporting (CRUD via Google Ads REST API v23)
5. **`@cesteral/meta-mcp`** - Meta Ads campaign management (CRUD via Meta Marketing API v21.0)

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
- Target: ES2022, Module: NodeNext

## MCP Server Architecture Pattern

Each MCP server follows this structure:

```
packages/{server-name}/
├── src/
│   ├── index.ts                    # Entry point (starts HTTP server)
│   ├── config/                     # Environment configuration
│   ├── container/                  # Dependency injection setup (tsyringe)
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

**Note**: The `mcp-ts-quickstart-template/` directory contains a more sophisticated template with additional infrastructure (McpError, withToolAuth, RequestContext patterns, elicitation). Cesteral currently uses a simplified version focused on the core MCP protocol. Refer to the template for advanced patterns if needed.

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
Generated Zod Schemas (zod.js)
    ↓ (runtime introspection)
schemaIntrospection.ts → getAvailableEntitySchemas()
    ↓ (pattern matching for entity-like exports)
entityMappingDynamic.ts → getSupportedEntityTypesDynamic()
    ↓ (used by BOTH)
┌─────────────────────┬──────────────────────┐
│ Simplified Schemas  │  Full Schemas        │
│ (for MCP tools)     │  (server validation) │
└─────────────────────┴──────────────────────┘
         ↓                      ↓
    MCP Resources (also dynamic)
```

**Key Features**:
1. ✅ **Fully Dynamic** - Both simplified and full schemas use `getSupportedEntityTypesDynamic()`
2. ✅ **Single Source of Truth** - All entity discovery flows through `schemaIntrospection.ts`
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

When new entity types are added to `generated/schemas/zod.js`:
1. ✅ `schemaIntrospection.ts` auto-discovers them via pattern matching
2. ✅ Simplified schemas automatically include them in enum
3. ✅ Full schemas automatically add them to discriminated union
4. ✅ MCP Resources automatically provide schema/fields/examples
5. ✅ **No manual updates needed anywhere**

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

## Dependency Injection Pattern

All services use **tsyringe** for dependency injection:

```typescript
// In container/index.ts
import "reflect-metadata"; // Required at top
import { container } from "tsyringe";

export function setupContainer() {
  const logger = createLogger("server-name");
  container.register("Logger", { useValue: logger });

  // Register services
  container.register(MyService, { useClass: MyService });

  return container;
}

// In service file
import { injectable, inject } from "tsyringe";

@injectable()
export class MyService {
  constructor(@inject("Logger") private logger: Logger) {}

  async doSomething() {
    this.logger.info("Doing something");
  }
}
```

**Important**: Always import `"reflect-metadata"` at the top of `index.ts` before any other imports.

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

### dv360-mcp (Management Server) Tools — 18 Tools

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

### ttd-mcp (The Trade Desk Server) Tools — 18 Tools, 9 Entity Types

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
| `ttd_get_report` | Generate async report via MyReports V3 API | `reportName`, `dateRange`, `dimensions`, `metrics`, `advertiserIds` |
| `ttd_download_report` | Download & parse report CSV from URL | `downloadUrl`, `maxRows` |

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

### gads-mcp (Google Ads Server) Tools — 11 Tools, 6 Entity Types

**Supported entity types:** `campaign`, `adGroup`, `ad`, `keyword`, `campaignBudget`, `asset`

#### Read Tools
| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `gads_gaql_search` | Execute arbitrary GAQL queries | `customerId`, `query`, `pageSize` |
| `gads_list_accounts` | List accessible customer accounts | _(none)_ |
| `gads_get_entity` | Get a single entity by type and ID | `entityType`, `customerId`, `entityId` |
| `gads_list_entities` | List entities with GAQL filters | `entityType`, `customerId`, `filters` |

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

### meta-mcp (Meta Ads Server) Tools — 17 Tools, 5 Entity Types

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

### How the Five Servers Work Together

**Example: Investigating and fixing an underdelivering campaign**
1. AI agent calls **dbm-mcp** → `get_pacing_status` to detect underdelivery (72% pacing)
2. AI agent calls **dbm-mcp** → `get_performance_metrics` to analyze current CPMs
3. AI agent calculates bid adjustments needed based on pacing data
4. AI agent calls **dv360-mcp** → `dv360_adjust_line_item_bids` for batched line item updates
5. AI agent confirms changes and monitors delivery improvement

## Deployment & Infrastructure

- **Platform**: GCP Cloud Run (containerized services)
- **Data Storage**: BigQuery (optimization configuration, task state, adjustment history)
- **Reporting**: Bid Manager API v2 (DV360 delivery metrics - no BigQuery storage needed)
- **Secrets**: GCP Secret Manager
- **IaC**: Terraform (in `terraform/` directory)
- **CI/CD**: Cloud Build (`cloudbuild.yaml`)

### Cloud Scheduler Jobs (Production)

Automated background jobs that invoke MCP server endpoints:
- **report-cache-refresh** (every 4h) → dbm-mcp (pre-runs common Bid Manager queries)
- **adjustment-executor** (every 30m) → dv360-mcp management server

### Local Testing
Each server runs on a different port:
- `dbm-mcp`: port 3001
- `dv360-mcp`: port 3002
- `ttd-mcp`: port 3003
- `gads-mcp`: port 3004
- `meta-mcp`: port 3005

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
3. **Stateless**: Servers are stateless - reporting from Bid Manager API, state in BigQuery
4. **Type Safety**: Zod schemas for runtime validation, TypeScript for compile-time safety
5. **Observability**: Structured logging throughout, designed for OpenTelemetry integration

## Skill Adapter Generation

- Canonical source: `skills/canonical/` (12 files, one per workflow)
- Provider registry: `skills/providers.json` (6 providers)
- Generate all adapters: `pnpm generate:skills`
- Validate all adapters: `pnpm validate:skills`
- Validate + freshness check: `pnpm validate:skills -- --check-freshness`

Supported providers: Cursor, Codex, GitHub Copilot, Windsurf, Cline, Continue.dev

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

## Advanced MCP Server Patterns (Optional)

The `mcp-ts-quickstart-template/` directory contains a production-grade MCP server template with advanced patterns:

- **Error Handling**: `McpError` class with JSON-RPC error codes
- **Authorization**: `withToolAuth`/`withResourceAuth` wrappers for scope-based access control
- **Request Context**: Structured context passing for tracing and multi-tenancy
- **Elicitation**: Patterns for requesting missing user input via `sdkContext.elicitInput()`
- **OpenTelemetry**: Full observability setup with traces and metrics
- **Resource Definitions**: URI-based resources with pagination support

See `mcp-ts-quickstart-template/AGENTS.md` for detailed architectural guidelines if adopting these patterns.

**Current Status**: Cesteral uses a simplified MCP implementation. These advanced patterns are available for future adoption if needed.
