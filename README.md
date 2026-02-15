# Cesteral - AI-Native Multi-Platform Campaign Optimization

**AI-powered programmatic advertising optimization across DV360, Google Ads, Meta, and future DSPs**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-2024--11--05-green)](https://modelcontextprotocol.io/)

---

## Overview

Cesteral is a **Model Context Protocol (MCP) based optimization platform** that enables AI agents to autonomously manage programmatic advertising campaigns. Built on four independent MCP servers, Cesteral separates reporting and platform management concerns while allowing cross-server workflows.

### Key Features

- **🤖 AI-Native Design** - Claude and other AI agents as primary interface
- **🌐 Multi-Platform Support** - Works across DV360, Google Ads, Meta, and future DSPs
- **🔧 Composable Architecture** - Four independent MCP servers can be used separately or combined
- **📊 Intelligent Optimization** - Automatically adjusts bids and margins using proven pacing algorithms
- **🔍 Full Transparency** - Every decision is explainable and auditable
- **💰 Cost-Efficient** - GCP-native architecture optimized for efficiency

---

## Architecture

Cesteral uses a **GCP-native architecture** with four independently deployable Cloud Run MCP services:

- `dbm-mcp` for reporting and query workflows
- `dv360-mcp` for DV360 management workflows
- `ttd-mcp` for The Trade Desk management/reporting workflows
- `gads-mcp` for Google Ads campaign management and reporting workflows

### Access Model

- **Direct microservice access (default)**: AI clients connect to one or more MCP servers directly.
- **Optional orchestration layer (recommended for complex automation)**: a dedicated orchestration service can call multiple MCP servers as internal MCP clients for multi-step workflows.

This dual-access model preserves service autonomy while enabling cross-server automation when needed.

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

### Server 3: `ttd-mcp`

**The Trade Desk campaign entity management and reporting**

- Full CRUD on TTD entities (advertisers, campaigns, ad groups, ads)
- List and filter entities with pagination
- Generate and retrieve TTD performance reports
- Per-session auth via partner ID + API secret

**Platform**: The Trade Desk REST API

### Server 4: `gads-mcp`

**Google Ads campaign management and reporting**

- Execute GAQL (Google Ads Query Language) queries for reporting
- Full CRUD on Google Ads entities (campaigns, ad groups, ads, keywords, budgets, extensions)
- List accessible customer accounts
- Bulk mutate operations and batch status updates
- Per-session auth via OAuth2 + developer token headers

**Platform**: Google Ads REST API v23

---

## Current Status

**Phase: Production-Ready ✅**

The platform currently includes:
- ✅ Four implemented MCP server packages (`dbm-mcp`, `dv360-mcp`, `ttd-mcp`, `gads-mcp`)
- ✅ Shared runtime package (`@cesteral/shared`) for auth, telemetry, and common handlers
- ✅ Live platform/API integrations and Streamable HTTP transports
- ✅ Terraform + Cloud Build coverage for independent service deployment

**Current Focus:**
1. Keep contract/adapter governance aligned across all platform packages
2. Harden telemetry dashboards and evaluator feedback loops
3. Continue incremental rollout and production operations improvements

## Quick Start

### Prerequisites

- **Node.js** (>= 20.0.0)
- **pnpm** (>= 8.0.0) - `npm install -g pnpm`
- **Terraform** (>= 1.6.0) *(for deployment)*
- **GCP Account** with billing enabled *(for deployment)*
- **Docker** (for containerization)

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/cesteral-mcp.git
cd cesteral-mcp
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

# Start ttd-mcp (port 3003)
./scripts/dev-server.sh ttd-mcp

# Start gads-mcp (port 3004)
./scripts/dev-server.sh gads-mcp
```

### 6. Deploy Infrastructure

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
    "cesteral-reporting": {
      "url": "https://reporting.cesteral.io/mcp",
      "apiKey": "your-reporting-api-key"
    },
    "cesteral-management": {
      "url": "https://management.cesteral.io/mcp",
      "apiKey": "your-management-api-key"
    },
    "cesteral-ttd": {
      "url": "https://ttd.cesteral.io/mcp",
      "apiKey": "your-ttd-api-key"
    }
  }
}
```

---

## Repository Structure

```
cesteral-mcp/
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
│   ├── Cesteral-PRD.md        # Product Requirements Document
│   ├── cesteral-mcp-design-architecture.md  # Architecture design
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
| `get_pacing_status`       | Real-time pacing calculation          | `campaignId`                                        |
| `run_custom_query`        | Execute dynamic DBM report queries    | `reportType`, `filters`, `metrics`, `dimensions`    |

### Management Server Tools

| Tool                                 | Description                                         | Parameters |
| ------------------------------------ | --------------------------------------------------- | ---------- |
| `dv360_list_entities`                | Generic list for DV360 entities                     | `entityType`, IDs, filters, paging |
| `dv360_get_entity`                   | Fetch one DV360 entity by type/id                   | `entityType`, entity IDs |
| `dv360_create_entity`                | Create any supported DV360 entity                   | `entityType`, IDs, `data` |
| `dv360_update_entity`                | Update any supported DV360 entity with updateMask   | `entityType`, IDs, `data`, `updateMask` |
| `dv360_delete_entity`                | Delete any supported DV360 entity                   | `entityType`, entity IDs |
| `dv360_adjust_line_item_bids`        | Batch bid adjustments for multiple line items       | `advertiserId`, `adjustments[]` |
| `dv360_bulk_update_status`           | Batch status changes across entities                | `entityType`, `entityIds[]`, `entityStatus` |
| `dv360_list_assigned_targeting`      | List assigned targeting options                     | `parentType`, IDs, `targetingType` |
| `dv360_create_assigned_targeting`    | Create assigned targeting option                    | `parentType`, IDs, `targetingType`, `assignedTargetingOption` |
| `dv360_delete_assigned_targeting`    | Delete assigned targeting option                    | `parentType`, IDs, `targetingType`, `assignedTargetingOptionId` |

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

### Workflow 2: Manual Bid Override

```
User: "Increase the bid for line item 67890 to $3.50 CPM"

AI Agent:
1. Calls dv360-mcp.dv360_adjust_line_item_bids
   - advertiserId: "12345"
   - adjustments: [{ lineItemId: "67890", bidAmount: 3.50, bidType: "cpm", reason: "Manual override requested by user" }]

2. Confirms change:
   "Line item 67890 bid updated to $3.50 CPM."
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
gcloud logging read 'severity>=ERROR AND resource.labels.service_name=~"(dbm|dv360)-mcp"' --limit=50
```

### Metrics Dashboard

Access Cloud Monitoring dashboards:

- [DBM Server Metrics](https://console.cloud.google.com/monitoring/dashboards/custom/dbm-mcp)
- [DV360 Server Metrics](https://console.cloud.google.com/monitoring/dashboards/custom/dv360-mcp)

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

- **[Product Requirements Document](docs/PRD.md)** - Product and system requirements
- **[Repository Structure](docs/repository-structure.md)** - Package and platform layout
- **[MCP Skill Contract](docs/mcp-skill-contract.md)** - Cross-client workflow contract
- **[Microservice Topology](docs/architecture/mcp-microservice-topology.md)** - Direct + orchestration access model

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
- **Email**: support@cesteral.io

---

## Roadmap

### Q1 2025

- ✅ Three MCP servers architecture design
- ✅ Monorepo scaffolding (pnpm workspaces + Turborepo)
- ✅ Shared packages (types, utilities, authentication)
- ✅ MCP server templates with HTTP/SSE transport
- 🚧 DV360 support (reporting + management + optimization)
- 🚧 BigQuery integration
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
