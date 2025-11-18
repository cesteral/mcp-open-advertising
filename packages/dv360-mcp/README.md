# @bidshifter/dv360-mcp

DV360 MCP Server - Campaign entity management and configuration for Google Display & Video 360.

## Purpose

Management server for DV360 campaign entities. Provides CRUD operations for campaigns, insertion orders, line items, creatives, and other DV360 entities via the Display & Video 360 API v4.

## Features

- **Schema-Driven Architecture**: Auto-generated TypeScript types and Zod schemas from DV360 OpenAPI specification
- **Dynamic Entity System**: Supports 11 DV360 entity types with minimal configuration
- **Production-Grade**: OpenTelemetry instrumentation, structured logging, rate limiting, JWT authentication
- **MCP Protocol**: Full Model Context Protocol implementation with HTTP/SSE and stdio transports
- **Claude Desktop Integration**: Seamless integration with Claude Desktop for AI-powered DV360 management

## Quick Start with Claude Desktop

The fastest way to get started is using Claude Desktop:

1. **Get service account credentials** - See [SERVICE_ACCOUNT_SETUP.md](./docs/SERVICE_ACCOUNT_SETUP.md)
2. **Build the server:**
   ```bash
   cd packages/dv360-mcp && pnpm run build
   ```
3. **Configure Claude Desktop** with your service account file path
4. **Start using DV360 tools** directly in Claude Desktop

See [CLAUDE_DESKTOP_SETUP.md](./docs/CLAUDE_DESKTOP_SETUP.md) for detailed setup instructions.

## Current Implementation Status

✅ **Production-Ready Infrastructure** (7/8 tools fully functional)

The server is built with production-grade architecture and nearly complete functionality:

- ✅ HTTP/SSE transport with session management
- ✅ 8 MCP tools (7 connected to DV360 API, 1 using mock data)
- ✅ OAuth2 service account authentication
- ✅ Rate limiting and error handling
- ✅ OpenTelemetry observability
- ✅ Dynamic entity system supporting 11 entity types
- ⚠️ Requires DV360 service account credentials (see Setup below)

## MCP Tools

### Entity Management Tools (Generic CRUD)

1. **`dv360_list_entities`** ✅
   - List entities of any type (campaigns, line items, creatives, etc.)
   - Parameters: `entityType`, `advertiserId`, `pageSize`, `pageToken`

2. **`dv360_get_entity`** ✅
   - Get a specific entity by ID
   - Parameters: `entityType`, `entityId`, `advertiserId`

3. **`dv360_create_entity`** ✅
   - Create a new entity
   - Parameters: `entityType`, `advertiserId`, `entityData`

4. **`dv360_update_entity`** ✅
   - Update an existing entity
   - Parameters: `entityType`, `entityId`, `advertiserId`, `entityData`, `updateMask`

5. **`dv360_delete_entity`** ✅
   - Delete an entity
   - Parameters: `entityType`, `entityId`, `advertiserId`

### Workflow Tools (Batch Operations)

6. **`dv360_adjust_line_item_bids`** ✅
   - Batch update bids for multiple line items
   - Parameters: `advertiserId`, `lineItemIds`, `bidAdjustment` (percentage or absolute)

7. **`dv360_bulk_update_status`** ✅
   - Batch update status for multiple entities
   - Parameters: `entityType`, `advertiserId`, `entityIds`, `status`

## Supported Entity Types

The server supports 11 DV360 entity types through the dynamic entity system:

- `Partner` - DV360 partner accounts
- `Advertiser` - Advertiser accounts
- `Campaign` - Advertising campaigns
- `InsertionOrder` - Insertion orders (IO)
- `LineItem` - Line items
- `AdGroup` - Ad groups
- `AdGroupAd` - Ads within ad groups
- `Creative` - Creative assets
- `CustomBiddingAlgorithm` - Custom bidding algorithms
- `InventorySource` - Inventory sources
- `LocationList` - Geographic location lists

## Prerequisites

1. **Node.js**: v20 or later
2. **pnpm**: v8 or later
3. **Google Cloud Project** with DV360 API enabled
4. **Service Account** with DV360 API access (see [Setup Guide](./docs/SERVICE_ACCOUNT_SETUP.md))

## Installation

```bash
# From monorepo root
pnpm install

# Build the package
cd packages/dv360-mcp
pnpm run build
```

## Configuration

### 1. Service Account Setup (Required)

Follow the detailed guide: [docs/SERVICE_ACCOUNT_SETUP.md](./docs/SERVICE_ACCOUNT_SETUP.md)

Quick summary:

1. Create GCP service account with DV360 API access
2. Download service account JSON key
3. Store it securely (outside the project directory)

### 2. Choose Your Configuration Method

#### Option A: Local Development (HTTP Server)

For testing with HTTP transport:

```bash
cd packages/dv360-mcp
cp .env.example .env
```

Edit `.env` and configure ONE of these credential options:

```bash
# RECOMMENDED: Path to service account JSON file
DV360_SERVICE_ACCOUNT_FILE=/absolute/path/to/service-account.json

# OR: Base64-encoded credentials
DV360_SERVICE_ACCOUNT_JSON=<base64-encoded-json>

# OR: GCP Secret Manager (production)
SERVICE_ACCOUNT_SECRET_ID=projects/123/secrets/dv360-sa/versions/latest
```

#### Option B: Claude Desktop Integration (Recommended)

For using with Claude Desktop, configure via Claude Desktop settings:

See [docs/CLAUDE_DESKTOP_SETUP.md](./docs/CLAUDE_DESKTOP_SETUP.md) for complete instructions.

