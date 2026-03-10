# dbm-mcp Architecture

**Version:** 2.0 (Bid Manager API v2)
**Status:** Design Document
**Last Updated:** 2025-12-02

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Directory Structure](#directory-structure)
4. [Core Components](#core-components)
5. [Data Flow](#data-flow)
6. [Configuration](#configuration)
7. [Bid Manager API Integration](#bid-manager-api-integration)
8. [Observability](#observability)
9. [Testing Strategy](#testing-strategy)
10. [Implementation Roadmap](#implementation-roadmap)

---

## Overview

### Purpose

The **dbm-mcp** server is a production-grade MCP (Model Context Protocol) server that provides **DV360 reporting and analytics** capabilities via the Bid Manager API v2. It enables AI agents and automation systems to query delivery metrics, performance KPIs, historical trends, and pacing status for DV360 campaigns.

### Key Capabilities

- **DV360 Reporting**: Delivery metrics via Bid Manager API v2 (async report generation)
- **Performance Analytics**: Calculate CPM, CTR, CPA, ROAS from report data
- **Time-Series Data**: Historical metrics with configurable granularity (hourly, daily)
- **Pacing Intelligence**: Real-time pacing status (actual vs expected delivery)
- **Read-Only Design**: No write operations, ensuring data integrity

### Technology Stack

- **Protocol**: Model Context Protocol (MCP) via HTTP/SSE
- **Runtime**: Node.js 20+ with TypeScript
- **Framework**: Express (HTTP server) + MCP SDK (@modelcontextprotocol/sdk)
- **DI Container**: tsyringe
- **Data Source**: Bid Manager API v2 (DV360 reporting)
- **Schema Validation**: Zod (runtime) + TypeScript (compile-time)
- **Observability**: Pino (structured logging) + OpenTelemetry (tracing/metrics)
- **Authentication**: OAuth 2.0 (GCP service account for Bid Manager API)

### Bid Manager API v2 Overview

The Bid Manager API v2 provides async report generation for DV360:

1. **Create Query**: Define report parameters (dimensions, metrics, filters, date range)
2. **Run Query**: Execute the query (async operation)
3. **Poll for Completion**: Check report status until ready
4. **Fetch Results**: Download report data (CSV or JSON)

**Key Endpoints:**
- `POST /queries` - Create a new query
- `POST /queries/{queryId}:run` - Run a query
- `GET /queries/{queryId}/reports` - List reports for a query
- `GET /queries/{queryId}/reports/{reportId}` - Get report metadata (includes download URL)

**API Reference:** https://developers.google.com/bid-manager/reference/rest/v2

### Deployment & Operational Posture

- **Primary target:** Google Cloud Run using HTTP/SSE transport on port 3001
- **Stateless runtime:** All queries are read-only; no session state required
- **Authentication:** OAuth 2.0 service account for Bid Manager API; JWT bearer tokens for MCP clients
- **Observability:** OpenTelemetry exporters with structured logging via Pino
- **Configuration:** Environment variables via `src/config/index.ts`
- **Local parity:** `pnpm run dev:http` mirrors Cloud Run behavior

### Design Philosophy

This server follows the **production-grade patterns** established in dv360-mcp:

- **Query-Centric Tools**: Read-only operations focused on data retrieval and analysis
- **"Logic Throws, Handler Catches"**: Pure business logic throws errors, handlers format responses
- **RequestContext Propagation**: Structured context flows through entire call stack
- **Scope-Based Authorization**: `withToolAuth([scopes])` wrappers enforce read permissions
- **Declarative Tool Definitions**: Single-file tool definitions with metadata, schemas, logic, formatter
- **Schema-Driven Validation**: Zod schemas for all input parameters
- **Dependency Injection First**: Explicit dependencies via tsyringe container
- **OpenTelemetry by Default**: Automatic instrumentation of query execution

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                MCP Client (AI Agent / cesteral-mcp)                │
│                      HTTP POST /mcp with JWT                         │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ JSON-RPC 2.0 over Streamable HTTP
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        HTTP Transport Layer                          │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌──────────┐ │
│  │ CORS        │→ │ Auth         │→ │ Rate        │→ │ MCP      │ │
│  │ Middleware  │  │ Middleware   │  │ Limiting    │  │ Server   │ │
│  └─────────────┘  └──────────────┘  └─────────────┘  └──────────┘ │
│                        (Express + MCP SDK)                           │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           MCP Server                                 │
│  ┌─────────────────────┐  ┌──────────────────────────────────────┐ │
│  │  Tool Registry      │  │  Tool Definitions (4 core tools)     │ │
│  │  - registerAll()    │  │  - dbm_get_campaign_delivery         │ │
│  │  - createHandler()  │  │  - dbm_get_performance_metrics       │ │
│  └─────────────────────┘  │  - dbm_get_historical_metrics        │ │
│  ┌─────────────────────┐  │  - dbm_get_pacing_status             │ │
│  │  Resource Registry  │  └──────────────────────────────────────┘ │
│  │  - Metric Schemas   │  ┌──────────────────────────────────────┐ │
│  │  - Report Templates │  │  Prompts (Workflow Guidance)         │ │
│  └─────────────────────┘  │  - troubleshoot_underdelivery        │ │
│                            │  - performance_analysis_workflow     │ │
│                            └──────────────────────────────────────┘ │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Service Layer                                │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  BidManagerService                                            │  │
│  │  - createQuery(dimensions, metrics, filters)                  │  │
│  │  - runQuery(queryId)                                          │  │
│  │  - pollForCompletion(queryId, reportId)                       │  │
│  │  - fetchReportData(downloadUrl)                               │  │
│  │  - parseReportCSV(csvData)                                    │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  ReportCacheService (optional)                                │  │
│  │  - getCachedReport(queryHash)                                 │  │
│  │  - cacheReport(queryHash, data, ttl)                          │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Bid Manager API v2                               │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  POST /queries             (create report query)              │  │
│  │  POST /queries/{id}:run    (execute query)                    │  │
│  │  GET  /queries/{id}/reports (list reports)                    │  │
│  │  GET  /queries/{id}/reports/{rid} (get download URL)          │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Google Cloud Storage (report downloads)                      │  │
│  │  - CSV files with report data                                 │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

Following the clean, production-grade structure established in dv360-mcp:

```
packages/dbm-mcp/
├── src/
│   ├── index.ts                          # Entry point (HTTP server startup)
│   ├── config/
│   │   └── index.ts                      # Environment configuration (Zod validation)
│   ├── container/
│   │   ├── index.ts                      # DI container composition
│   │   ├── tokens.ts                     # Symbol-based DI tokens
│   │   └── registrations/
│   │       ├── core.ts                   # Core services (config, logger, BidManager)
│   │       └── mcp.ts                    # MCP components (tools, resources, server)
│   ├── mcp-server/
│   │   ├── server.ts                     # MCP server creation (stdio + tools/resources/prompts)
│   │   ├── transports/
│   │   │   └── http-transport.ts         # Express + SSE transport
│   │   ├── tools/
│   │   │   ├── definitions/
│   │   │   │   ├── index.ts              # Tool registry
│   │   │   │   ├── get-campaign-delivery.tool.ts
│   │   │   │   ├── get-performance-metrics.tool.ts
│   │   │   │   ├── get-historical-metrics.tool.ts
│   │   │   │   └── get-pacing-status.tool.ts
│   │   │   └── utils/
│   │   │       ├── index.ts              # Utility exports
│   │   │       ├── metric-calculations.ts # KPI calculation logic
│   │   │       ├── date-range-validator.ts
│   │   │       └── report-parser.ts       # CSV/JSON report parsing
│   │   ├── resources/
│   │   │   ├── definitions/
│   │   │   │   ├── index.ts              # Resource registry
│   │   │   │   ├── metric-schema.resource.ts    # Schema definitions for metrics
│   │   │   │   └── report-template.resource.ts  # Common report templates
│   │   │   └── utils/
│   │   │       ├── index.ts
│   │   │       ├── types.ts              # Resource type definitions
│   │   │       └── resource-registry.ts  # Resource registration helper
│   │   └── prompts/
│   │       ├── index.ts                  # Prompt registry
│   │       ├── troubleshoot-underdelivery.prompt.ts
│   │       └── performance-analysis.prompt.ts
│   ├── services/
│   │   ├── bid-manager/
│   │   │   ├── BidManagerService.ts      # Bid Manager API client
│   │   │   ├── types.ts                  # API types (Query, Report, etc.)
│   │   │   ├── query-builder.ts          # Query construction helpers
│   │   │   └── report-parser.ts          # CSV/JSON report parsing
│   │   └── cache/
│   │       └── ReportCacheService.ts     # Optional in-memory cache
│   ├── types-global/
│   │   ├── index.ts                      # Type exports
│   │   ├── mcp.ts                        # MCP-specific types (SdkContext, etc.)
│   │   └── bid-manager.ts                # Bid Manager API types
│   └── utils/
│       ├── errors/
│       │   ├── index.ts                  # Error utilities export
│       │   ├── mcp-error.ts              # McpError class
│       │   ├── error-codes.ts            # JSON-RPC error codes
│       │   └── error-handler.ts          # Central error handler
│       ├── security/
│       │   ├── index.ts
│       │   ├── rate-limiter.ts           # Rate limiting (per-advertiser)
│       │   └── with-tool-auth.ts         # Auth wrapper for tools
│       ├── telemetry/
│       │   ├── index.ts
│       │   ├── opentelemetry.ts          # OTEL initialization
│       │   └── tracing.ts                # Span helpers (withToolSpan, etc.)
│       ├── internal/
│       │   └── request-context.ts        # RequestContext type and helpers
│       └── network/
│           └── fetch-with-timeout.ts     # HTTP client with timeout
├── tests/
│   ├── unit/
│   │   ├── services/
│   │   │   └── bid-manager.test.ts
│   │   └── tools/
│   │       └── metric-calculations.test.ts
│   └── integration/
│       └── bid-manager-integration.test.ts
├── docs/
│   ├── ARCHITECTURE.md                   # This file
│   ├── BID_MANAGER_API.md                # API usage patterns
│   └── TOOLS_REFERENCE.md                # Tool usage examples
├── scripts/
│   └── test-api-connection.sh            # Bid Manager API connectivity test
├── package.json
├── tsconfig.json
├── Dockerfile
└── README.md
```

---

## Core Components

### 1. Entry Point (`src/index.ts`)

**Responsibilities:**
- Initialize OpenTelemetry instrumentation
- Compose DI container with all services
- Detect transport mode (stdio vs HTTP)
- Start appropriate server (stdio or HTTP/SSE)
- Configure logging based on transport mode (stderr for stdio)

**Example:**
```typescript
import "reflect-metadata";
import pino from "pino";
import { dbmConfig } from "./config/index.js";
import { composeContainer } from "./container/index.js";
import { createMcpServer, runStdioServer } from "./mcp-server/server.js";
import { createMcpHttpServer } from "./mcp-server/transports/http-transport.js";
import { initializeOpenTelemetry } from "./utils/telemetry/index.js";

const transportMode = process.env.MCP_TRANSPORT_MODE || "http";
const logger = pino({ name: "dbm-mcp", level: "info" });

initializeOpenTelemetry(dbmConfig, logger);

async function main() {
  composeContainer(logger);

  if (transportMode === "stdio") {
    const server = await createMcpServer(logger);
    await runStdioServer(server, logger);
  } else {
    const app = createMcpHttpServer(dbmConfig, logger);
    app.listen(dbmConfig.port, dbmConfig.host, () => {
      logger.info({ host: dbmConfig.host, port: dbmConfig.port }, "DBM MCP Server started");
    });
  }
}

main();
```

### 2. Configuration (`src/config/index.ts`)

**Responsibilities:**
- Load and validate environment variables via Zod
- Provide type-safe configuration access
- Set sensible defaults for development

**Key Configuration:**
```typescript
import { z } from "zod";

const ConfigSchema = z.object({
  // Service Identity
  serviceName: z.string().default("dbm-mcp"),
  port: z.number().int().min(1).max(65535).default(3001),
  host: z.string().default("0.0.0.0"),
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),

  // Authentication (MCP clients)
  mcpAuthMode: z.enum(["none", "jwt", "oauth"]).default("none"),
  mcpAuthSecretKey: z.string().min(32).optional(),

  // Google Cloud / Bid Manager API
  gcpProjectId: z.string(),
  serviceAccountJson: z.string().optional(), // Base64 encoded
  serviceAccountFile: z.string().optional(), // Path to JSON file

  // Logging & Observability
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
  otelEnabled: z.boolean().default(false),
  otelServiceName: z.string().default("dbm-mcp"),
  otelExporterOtlpTracesEndpoint: z.string().url().optional(),
  otelExporterOtlpMetricsEndpoint: z.string().url().optional(),

  // Rate Limiting
  rateLimitPerMinute: z.number().default(100),

  // Report Settings
  reportPollIntervalMs: z.number().default(2000),
  reportPollTimeoutMs: z.number().default(120000), // 2 minutes max
  reportCacheTtlMs: z.number().default(300000), // 5 minute cache
});

export type DbmConfig = z.infer<typeof ConfigSchema>;
export const dbmConfig = ConfigSchema.parse(/* parse from process.env */);
```

### 3. Dependency Injection (`src/container/`)

**`src/container/tokens.ts`:**
```typescript
// Core Services
export const AppConfig = Symbol("AppConfig");
export const Logger = Symbol("Logger");

// Data Services
export const BidManagerService = Symbol("BidManagerService");
export const ReportCacheService = Symbol("ReportCacheService");
export const RateLimiterService = Symbol("RateLimiterService");

// MCP Components
export const ToolRegistry = Symbol("ToolRegistry");
export const ResourceRegistry = Symbol("ResourceRegistry");
```

**`src/container/registrations/core.ts`:**
```typescript
import { container } from "tsyringe";
import * as Tokens from "../tokens.js";
import { BidManagerService } from "../../services/bid-manager/BidManagerService.js";
import { ReportCacheService } from "../../services/cache/ReportCacheService.js";
import { rateLimiter } from "../../utils/security/rate-limiter.js";

export function registerCoreServices(config: DbmConfig, logger: Logger) {
  container.register(Tokens.AppConfig, { useValue: config });
  container.register(Tokens.Logger, { useValue: logger });
  container.register(Tokens.BidManagerService, { useClass: BidManagerService });
  container.register(Tokens.ReportCacheService, { useClass: ReportCacheService });
  container.register(Tokens.RateLimiterService, { useValue: rateLimiter });
}
```

### 4. BidManagerService (`src/services/bid-manager/BidManagerService.ts`)

**Responsibilities:**
- Initialize OAuth 2.0 client with service account credentials
- Create and execute Bid Manager API queries
- Poll for report completion
- Fetch and parse report data (CSV/JSON)

**Example:**
```typescript
import { google } from "googleapis";
import { injectable, inject } from "tsyringe";
import * as Tokens from "../../container/tokens.js";

@injectable()
export class BidManagerService {
  private doubleclickbidmanager;

  constructor(
    @inject(Tokens.AppConfig) private config: DbmConfig,
    @inject(Tokens.Logger) private logger: Logger
  ) {
    const auth = new google.auth.GoogleAuth({
      credentials: this.parseServiceAccountCredentials(),
      scopes: ["https://www.googleapis.com/auth/doubleclickbidmanager"],
    });

    this.doubleclickbidmanager = google.doubleclickbidmanager({ version: "v2", auth });
  }

  async getDeliveryMetrics(params: {
    advertiserId: string;
    campaignId: string;
    startDate: string;
    endDate: string;
  }) {
    // Step 1: Create query
    const query = await this.createQuery({
      type: "STANDARD",
      metadata: {
        title: `Delivery metrics for campaign ${params.campaignId}`,
        dataRange: {
          range: "CUSTOM_DATES",
          customStartDate: this.parseDate(params.startDate),
          customEndDate: this.parseDate(params.endDate),
        },
        format: "CSV",
      },
      params: {
        type: "TYPE_GENERAL",
        groupBys: ["FILTER_DATE", "FILTER_MEDIA_PLAN"],
        metrics: [
          "METRIC_IMPRESSIONS",
          "METRIC_CLICKS",
          "METRIC_TOTAL_MEDIA_COST_ADVERTISER",
          "METRIC_CONVERSIONS",
          "METRIC_REVENUE_ADVERTISER",
        ],
        filters: [
          { type: "FILTER_ADVERTISER", value: params.advertiserId },
          { type: "FILTER_MEDIA_PLAN", value: params.campaignId },
        ],
      },
    });

    this.logger.info({ queryId: query.queryId }, "Created Bid Manager query");

    // Step 2: Run query
    const report = await this.runQuery(query.queryId);
    this.logger.info({ reportId: report.key?.reportId }, "Started report generation");

    // Step 3: Poll for completion
    const completedReport = await this.pollForCompletion(
      query.queryId,
      report.key?.reportId
    );

    // Step 4: Fetch and parse report data
    const csvData = await this.fetchReportData(completedReport.metadata?.googleCloudStoragePath);
    const metrics = this.parseDeliveryCSV(csvData);

    return metrics;
  }

  private async createQuery(querySpec: any) {
    const response = await this.doubleclickbidmanager.queries.create({
      requestBody: querySpec,
    });
    return response.data;
  }

  private async runQuery(queryId: string) {
    const response = await this.doubleclickbidmanager.queries.run({
      queryId,
    });
    return response.data;
  }

  private async pollForCompletion(
    queryId: string,
    reportId: string,
    maxWaitMs = 120000
  ) {
    const startTime = Date.now();
    const pollInterval = this.config.reportPollIntervalMs;

    while (Date.now() - startTime < maxWaitMs) {
      const response = await this.doubleclickbidmanager.queries.reports.get({
        queryId,
        reportId,
      });

      const report = response.data;
      if (report.metadata?.status?.state === "DONE") {
        return report;
      }

      if (report.metadata?.status?.state === "FAILED") {
        throw new Error(`Report generation failed: ${report.metadata.status.format}`);
      }

      await this.sleep(pollInterval);
    }

    throw new Error(`Report generation timed out after ${maxWaitMs}ms`);
  }

  private async fetchReportData(gcsPath: string): Promise<string> {
    // GCS path is a signed URL, just fetch it
    const response = await fetch(gcsPath);
    if (!response.ok) {
      throw new Error(`Failed to fetch report: ${response.statusText}`);
    }
    return response.text();
  }

  private parseDeliveryCSV(csvData: string): DeliveryMetrics {
    // Parse CSV and aggregate metrics
    const lines = csvData.split("\n");
    const headers = lines[0].split(",");

    let impressions = 0;
    let clicks = 0;
    let spend = 0;
    let conversions = 0;
    let revenue = 0;

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const values = lines[i].split(",");

      impressions += parseInt(values[headers.indexOf("Impressions")] || "0");
      clicks += parseInt(values[headers.indexOf("Clicks")] || "0");
      spend += parseFloat(values[headers.indexOf("Media Cost (Advertiser Currency)")] || "0");
      conversions += parseInt(values[headers.indexOf("Total Conversions")] || "0");
      revenue += parseFloat(values[headers.indexOf("Revenue (Advertiser Currency)")] || "0");
    }

    return { impressions, clicks, spend, conversions, revenue };
  }

  private parseDate(dateStr: string): { year: number; month: number; day: number } {
    const [year, month, day] = dateStr.split("-").map(Number);
    return { year, month, day };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private parseServiceAccountCredentials() {
    // Parse from base64 or file path...
  }
}

interface DeliveryMetrics {
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  revenue: number;
}
```

### 5. Tool Definitions (`src/mcp-server/tools/definitions/`)

Each tool follows the declarative pattern:

```typescript
// get-campaign-delivery.tool.ts
import { z } from "zod";
import { inject, injectable } from "tsyringe";
import * as Tokens from "../../../container/tokens.js";
import type { BidManagerService } from "../../../services/bid-manager/BidManagerService.js";
import type { RequestContext, SdkContext } from "../../../types-global/index.js";

// 1. Define input schema
export const getCampaignDeliveryParamsSchema = z.object({
  advertiserId: z.string().describe("DV360 Advertiser ID"),
  campaignId: z.string().describe("DV360 Campaign ID"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Start date (YYYY-MM-DD)"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("End date (YYYY-MM-DD)"),
});

// 2. Define tool metadata
export const getCampaignDeliveryTool = {
  name: "dbm_get_campaign_delivery",
  description: "Fetch DV360 delivery metrics (impressions, clicks, spend, conversions) for a campaign within a date range via Bid Manager API.",
  inputSchema: getCampaignDeliveryParamsSchema,
};

// 3. Define tool logic
@injectable()
export class GetCampaignDeliveryLogic {
  constructor(
    @inject(Tokens.BidManagerService) private bidManagerService: BidManagerService,
    @inject(Tokens.Logger) private logger: Logger
  ) {}

  async execute(
    input: z.infer<typeof getCampaignDeliveryParamsSchema>,
    context: RequestContext,
    sdkContext?: SdkContext
  ) {
    this.logger.info(
      { campaignId: input.campaignId, requestId: context.requestId },
      "Fetching campaign delivery metrics via Bid Manager API"
    );

    const metrics = await this.bidManagerService.getDeliveryMetrics({
      advertiserId: input.advertiserId,
      campaignId: input.campaignId,
      startDate: input.startDate,
      endDate: input.endDate,
    });

    return metrics;
  }
}

// 4. Define response formatter
export function getCampaignDeliveryResponseFormatter(
  result: any,
  input: z.infer<typeof getCampaignDeliveryParamsSchema>
) {
  const summary = `Campaign ${input.campaignId} delivery from ${input.startDate} to ${input.endDate}:
- Impressions: ${result.impressions.toLocaleString()}
- Clicks: ${result.clicks.toLocaleString()}
- Spend: $${result.spend.toFixed(2)}
- Conversions: ${result.conversions}
- Revenue: $${result.revenue.toFixed(2)}`;

  return [
    { type: "text", text: summary },
    { type: "text", text: `\n\nFull Data:\n${JSON.stringify(result, null, 2)}` },
  ];
}

// 5. Export complete tool definition
export const getCampaignDeliveryToolDefinition = {
  ...getCampaignDeliveryTool,
  logic: GetCampaignDeliveryLogic,
  responseFormatter: getCampaignDeliveryResponseFormatter,
};
```

---

## Data Flow

### Query Flow (Async Report Generation)

```
1. MCP Client sends JSON-RPC request
   ↓
2. HTTP Transport validates JWT & applies rate limiting
   ↓
3. MCP Server validates input via Zod schema
   ↓
4. Tool logic creates RequestContext
   ↓
5. BidManagerService creates query (POST /queries)
   ↓
6. BidManagerService runs query (POST /queries/{id}:run)
   ↓
7. BidManagerService polls for completion (GET /queries/{id}/reports/{rid})
   ↓ (2-30 seconds typically)
8. Report is ready (status: DONE)
   ↓
9. BidManagerService fetches CSV from GCS
   ↓
10. BidManagerService parses CSV into structured metrics
   ↓
11. Tool logic returns parsed metrics
   ↓
12. Response formatter creates user-friendly summary
   ↓
13. MCP Server returns formatted response
   ↓
14. HTTP Transport sends SSE event to client
```

### OpenTelemetry Instrumentation

Every query is automatically traced:

```
Span: tool.dbm_get_campaign_delivery
  ├─ Span: bidmanager.createQuery
  │   └─ Attributes: advertiserId, campaignId
  ├─ Span: bidmanager.runQuery
  │   └─ Attributes: queryId
  ├─ Span: bidmanager.pollForCompletion
  │   └─ Attributes: queryId, reportId, attempts
  ├─ Span: bidmanager.fetchReportData
  │   └─ Attributes: gcsPath, bytesDownloaded
  └─ Span: bidmanager.parseCSV
      └─ Attributes: rowCount
```

---

## Configuration

### Environment Variables

**Required:**
```bash
# Google Cloud
GCP_PROJECT_ID=your-project-id
SERVICE_ACCOUNT_FILE=/path/to/service-account.json
# OR
SERVICE_ACCOUNT_JSON=<base64-encoded-json>
```

**Optional:**
```bash
# Server
DBM_MCP_PORT=3001
DBM_MCP_HOST=0.0.0.0
NODE_ENV=development

# Authentication (for MCP clients)
MCP_AUTH_MODE=none  # or "jwt" for production
MCP_AUTH_SECRET_KEY=<32-char-secret>

# Observability
LOG_LEVEL=info
OTEL_ENABLED=false
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://your-collector/v1/traces
OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=https://your-collector/v1/metrics

# Rate Limiting
RATE_LIMIT_PER_MINUTE=100

# Report Settings
REPORT_POLL_INTERVAL_MS=2000
REPORT_POLL_TIMEOUT_MS=120000
REPORT_CACHE_TTL_MS=300000
```

---

## Bid Manager API Integration

### Authentication

The Bid Manager API uses OAuth 2.0 with service account credentials:

```typescript
import { google } from "googleapis";

const auth = new google.auth.GoogleAuth({
  keyFile: "/path/to/service-account.json",
  scopes: ["https://www.googleapis.com/auth/doubleclickbidmanager"],
});

const bidmanager = google.doubleclickbidmanager({ version: "v2", auth });
```

### Required Permissions

The service account needs:
- `doubleclickbidmanager.queries.create`
- `doubleclickbidmanager.queries.run`
- `doubleclickbidmanager.reports.get`

### Query Types

| Type | Use Case |
|------|----------|
| `TYPE_GENERAL` | Standard delivery metrics (impressions, clicks, spend) |
| `TYPE_AUDIENCE_COMPOSITION` | Audience demographic breakdowns |
| `TYPE_REACH_FREQUENCY` | Reach and frequency analysis |
| `TYPE_YOUTUBE` | YouTube-specific metrics |

### Available Metrics

Common metrics for delivery reports:

| Metric | Description |
|--------|-------------|
| `METRIC_IMPRESSIONS` | Total impressions served |
| `METRIC_CLICKS` | Total clicks |
| `METRIC_TOTAL_MEDIA_COST_ADVERTISER` | Spend in advertiser currency |
| `METRIC_CONVERSIONS` | Post-click + post-view conversions |
| `METRIC_REVENUE_ADVERTISER` | Revenue in advertiser currency |
| `METRIC_CTR` | Click-through rate |
| `METRIC_ACTIVE_VIEW_MEASURABLE_IMPRESSIONS` | Viewability metrics |

### Available Dimensions (Group Bys)

| Dimension | Description |
|-----------|-------------|
| `FILTER_DATE` | Group by date |
| `FILTER_ADVERTISER` | Group by advertiser |
| `FILTER_MEDIA_PLAN` | Group by campaign (media plan) |
| `FILTER_INSERTION_ORDER` | Group by insertion order |
| `FILTER_LINE_ITEM` | Group by line item |

### Handling Async Reports

Reports typically take 2-30 seconds to generate. The service implements polling with exponential backoff:

```typescript
async function pollWithBackoff(queryId: string, reportId: string) {
  const maxAttempts = 30;
  let delay = 2000; // Start with 2 seconds

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const report = await getReport(queryId, reportId);

    if (report.metadata?.status?.state === "DONE") {
      return report;
    }

    if (report.metadata?.status?.state === "FAILED") {
      throw new Error(`Report failed: ${report.metadata.status.format}`);
    }

    await sleep(delay);
    delay = Math.min(delay * 1.5, 10000); // Max 10 second delay
  }

  throw new Error("Report generation timed out");
}
```

---

## Observability

### Structured Logging

All services use Pino for structured logging:

```typescript
logger.info(
  {
    campaignId: "123",
    queryId: "q-456",
    requestId: context.requestId,
    durationMs: 245,
  },
  "Bid Manager query completed"
);
```

### OpenTelemetry Traces

Every tool execution creates a trace:

```typescript
export async function withBidManagerSpan<T>(
  operation: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const attributes = {
    "bidmanager.operation": operation,
    "bidmanager.version": "v2",
  };

  return withSpan(`bidmanager.${operation}`, fn, attributes);
}
```

### Metrics

Key metrics to track:
- Report generation time (ms)
- Poll attempt count
- Report size (bytes)
- API error rate
- Rate limit violations

---

## Testing Strategy

### Unit Tests

**Services:**
```typescript
// tests/unit/services/bid-manager.test.ts
describe("BidManagerService", () => {
  it("should create a query with correct parameters", async () => {
    const mockApi = {
      queries: {
        create: jest.fn().mockResolvedValue({ data: { queryId: "test-query-123" } }),
      },
    };

    const service = new BidManagerService(mockConfig, mockLogger);
    service["doubleclickbidmanager"] = mockApi as any;

    await service.createQuery({ /* query spec */ });

    expect(mockApi.queries.create).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          params: expect.objectContaining({
            metrics: expect.arrayContaining(["METRIC_IMPRESSIONS"]),
          }),
        }),
      })
    );
  });

  it("should parse CSV report correctly", () => {
    const csvData = `Date,Campaign,Impressions,Clicks,Media Cost (Advertiser Currency)
2025-01-01,123,100000,500,250.00
2025-01-02,123,120000,600,300.00`;

    const service = new BidManagerService(mockConfig, mockLogger);
    const metrics = service["parseDeliveryCSV"](csvData);

    expect(metrics.impressions).toBe(220000);
    expect(metrics.clicks).toBe(1100);
    expect(metrics.spend).toBe(550);
  });
});
```

### Integration Tests

```typescript
// tests/integration/bid-manager-integration.test.ts
describe("Bid Manager Integration", () => {
  beforeAll(async () => {
    // Ensure service account credentials are available
  });

  it("should fetch real delivery metrics from Bid Manager API", async () => {
    const service = container.resolve(BidManagerService);

    const result = await service.getDeliveryMetrics({
      advertiserId: process.env.TEST_ADVERTISER_ID!,
      campaignId: process.env.TEST_CAMPAIGN_ID!,
      startDate: "2025-01-01",
      endDate: "2025-01-07",
    });

    expect(result.impressions).toBeGreaterThanOrEqual(0);
    expect(result.spend).toBeGreaterThanOrEqual(0);
  });
});
```

---

## Implementation Roadmap

### Phase 1: Infrastructure Setup ✅ (COMPLETE)
- [x] Project scaffolding
- [x] Directory structure aligned with dv360-mcp
- [x] Configuration system with Zod validation
- [x] DI container with tsyringe (idempotent pattern)
- [x] HTTP transport with Express + SSE (session tracking)
- [x] Dual transport support (stdio + HTTP)
- [x] Tool definitions (rich pattern with inputSchema, outputSchema, annotations, logic, responseFormatter)
- [x] MCP server module (createMcpServer, runStdioServer)
- [x] Utility infrastructure (errors, security, telemetry, internal)
- [x] OpenTelemetry initialization
- [x] Types-global directory (mcp.ts, bid-manager.ts)

### Phase 2: Bid Manager API Integration (Next)
- [ ] BidManagerService implementation
- [ ] OAuth 2.0 service account authentication
- [ ] Query creation and execution
- [ ] Report polling and download
- [ ] CSV report parsing
- [ ] Error handling for API errors

### Phase 3: Tool Implementation
- [ ] `dbm_get_campaign_delivery` - Delivery metrics via Bid Manager API
- [ ] `dbm_get_performance_metrics` - Calculate KPIs from report data
- [ ] `dbm_get_historical_metrics` - Time-series data with daily granularity
- [ ] `dbm_get_pacing_status` - Pacing calculation (requires budget data)

### Phase 4: Resources & Prompts
- [ ] MCP Resources for metric schemas
- [ ] MCP Resources for report templates
- [ ] Troubleshooting prompts (underdelivery, performance)
- [ ] Workflow prompts (analysis, optimization)

### Phase 5: Observability & Testing
- [ ] OpenTelemetry instrumentation
- [ ] Structured logging throughout
- [ ] Unit tests for all services
- [ ] Integration tests with real Bid Manager API
- [ ] Performance benchmarking (report generation times)

### Phase 6: Production Readiness
- [ ] Rate limiting per advertiser
- [ ] JWT authentication for MCP clients
- [ ] Optional report caching (in-memory or Redis)
- [ ] Documentation (API reference, examples)
- [ ] Cloud Run deployment configuration
- [ ] Monitoring dashboards

---

## Key Differences from dv360-mcp

| Aspect | dv360-mcp | dbm-mcp |
|--------|-----------|---------|
| **Purpose** | Entity management (CRUD) | Reporting & analytics (read-only) |
| **External API** | DV360 API (REST, sync) | Bid Manager API v2 (async reports) |
| **Data Flow** | HTTP → DV360 API → Response | HTTP → Create Query → Poll → Fetch CSV → Parse |
| **Response Time** | ~200-500ms | 2-30 seconds (async report generation) |
| **Write Operations** | Yes (create, update, delete) | No (read-only) |
| **Schema Source** | OpenAPI spec → Zod | API response types + CSV parsing |
| **Primary Service** | `DV360Service` | `BidManagerService` |
| **Tools** | 7 tools (CRUD + workflows) | 4 tools (queries + analytics) |
| **Authentication** | OAuth 2.0 (DV360 API) | OAuth 2.0 (Bid Manager API) |

---

## References

- [Bid Manager API v2 Reference](https://developers.google.com/bid-manager/reference/rest/v2)
- [Bid Manager API Queries Guide](https://developers.google.com/bid-manager/guides/getting-started)
- [MCP Protocol Specification](https://spec.modelcontextprotocol.io/)
- [dv360-mcp Architecture](../../dv360-mcp/docs/ARCHITECTURE.md)
- [Google APIs Node.js Client](https://github.com/googleapis/google-api-nodejs-client)
- [OpenTelemetry Node.js](https://opentelemetry.io/docs/instrumentation/js/)
- [Pino Logging](https://github.com/pinojs/pino)

---

## Validation and Testing Hardening

### Validation Source of Truth

- `src/mcp-server/tools/utils/query-validation.ts` defines report/filter/metric/date-range compatibility checks.
- `src/mcp-server/tools/definitions/run-custom-query.tool.ts` applies strict schema-time validation via `superRefine`.
- Validation errors include resource hints (`filter-types://all`, `metric-types://all`, `report-types://all`) to guide operators and agents.

### Testing Strategy (Current)

- **Service tests** in `tests/services/` validate Bid Manager service behavior, auth bridge, and parsing helpers.
- **Tool tests** in `tests/tools/` validate tool logic/formatting.
- **Transport integration tests** in `tests/integration/` validate:
  - query workflow request handling
  - session lifecycle (`POST /mcp`, `DELETE /mcp`, session reuse rejection)
  - error propagation through MCP transport responses

---

**Document Status:** Phase 1 Complete - Infrastructure aligned with dv360-mcp
**Last Updated:** 2025-12-02
**Next Steps:** Begin Phase 2 (Bid Manager API Integration)
