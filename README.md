# BidShifter - AI-Native Multi-Platform Campaign Optimization

**AI-powered programmatic advertising optimization across DV360, Google Ads, Meta, and future DSPs**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-2024--11--05-green)](https://modelcontextprotocol.io/)

---

## Overview

BidShifter is a **Model Context Protocol (MCP) based optimization platform** that enables AI agents to autonomously manage programmatic advertising campaigns. Built on three separate MCP servers, BidShifter provides clean separation between reporting, campaign management, and optimization intelligence.

### Key Features

- **🤖 AI-Native Design** - Claude and other AI agents as primary interface
- **🌐 Multi-Platform Support** - Works across DV360, Google Ads, Meta, and future DSPs
- **🔧 Composable Architecture** - Three independent MCP servers can be used separately or combined
- **📊 Intelligent Optimization** - Automatically adjusts bids and margins using proven pacing algorithms
- **🔍 Full Transparency** - Every decision is explainable and auditable
- **💰 Cost-Efficient** - GCP-native architecture: ~$150-230/month (70% cheaper than Firebase Functions)

---

## Architecture

BidShifter uses a **GCP-native architecture** with three Cloud Run services:

```
┌─────────────────────────────────────────────────────────────────┐
│                         AI Clients                              │
│                   (Claude Desktop, Custom Agents)               │
└────────────────────┬────────────────┬──────────────────────────┘
                     │                │
                     │ HTTPS          │ JWT Bearer Tokens
                     │ (MCP Protocol) │
        ┌────────────┼────────────────┼────────────┐
        │            │                │            │
        ▼            ▼                ▼            │
┌──────────────┐ ┌──────────────┐ ┌──────────────┐│
│   Cloud Run  │ │   Cloud Run  │ │   Cloud Run  ││
│   Reporting  │ │  Management  │ │ Optimization ││
│  MCP Server  │ │  MCP Server  │ │  MCP Server  ││
│              │ │              │ │              ││
│ Read-only    │ │ CRUD Ops     │ │ Intelligence ││
│ queries      │ │ SDF updates  │ │ orchestrates ││
│ BigQuery     │ │ via DV360    │ │ other two    ││
│ normalized   │ │ Google Ads   │ │ servers      ││
│ data         │ │ Meta APIs    │ │              ││
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘│
       │                │                │        │
       └────────────────┼────────────────┘        │
                        │                         │
                        ▼                         │
           ┌────────────────────────┐             │
           │  GCP Data & Compute    │             │
           │                        │◄────────────┘
           │  • BigQuery            │
           │    - Delivery metrics  │
           │    - Configuration     │
           │    - Task state        │
           │  • Cloud Storage (SDF) │
           │  • Pub/Sub (events)    │
           │  • Secret Manager      │
           │  • Cloud Scheduler     │
           └────────┬───────────────┘
                    │
                    ▼
           ┌────────────────────┐
           │   External APIs    │
           │  • DV360 API v4    │
           │  • Bid Manager v2  │
           │  • Google Ads API  │
           │  • Meta API        │
           └────────────────────┘

Cloud Scheduler Jobs (Automated):
  • data-sync (every 4h) → Reporting Server
  • optimization-scan (every 4h) → Optimization Server
  • adjustment-executor (every 30m) → Management Server
  • outcome-tracker (daily) → Optimization Server
```

### Key Architectural Decisions

**GCP-Only Architecture**: We use GCP Cloud Run services exclusively, avoiding the complexity of a hybrid Cloudflare + GCP setup. This provides:

- **Simpler operations**: Single cloud provider, unified monitoring
- **Lower cost**: ~$150-220/month vs ~$205/month with Cloudflare
- **Better integration**: Direct access to BigQuery, Pub/Sub
- **Easier authentication**: Cloud IAM + JWT, no edge layer complexity

**Direct HTTP Transport**: Each MCP server exposes the MCP protocol directly via HTTPS on Cloud Run, eliminating the need for an edge gateway layer.

### Server 1: `dbm-mcp`

**Generic cross-platform reporting queries**

- Fetch delivery metrics (impressions, clicks, spend, conversions)
- Calculate performance metrics (CPM, CTR, CPA, ROAS)
- Time-series data for trend analysis
- Real-time pacing calculations

**Platforms Supported**: DV360, Google Ads, Meta (extensible to any DSP)

### Server 2: `dv360-mcp`

**DV360 campaign entity management**

- Fetch campaign hierarchies (advertisers → campaigns → line items)
- Update budgets, flight dates, status (active/paused)
- Update bids (CPM, CPC) and revenue margins
- Create new line items (future)

**Platform**: DV360 via SDF (Structured Data Files)

### Server 3: `bidshifter-mcp`

**BidShifter-specific optimization intelligence**

- Analyze pacing and calculate bid adjustments
- Optimize revenue margins
- Track historical adjustments and effectiveness
- Provide AI agent guidance via MCP prompts
- Orchestrates `dbm-mcp` and `dv360-mcp` servers

**Platform-Agnostic**: Works with any platform supported by reporting and management servers

---

## Current Status

**Phase: Scaffolding Complete ✅**

The monorepo architecture is now fully scaffolded with:
- ✅ Root configuration (pnpm workspaces, Turborepo, TypeScript)
- ✅ Shared packages (`@bidshifter/shared`, `@bidshifter/platform-lib`)
- ✅ Three MCP server packages (dbm-mcp, dv360-mcp, bidshifter-mcp)
- ✅ Dockerfiles for containerization
- ✅ Development scripts

**Next Steps:**
1. Run `pnpm install` to install dependencies
2. Run `pnpm run build` to verify compilation
3. Implement actual MCP server logic (tools, services, integrations)
4. Add BigQuery, Redis, and platform API integrations
5. Deploy Terraform infrastructure
6. Deploy servers to GCP Cloud Run

## Quick Start

### Prerequisites

- **Node.js** (>= 20.0.0)
- **pnpm** (>= 8.0.0) - `npm install -g pnpm`
- **Terraform** (>= 1.6.0) *(for deployment)*
- **GCP Account** with billing enabled *(for deployment)*
- **Docker** (for containerization)

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/bidshifter-mcp.git
cd bidshifter-mcp
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Set Up Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your credentials
# - GCP project ID
# - JWT secret for authentication
# - DV360 OAuth credentials
# - Google Ads API credentials (optional)
# - Meta API credentials (optional)
```

### 4. Build All Packages

```bash
# Build all packages using Turborepo
pnpm run build

# Or build and watch for changes
pnpm run dev
```

### 5. Run Individual Servers Locally

```bash
# Start dbm-mcp (port 3001)
./scripts/dev-server.sh dbm-mcp

# Start dv360-mcp (port 3002)
./scripts/dev-server.sh dv360-mcp

# Start bidshifter-mcp (port 3003)
./scripts/dev-server.sh bidshifter-mcp
```

### 6. Deploy Infrastructure *(Coming Soon)*

```bash
# Initialize Terraform
cd terraform
terraform init

# Deploy to development environment
terraform apply -var-file=environments/dev.tfvars
```

### 7. Configure AI Agent (Claude Desktop) *(After Deployment)*

Edit your Claude Desktop MCP configuration:

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
    },
    "bidshifter-optimization": {
      "url": "https://optimization.bidshifter.io/mcp",
      "apiKey": "your-optimization-api-key"
    }
  }
}
```

---

## Repository Structure

```
bidshifter-mcp/
├── packages/
│   ├── dbm-mcp/                 # MCP Server 1: Cross-platform reporting
│   │   ├── src/
│   │   │   ├── mcp-server/      # MCP tool definitions
│   │   │   ├── services/        # BigQuery, platform adapters
│   │   │   ├── http-transport.ts # Express HTTP server
│   │   │   └── index.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── dv360-mcp/               # MCP Server 2: DV360 management
│   │   ├── src/
│   │   │   ├── mcp-server/      # MCP tool definitions
│   │   │   ├── services/        # DV360 API & SDF integrations
│   │   │   ├── http-transport.ts # Express HTTP server
│   │   │   └── index.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── bidshifter-mcp/          # MCP Server 3: BidShifter optimization
│   │   ├── src/
│   │   │   ├── mcp-server/      # MCP tools, prompts, resources
│   │   │   ├── services/        # Optimization algorithms
│   │   │   ├── scheduled/       # Cloud Scheduler endpoints
│   │   │   ├── http-transport.ts # Express HTTP server
│   │   │   └── index.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── shared/                  # Shared code
│       ├── types/               # Zod schemas, TypeScript types
│       ├── utils/               # Common utilities
│       ├── auth/                # JWT validation middleware
│       └── package.json
│
├── terraform/                   # Infrastructure as Code
│   ├── modules/
│   │   ├── mcp-server/          # Reusable Cloud Run module
│   │   ├── bigquery/            # BigQuery datasets and tables
│   │   ├── pubsub/              # Pub/Sub topics
│   │   └── networking/          # VPC, NAT, firewall
│   ├── environments/
│   │   ├── dev.tfvars
│   │   ├── staging.tfvars
│   │   └── prod.tfvars
│   └── main.tf
│
├── scripts/                     # Deployment automation
│   ├── deploy.sh                # Deploy all servers
│   ├── deploy-server.sh         # Deploy individual server
│   └── init-gcp-project.sh      # One-time GCP setup
│
├── docs/                        # Documentation
│   ├── BidShifter-PRD.md        # Product Requirements Document
│   ├── bidshifter-mcp-design-architecture.md  # Architecture design
│   └── mcp-tool-catalog.md      # All MCP tools reference
│
├── package.json                 # Root workspace config
├── pnpm-workspace.yaml          # pnpm workspace definition
├── turbo.json                   # Turborepo config
└── README.md                    # This file
```

---

## MCP Tools Reference

### Reporting Server Tools

| Tool                      | Description                           | Parameters                                          |
| ------------------------- | ------------------------------------- | --------------------------------------------------- |
| `get_campaign_delivery`   | Fetch delivery metrics for date range | `campaignId`, `startDate`, `endDate`, `platform`    |
| `get_performance_metrics` | Calculate CPM, CTR, CPA, ROAS         | `campaignId`, `dateRange`                           |
| `get_historical_metrics`  | Time-series data for trends           | `campaignId`, `startDate`, `endDate`, `granularity` |
| `get_platform_entities`   | Fetch campaign hierarchy              | `advertiserId`, `platform`                          |
| `get_pacing_status`       | Real-time pacing calculation          | `campaignId`                                        |

### Management Server Tools

| Tool                      | Description                           | Parameters                           |
| ------------------------- | ------------------------------------- | ------------------------------------ |
| `fetch_campaign_entities` | Retrieve full hierarchy from platform | `advertiserId`, `platform`           |
| `update_campaign_budget`  | Change campaign/IO budget             | `campaignId`, `newBudget`, `reason`  |
| `update_campaign_dates`   | Adjust flight dates                   | `campaignId`, `startDate`, `endDate` |
| `update_line_item_status` | Pause/activate line items             | `lineItemId`, `status`               |
| `update_line_item_bid`    | Change CPM/CPC bid                    | `lineItemId`, `newBid`, `reason`     |
| `update_revenue_margin`   | Adjust margin percentage              | `lineItemId`, `newMargin`, `reason`  |

### Optimization Server Tools

| Tool                               | Description                      | Parameters                         |
| ---------------------------------- | -------------------------------- | ---------------------------------- |
| `optimize_campaign_bids`           | Analyze and adjust bids          | `campaignId`, `strategy`, `dryRun` |
| `adjust_revenue_margin`            | Optimize margin-based line items | `lineItemId`, `strategy`           |
| `get_optimization_recommendations` | Preview adjustments (dry-run)    | `campaignId`, `strategy`           |
| `get_adjustment_history`           | Track historical decisions       | `lineItemId`, `lookbackDays`       |
| `get_pacing_forecast`              | Project future delivery          | `campaignId`, `forecastDays`       |
| `configure_optimization`           | Set strategy and thresholds      | `campaignId`, `config`             |

### Optimization Server Prompts

| Prompt                           | Description                           | Use Case                                                |
| -------------------------------- | ------------------------------------- | ------------------------------------------------------- |
| `campaign_optimization_workflow` | Step-by-step optimization guide       | Full campaign optimization from assessment to execution |
| `troubleshoot_underdelivery`     | Diagnostic workflow for pacing issues | Campaign underdelivering significantly                  |
| `margin_optimization_strategy`   | Margin-specific optimization guidance | Revenue-based line items with margin goals              |

---

## Example AI Agent Workflows

### Workflow 1: Query Campaign Performance

```
User: "How did Campaign 12345 perform last week?"

AI Agent:
1. Calls dbm-mcp.get_campaign_delivery
   - campaignId: "12345"
   - startDate: "2025-01-13"
   - endDate: "2025-01-19"
   - platform: "dv360"

2. Calls dbm-mcp.get_performance_metrics
   - campaignId: "12345"
   - dateRange: "last_week"

3. Synthesizes response with metrics and insights
```

### Workflow 2: Optimize Underdelivering Campaign

```
AI Agent (autonomous, triggered by scheduled scan):
1. Detects Campaign 12345 at 72% pacing (expected 85%)

2. Calls bidshifter-mcp.get_optimization_recommendations
   - campaignId: "12345"
   - strategy: "moderate"
   - dryRun: true

3. Reviews recommendations:
   - 15 line items need bid increases
   - Average +12% CPM adjustment
   - All within configured thresholds

4. Calls bidshifter-mcp.optimize_campaign_bids
   - campaignId: "12345"
   - strategy: "moderate"
   - dryRun: false

5. Posts notification to Slack:
   "Optimized Campaign 12345: 15 line items adjusted, avg +12% CPM.
    Expected pacing improvement: 72% → 81%"
```

### Workflow 3: Manual Bid Override

```
User: "Increase the bid for line item 67890 to $3.50 CPM"

AI Agent:
1. Calls dv360-mcp.update_line_item_bid
   - lineItemId: "67890"
   - newBid: 3.50
   - reason: "Manual override requested by user"

2. Confirms change:
   "Line item 67890 bid updated to $3.50 CPM.
    Previous bid: $2.80 CPM (+25% increase)"
```

---

## Deployment

### Development Environment

```bash
# Deploy to dev (scales to zero when idle)
pnpm run deploy:dev
```

### Staging Environment

```bash
# Deploy to staging (1 warm instance)
pnpm run deploy:staging
```

### Production Environment

```bash
# Deploy to production (1+ warm instances)
pnpm run deploy:prod
```

### Individual Server Deployment

```bash
# Deploy only reporting server
pnpm run deploy:reporting --env=dev

# Deploy only optimization server
pnpm run deploy:optimization --env=prod
```

---

## Monitoring

### View Logs

```bash
# Real-time logs for specific server
gcloud run services logs tail dbm-mcp --region=europe-west2

# Recent errors across all servers
gcloud logging read 'severity>=ERROR AND resource.labels.service_name=~"(dbm|dv360|bidshifter)-mcp"' --limit=50
```

### Metrics Dashboard

Access Cloud Monitoring dashboards:

- [DBM Server Metrics](https://console.cloud.google.com/monitoring/dashboards/custom/dbm-mcp)
- [DV360 Server Metrics](https://console.cloud.google.com/monitoring/dashboards/custom/dv360-mcp)
- [BidShifter Server Metrics](https://console.cloud.google.com/monitoring/dashboards/custom/bidshifter-mcp)

### Cost Monitoring

```bash
# View monthly costs by service
gcloud billing accounts list
gcloud beta billing projects describe YOUR_PROJECT_ID
```

**Expected Costs** (50 advertisers, 500 campaigns):

- GCP Cloud Run: $90-120/month (all three servers, scales to zero when idle)
- BigQuery: $40-70/month (queries + storage for metrics, config, task state)
- Cloud Storage: $5-10/month (SDF files, entity snapshots, 7-day retention)
- Pub/Sub: $5-10/month (audit events, < 1M messages/month)
- VPC/NAT: $10-20/month (controlled egress for API calls)
- Other: $5-10/month (Secret Manager, Cloud Scheduler, logging)
- **Total: ~$155-240/month** (70% cheaper than Firebase Functions at $800/month)

---

## Development

### Local Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm run build

# Run tests
pnpm run test

# Type checking
pnpm run typecheck

# Lint
pnpm run lint
```

### Running Locally

```bash
# Start dbm server locally
cd packages/dbm-mcp
pnpm run dev

# Start dv360 server locally
cd packages/dv360-mcp
pnpm run dev

# Start bidshifter server locally
cd packages/bidshifter-mcp
pnpm run dev
```

### Testing MCP Tools

```bash
# Use MCP Inspector to test tools
npx @modelcontextprotocol/inspector packages/reporting-mcp

# Or use curl to test HTTP transport
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }'
```

---

## Documentation

- **[Product Requirements Document](docs/BidShifter-PRD.md)** - Full product specification
- **[Architecture Design](docs/bidshifter-mcp-design-architecture.md)** - Technical architecture details
- **[MCP Tool Catalog](docs/mcp-tool-catalog.md)** - Complete tool reference
- **[Development Guide](docs/development-guide.md)** - Developer workflows
- **[Deployment Guide](docs/deployment-guide.md)** - Production deployment

---

## Technology Stack

**Languages & Frameworks**

- TypeScript 5.0+
- Node.js 20 LTS
- Zod (schema validation)
- Express.js (HTTP server)

**GCP Services**

- **Cloud Run** - Containerized microservices (0-10 instances auto-scaling)
- **BigQuery** - Data warehouse (delivery metrics, configuration, task state, audit logs)
- **Cloud Storage** - Object storage (SDF files, entity snapshots, task artifacts)
- **Pub/Sub** - Event streaming (audit trail, async workflows)
- **Secret Manager** - Credentials storage (OAuth tokens, API keys, JWT secrets)
- **Cloud Scheduler** - Cron jobs (data sync, optimization scans)
- **VPC & Cloud NAT** - Networking (controlled egress, static IPs)

**External APIs**

- DV360 API v4 + Bid Manager API v2
- Google Ads API
- Meta Marketing API

**Development Tools**

- Terraform (Infrastructure as Code)
- Docker (containerization)
- Turborepo (monorepo builds)
- pnpm (package management)
- GitHub Actions (CI/CD)

---

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make changes and write tests
4. Run tests: `pnpm run test`
5. Commit changes: `git commit -am 'Add your feature'`
6. Push to branch: `git push origin feature/your-feature`
7. Create a Pull Request

---

## License

[MIT License](LICENSE)

---

## Support

For issues or questions:

- **Documentation**: Check [docs/](docs/) for detailed guides
- **GitHub Issues**: Report bugs or request features
- **Email**: support@bidshifter.io

---

## Roadmap

### Q1 2025

- ✅ Three MCP servers architecture design
- ✅ Monorepo scaffolding (pnpm workspaces + Turborepo)
- ✅ Shared packages (types, utilities, authentication)
- ✅ MCP server templates with HTTP/SSE transport
- 🚧 DV360 support (reporting + management + optimization)
- 🚧 BigQuery integration
- 🚧 Redis caching layer
- 🚧 Google Ads support
- 🚧 Meta support

### Q2 2025

- 📋 Machine learning for adjustment effectiveness prediction
- 📋 Budget optimization across campaigns
- 📋 Goal performance optimization (CPA/ROAS targeting)

### Q3 2025

- 📋 The Trade Desk platform support
- 📋 Amazon DSP platform support
- 📋 Creative performance analysis

### Q4 2025

- 📋 Cross-platform budget allocation
- 📋 Advanced forecasting with confidence intervals
- 📋 White-label solution for agencies

---

**Built with ❤️ for AI-native advertising optimization**