Quick configuration:

```json
{
  "mcpServers": {
    "dv360-mcp-local": {
      "command": "node",
      "args": ["/absolute/path/to/packages/dv360-mcp/dist/index.js"],
      "cwd": "/absolute/path/to/packages/dv360-mcp",
      "env": {
        "NODE_ENV": "development",
        "DV360_SERVICE_ACCOUNT_FILE": "/absolute/path/to/service-account.json"
      }
    }
  }
}
```

**Why file-based credentials?**

- ✅ Most secure for local development
- ✅ Easy to rotate and manage
- ✅ Standard Google Cloud practice
- ✅ No risk of committing secrets

## Development

### Start Development Server

```bash
# Option 1: Using dev-server script (from repo root)
./scripts/dev-server.sh dv360-mcp

# Option 2: Direct command
cd packages/dv360-mcp
pnpm run dev:http
```

Server starts on `http://localhost:3002`

### Available Scripts

```bash
pnpm run dev:http          # Start with hot reload
pnpm run build             # Build TypeScript
pnpm run typecheck         # Type checking
pnpm run generate:schemas  # Regenerate DV360 schemas from API
pnpm run test              # Run tests (when implemented)
```

### Testing the Server

**Health Check:**

```bash
curl http://localhost:3002/health
```

**SSE Endpoint (MCP Protocol):**

```bash
curl http://localhost:3002/sse
```

**List Tools (via MCP):**

```bash
curl -X POST http://localhost:3002/sse \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Production Deployment

The server is containerized and ready for Cloud Run deployment:

```bash
# Build Docker image
docker build -t dv360-mcp .

# Run locally
docker run -p 3002:3002 --env-file .env dv360-mcp
```

For production deployment via Cloud Run, see root-level Terraform configuration.

## Architecture

### Key Components

- **`src/index.ts`** - Entry point, starts HTTP server
- **`src/config/`** - Environment configuration
- **`src/container/`** - Dependency injection setup (tsyringe)
- **`src/mcp-server/server.ts`** - MCP server creation
- **`src/mcp-server/transports/http-transport.ts`** - HTTP/SSE transport layer
- **`src/mcp-server/tools/`** - MCP tool definitions
- **`src/services/dv360/`** - DV360 API client service
- **`src/generated/schemas/`** - Auto-generated TypeScript types and Zod schemas

### Schema Generation

The server uses auto-generated schemas from the DV360 OpenAPI specification:

```bash
pnpm run generate:schemas
```

This generates:

- `src/generated/schemas/types.ts` - TypeScript types (1,962 lines)
- `src/generated/schemas/zod.ts` - Zod validation schemas (1,874 lines)

The schemas provide 80% size reduction from the original Discovery Document (932KB → 185KB).

## Documentation

Comprehensive documentation available in `docs/`:

- **[CLAUDE_DESKTOP_SETUP.md](./docs/CLAUDE_DESKTOP_SETUP.md)** - Claude Desktop integration guide ⭐
- **[SERVICE_ACCOUNT_SETUP.md](./docs/SERVICE_ACCOUNT_SETUP.md)** - GCP service account setup
- **[ARCHITECTURE.md](./docs/ARCHITECTURE.md)** - Detailed architecture overview
- **[DYNAMIC_ENTITY_SYSTEM.md](./docs/DYNAMIC_ENTITY_SYSTEM.md)** - Entity mapping system
- **[ENTITY-EXAMPLES-INTEGRATION.md](./docs/ENTITY-EXAMPLES-INTEGRATION.md)** - Usage patterns
- **[OPENTELEMETRY-IMPLEMENTATION.md](./docs/OPENTELEMETRY-IMPLEMENTATION.md)** - Observability setup

## Troubleshooting

### Authentication Errors

**"DV360 service account credentials not configured"**

Check which credential option you're using:

```bash
# For file-based credentials
cat /path/to/service-account.json | jq .

# For base64 credentials
echo $DV360_SERVICE_ACCOUNT_JSON | base64 -d | jq .

# For Claude Desktop, check the logs
tail -50 ~/Library/Logs/Claude/mcp-server-dv360-mcp-local.log | grep -E "config|SERVICE_ACCOUNT"
```

**Verify API access:**

- Ensure DV360 API is enabled in GCP project
- Verify service account has `display-video` scope
- Check service account has access in DV360 partner/advertiser settings

### Server Won't Start

**Check dependencies and build:**

```bash
# Install dependencies
pnpm install

# Rebuild
pnpm run build

# Test locally
node dist/index.js
# Should show: "[config] Loaded .env..." or "Loading service account from file"
```

### API rate limiting

The server implements per-advertiser rate limiting (default: 60 requests/minute).

If hitting limits:

1. Check `DV360_RATE_LIMIT_PER_MINUTE` in `.env`
2. Monitor logs for rate limit warnings
3. Consider batching operations using workflow tools

### View logs

```bash
# Local development
pnpm run dev:http

# Production (Cloud Run)
gcloud run services logs tail dv360-mcp --region=europe-west2
```

## Next Steps

### Add Tests

The testing infrastructure is in place but tests need to be written:

```bash
# Run tests (when implemented)
pnpm run test
```

### Enable OpenTelemetry

For production observability:

```bash
# In .env
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://your-collector/v1/traces
OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=https://your-collector/v1/metrics
```

## Contributing

This package is part of the BidShifter monorepo. See root-level `CLAUDE.md` for development guidelines.

## License

Private - BidShifter Internal Use Only
