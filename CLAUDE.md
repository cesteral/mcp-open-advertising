# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BidShifter is an AI-native programmatic advertising optimization platform built on three independent MCP (Model Context Protocol) servers. The architecture enables clean separation between reporting (dbm-mcp), DV360 campaign management (dv360-mcp), and The Trade Desk campaign management (ttd-mcp).

### Current Project Status

**Phase: Production-Ready ✅**

All three MCP servers are fully implemented with live API integrations:
- **dbm-mcp**: Bid Manager API v2 for DV360 reporting
- **dv360-mcp**: DV360 API v4 for campaign entity management
- **ttd-mcp**: TTD REST API for The Trade Desk campaign management & reporting

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
```

## Monorepo Architecture

This is a **pnpm workspace** monorepo managed by **Turborepo**. The workspace consists of:

### Core Packages
1. **`@bidshifter/shared`** - Shared types, utilities, authentication (Zod schemas, logging via Pino, JWT auth via Jose)

### Three MCP Servers
1. **`@bidshifter/dbm-mcp`** - DV360 reporting queries via Bid Manager API v2 (read-only)
2. **`@bidshifter/dv360-mcp`** - DV360 campaign entity management (CRUD via DV360 API & SDF files)
3. **`@bidshifter/ttd-mcp`** - The Trade Desk campaign management & reporting (CRUD via TTD REST API)

**Important**: Each MCP server exposes tools via the Model Context Protocol (MCP) for external AI agents (Claude Desktop, etc.).

## Build System & Dependencies

### Turborepo Task Pipeline
Build tasks have dependencies defined in `turbo.json`:
- `build` depends on `^build` (dependencies build first)
- `typecheck` depends on `^build`
- `test` depends on `^build`

**Critical**: When modifying `@bidshifter/shared`, rebuild all packages:
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
│   │       └── http-transport.ts   # Express app with SSE endpoint
│   ├── services/                   # Business logic services
│   └── utils/                      # Helper utilities
```

**Note**: The `mcp-ts-quickstart-template/` directory contains a more sophisticated template with additional infrastructure (McpError, withToolAuth, RequestContext patterns, elicitation). BidShifter currently uses a simplified version focused on the core MCP protocol. Refer to the template for advanced patterns if needed.

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

Then register in `src/mcp-server/transports/http-transport.ts`:
1. Import tool, handler, and schema
2. Add to `tools/list` response array
3. Add case to `tools/call` handler switch statement with Zod validation

**Tool Handler Pattern**: The transport layer wraps all tool calls in try/catch blocks. Tool handlers should focus on business logic and let errors propagate up to be caught and formatted by the transport layer.

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
Use `formatErrorForMcp` from `@bidshifter/shared` for consistent error responses:

```typescript
import { formatErrorForMcp } from "@bidshifter/shared";

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
import { createLogger } from "@bidshifter/shared";

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

Complete reference of all MCP tools across the three servers:

### dbm-mcp (Reporting Server) Tools

Uses Bid Manager API v2 for DV360 reporting. Reports are async (create query → run → poll → fetch results).

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `get_campaign_delivery` | Fetch DV360 delivery metrics via Bid Manager API | `campaignId`, `advertiserId`, `startDate`, `endDate` |
| `get_performance_metrics` | Calculate CPM, CTR, CPA, ROAS from report data | `campaignId`, `advertiserId`, `dateRange` |
| `get_historical_metrics` | Time-series data for trends | `campaignId`, `advertiserId`, `startDate`, `endDate`, `granularity` |
| `get_pacing_status` | Real-time pacing calculation | `campaignId`, `advertiserId` |
| `run_custom_query` | Compose and execute custom Bid Manager reports | `reportType`, `timeRange`, `metrics`, `dimensions`, `filters` |

### dv360-mcp (Management Server) Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `dv360_list_entities` | List supported DV360 entities with filters/paging | `entityType`, IDs, optional filters |
| `dv360_get_entity` | Retrieve a single DV360 entity by type/id | `entityType`, entity IDs |
| `dv360_create_entity` | Create any supported DV360 entity | `entityType`, IDs, `data` |
| `dv360_update_entity` | Update any supported DV360 entity with updateMask discipline | `entityType`, IDs, `data`, `updateMask` |
| `dv360_delete_entity` | Delete supported DV360 entities | `entityType`, entity IDs |
| `dv360_adjust_line_item_bids` | Batch adjust line item bids | `advertiserId`, `adjustments[]` |
| `dv360_bulk_update_status` | Batch update statuses for entities | `entityType`, `entityIds[]`, `entityStatus` |

### ttd-mcp (The Trade Desk Server) Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `ttd_create_entity` | Create a TTD entity (advertiser, campaign, ad group, ad) | `entityType`, `data` |
| `ttd_get_entity` | Retrieve a single TTD entity by type/id | `entityType`, `entityId` |
| `ttd_list_entities` | List TTD entities with filters/paging | `entityType`, optional filters |
| `ttd_update_entity` | Update a TTD entity | `entityType`, `entityId`, `data` |
| `ttd_delete_entity` | Delete a TTD entity | `entityType`, `entityId` |
| `ttd_get_report` | Generate and retrieve TTD performance reports | `reportType`, `startDate`, `endDate`, filters |

### How the Three Servers Work Together

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

Test SSE endpoint:
```bash
curl http://localhost:3001/sse
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
gcloud logging read 'severity>=ERROR AND resource.labels.service_name=~"(dbm|dv360|ttd)-mcp"' --limit=50
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
    "bidshifter-reporting": {
      "url": "https://reporting.bidshifter.io/mcp",
      "apiKey": "your-reporting-api-key"
    },
    "bidshifter-management": {
      "url": "https://management.bidshifter.io/mcp",
      "apiKey": "your-management-api-key"
    }
  }
}
```

## Key Design Principles

1. **Separation of Concerns**: Three MCP servers with distinct responsibilities (reporting, DV360 management, TTD management)
2. **Multi-Platform**: Servers are purpose-built per platform (Bid Manager API for reporting, DV360 API for DV360 management, TTD REST API for TTD management)
3. **Stateless**: Servers are stateless - reporting from Bid Manager API, state in BigQuery
4. **Type Safety**: Zod schemas for runtime validation, TypeScript for compile-time safety
5. **Observability**: Structured logging throughout, designed for OpenTelemetry integration

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

1. Make changes to `@bidshifter/shared`
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

**Current Status**: BidShifter uses a simplified MCP implementation. These advanced patterns are available for future adoption if needed.
