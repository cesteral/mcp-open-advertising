# Cesteral - AI-Native Multi-Platform Campaign Optimization

**AI-powered programmatic advertising optimization across DV360, Google Ads, Meta, and future DSPs**

[![License](https://img.shields.io/badge/license-BSL--1.1-blue.svg)](LICENSE.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-2024--11--05-green)](https://modelcontextprotocol.io/)

> **Hosted service coming soon** — [Request early access](https://cesteral.com) for managed hosting, or self-host using the guide below.

---

## Overview

Cesteral is a **Model Context Protocol (MCP) based optimization platform** that enables AI agents to autonomously manage programmatic advertising campaigns. Built on seven independent MCP servers, Cesteral separates reporting and platform management concerns while allowing cross-server workflows.

### Key Features

- **🤖 AI-Native Design** - Claude and other AI agents as primary interface
- **🌐 Multi-Platform Support** - Works across DV360, Google Ads, Meta, and future DSPs
- **🔧 Composable Architecture** - Seven independent MCP servers can be used separately or combined
- **📊 Intelligent Optimization** - Automatically adjusts bids and margins using proven pacing algorithms
- **🔍 Full Transparency** - Every decision is explainable and auditable
- **💰 Cost-Efficient** - GCP-native architecture optimized for efficiency

---

## Architecture

Cesteral uses a **GCP-native architecture** with seven independently deployable Cloud Run MCP services:

- `dbm-mcp` for reporting and query workflows
- `dv360-mcp` for DV360 management workflows
- `ttd-mcp` for The Trade Desk management/reporting workflows
- `gads-mcp` for Google Ads campaign management and reporting workflows
- `meta-mcp` for Meta Ads campaign management
- `linkedin-mcp` for LinkedIn Ads campaign management and analytics
- `tiktok-mcp` for TikTok Ads campaign management and async reporting

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
- Create new entities (campaigns, line items, insertion orders)

**Platform**: DV360 API v4

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

### Server 5: `meta-mcp`

**Meta Ads campaign management**

- Full CRUD on Meta Ads entities (campaigns, ad sets, ads, creatives, custom audiences)
- Performance insights with dimensional breakdowns
- Targeting search and delivery estimates
- Bulk operations and entity duplication
- Per-session auth via Bearer token

**Platform**: Meta Marketing API v21.0

### Server 6: `linkedin-mcp`

**LinkedIn Ads campaign management and analytics**

- Full CRUD on LinkedIn entities (ad accounts, campaign groups, campaigns, creatives, conversion rules)
- Analytics and pivot breakdowns via LinkedIn Marketing API v2
- Targeting search, delivery forecasts, and ad previews
- Per-session auth via LinkedIn bearer token

**Platform**: LinkedIn Marketing API v2

### Server 7: `tiktok-mcp`

**TikTok Ads campaign management and reporting**

- Full CRUD on TikTok entities (campaigns, ad groups, ads, creatives)
- Async reporting flow (submit, poll, download) with breakdown support
- Targeting search, audience estimates, and ad previews
- Per-session auth via TikTok bearer token + advertiser ID header

**Platform**: TikTok Marketing API v1.3

---

## Current Status

**Phase: Production-Ready ✅**

The platform currently includes:
- ✅ Seven implemented MCP server packages (`dbm-mcp`, `dv360-mcp`, `ttd-mcp`, `gads-mcp`, `meta-mcp`, `linkedin-mcp`, `tiktok-mcp`)
- ✅ Shared runtime package (`@cesteral/shared`) for auth, telemetry, and common handlers
- ✅ Live platform API integrations and Streamable HTTP transports
- ✅ Terraform + Cloud Build coverage for independent service deployment

**Current Focus:**
1. Production hardening and operational reliability across all seven servers
2. Cross-platform workflow coverage and contract governance
3. Telemetry dashboards and observability improvements

## Quick Start

### Prerequisites

- **Node.js** (>= 20.0.0)
- **pnpm** (>= 8.0.0) - `npm install -g pnpm`
- **Terraform** (>= 1.6.0) *(for deployment)*
- **GCP Account** with billing enabled *(for deployment)*
- **Docker** (for containerization)

### 1. Clone Repository

```bash
git clone https://github.com/cesteral/cesteral-mcp-servers.git
cd cesteral-mcp-servers
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Set Up Environment

```bash
# Create a local .env file with your credentials
# Required variables:
# - GCP_PROJECT_ID
# - MCP_AUTH_SECRET_KEY (for JWT auth mode)
# - DV360/Google Ads OAuth credentials
# - TTD partner credentials (optional)
# - Meta API credentials (optional)
# See docs/ENV-VARIABLES-GUIDE.md for full reference
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

# Start meta-mcp (port 3005)
./scripts/dev-server.sh meta-mcp

# Start linkedin-mcp (port 3006)
./scripts/dev-server.sh linkedin-mcp

# Start tiktok-mcp (port 3007)
./scripts/dev-server.sh tiktok-mcp
```

### 6. Deploy Infrastructure

```bash
# Initialize Terraform
cd terraform
terraform init

# Deploy to development environment
terraform apply -var-file=dev.tfvars
```

### 7. Configure AI Agent (Claude Desktop) *(After Deployment)*

#### Self-hosted

```json
{
  "mcpServers": {
    "cesteral-dbm": {
      "url": "https://dbm.cesteral.com/mcp",
      "apiKey": "your-dbm-api-key"
    },
    "cesteral-dv360": {
      "url": "https://dv360.cesteral.com/mcp",
      "apiKey": "your-dv360-api-key"
    },
    "cesteral-ttd": {
      "url": "https://ttd.cesteral.com/mcp",
      "apiKey": "your-ttd-api-key"
    },
    "cesteral-gads": {
      "url": "https://gads.cesteral.com/mcp",
      "apiKey": "your-gads-api-key"
    },
    "cesteral-meta": {
      "url": "https://meta.cesteral.com/mcp",
      "apiKey": "your-meta-api-key"
    }
  }
}
```

#### Hosted (Early Access)

Managed hosting with JWT authentication is coming soon. [Request early access at cesteral.com](https://cesteral.com) to get notified when it's available.

---

## Repository Structure

```
cesteral-mcp-servers/
├── packages/
│   ├── dbm-mcp/                 # MCP Server 1: DV360 reporting
│   │   ├── src/
│   │   │   ├── mcp-server/      # MCP tool definitions + transports
│   │   │   ├── services/        # Bid Manager API adapters
│   │   │   └── index.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── dv360-mcp/               # MCP Server 2: DV360 management
│   │   ├── src/
│   │   │   ├── mcp-server/      # MCP tool definitions + transports
│   │   │   ├── services/        # DV360 API v4 integrations
│   │   │   └── index.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── ttd-mcp/                 # MCP Server 3: The Trade Desk
│   │   ├── src/
│   │   │   ├── mcp-server/      # MCP tool definitions + transports
│   │   │   ├── services/        # TTD REST API client
│   │   │   └── index.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── gads-mcp/                # MCP Server 4: Google Ads
│   │   ├── src/
│   │   │   ├── mcp-server/      # MCP tool definitions + transports
│   │   │   ├── services/        # Google Ads REST API client
│   │   │   └── index.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── meta-mcp/                # MCP Server 5: Meta Ads
│   ├── linkedin-mcp/            # MCP Server 6: LinkedIn Ads
│   ├── tiktok-mcp/              # MCP Server 7: TikTok Ads
│   │
│   └── shared/                  # Shared code
│       ├── types/               # Zod schemas, TypeScript types
│       ├── utils/               # Common utilities
│       ├── auth/                # Auth strategies + JWT validation
│       └── package.json
│
├── terraform/                   # Infrastructure as Code
│   ├── modules/
│   │   ├── mcp-service/         # Reusable Cloud Run module
│   │   ├── core-infrastructure/ # BigQuery, Pub/Sub, etc.
│   │   ├── monitoring/          # Dashboards and alerts
│   │   └── networking/          # VPC, NAT, firewall
│   ├── dev.tfvars
│   ├── staging.tfvars
│   ├── prod.tfvars
│   └── main.tf
│
├── scripts/                     # Deployment automation
│   ├── deploy.sh                # Deploy individual or all servers
│   ├── dev-server.sh            # Local development server
│   └── init-gcp-project.sh      # One-time GCP setup
│
├── docs/                        # Documentation
│   ├── PRD.md                   # Product Requirements Document
│   └── repository-structure.md  # Package and platform layout
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
| `get_campaign_delivery`   | Fetch delivery metrics for date range | `campaignId`, `advertiserId`, `startDate`, `endDate` |
| `get_performance_metrics` | Calculate CPM, CTR, CPA, ROAS         | `campaignId`, `dateRange`                           |
| `get_historical_metrics`  | Time-series data for trends           | `campaignId`, `startDate`, `endDate`, `granularity` |
| `get_pacing_status`       | Real-time pacing calculation          | `campaignId`, `advertiserId`                        |
| `run_custom_query`        | Execute dynamic DBM report queries    | `reportType`, `filters`, `metrics`, `dimensions`    |

### DV360 Management Server Tools

| Tool                                 | Description                                         | Parameters |
| ------------------------------------ | --------------------------------------------------- | ---------- |
| `dv360_list_entities`                | Generic list for DV360 entities                     | `entityType`, IDs, filters, paging |
| `dv360_get_entity`                   | Fetch one DV360 entity by type/id                   | `entityType`, entity IDs |
| `dv360_create_entity`                | Create any supported DV360 entity                   | `entityType`, IDs, `data` |
| `dv360_update_entity`                | Update any supported DV360 entity with updateMask   | `entityType`, IDs, `data`, `updateMask` |
| `dv360_adjust_line_item_bids`        | Batch bid adjustments for multiple line items       | `advertiserId`, `adjustments[]` |

See [packages/dv360-mcp](packages/dv360-mcp) for the full 16-tool reference including custom bidding, targeting, and bulk operations.

### The Trade Desk Server Tools

| Tool                       | Description                                  | Parameters |
| -------------------------- | -------------------------------------------- | ---------- |
| `ttd_list_entities`        | List TTD entities with filters/paging        | `entityType`, optional filters |
| `ttd_create_entity`        | Create a TTD entity                          | `entityType`, `data` |
| `ttd_get_report`           | Generate async report via MyReports V3 API   | `reportName`, `dateRange`, `dimensions`, `metrics` |
| `ttd_bulk_update_status`   | Batch pause/resume/archive entities          | `entityType`, `entityIds[]`, `status` |
| `ttd_graphql_query`        | Execute GraphQL query against TTD API        | `query`, `variables` |

See [packages/ttd-mcp](packages/ttd-mcp) for the full 18-tool reference including bulk CRUD, bid adjustments, and GraphQL operations.

### Google Ads Server Tools

| Tool                    | Description                              | Parameters |
| ----------------------- | ---------------------------------------- | ---------- |
| `gads_gaql_search`      | Execute arbitrary GAQL queries           | `customerId`, `query`, `pageSize` |
| `gads_list_accounts`    | List accessible customer accounts        | _(none)_ |
| `gads_create_entity`    | Create entity via :mutate API            | `entityType`, `customerId`, `data` |
| `gads_bulk_mutate`      | Multi-operation mutate (create+update+remove) | `entityType`, `customerId`, `operations[]` |

See [packages/gads-mcp](packages/gads-mcp) for the full 9-tool reference including entity CRUD and bulk status updates.

### Meta Ads Server Tools

| Tool                          | Description                              | Parameters |
| ----------------------------- | ---------------------------------------- | ---------- |
| `meta_list_entities`          | List Meta Ads entities with filters      | `entityType`, `adAccountId`, `fields` |
| `meta_create_entity`          | Create a Meta Ads entity                 | `entityType`, `adAccountId`, `data` |
| `meta_get_insights`           | Performance metrics for an entity        | `entityId`, `fields`, `datePreset` |
| `meta_search_targeting`       | Search interests, locations, etc.        | `type`, `query`, `limit` |
| `meta_get_delivery_estimate`  | Audience size estimation                 | `adAccountId`, `targetingSpec` |

See [packages/meta-mcp](packages/meta-mcp) for the full 15-tool reference including insights breakdowns, duplication, and ad previews.

### LinkedIn Ads Server Tools

See [packages/linkedin-mcp](packages/linkedin-mcp) for the full 18-tool reference including CRUD, analytics breakdowns, delivery forecast, and ad previews.

### TikTok Ads Server Tools

See [packages/tiktok-mcp](packages/tiktok-mcp) for the full 18-tool reference including CRUD, async reporting, audience estimates, and ad previews.

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

### Workflow 3: Cross-Platform Performance Comparison

```
User: "Compare last week's performance across our Google Ads and Meta campaigns"

AI Agent:
1. Calls gads-mcp.gads_gaql_search
   - query: "SELECT campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros
             FROM campaign WHERE segments.date DURING LAST_7_DAYS"

2. Calls meta-mcp.meta_get_insights
   - entityId: "{adAccountId}"
   - fields: ["campaign_name", "impressions", "clicks", "spend"]
   - datePreset: "last_7_days"

3. Synthesizes cross-platform comparison with unified metrics
```

---

## Deployment

### Deploy Individual Servers

```bash
# Deploy a specific server to a specific environment
./scripts/deploy.sh dbm-mcp dev
./scripts/deploy.sh dv360-mcp staging
./scripts/deploy.sh ttd-mcp prod
./scripts/deploy.sh gads-mcp dev
./scripts/deploy.sh meta-mcp prod
```

### Deploy All Servers

```bash
# Build and deploy all servers
./scripts/build-all.sh
```

---

## Monitoring

### View Logs

```bash
# Real-time logs for specific server
gcloud run services logs tail dbm-mcp --region=europe-west2

# Recent errors across all servers
gcloud logging read 'severity>=ERROR AND resource.labels.service_name=~"(dbm|dv360|ttd|gads|meta)-mcp"' --limit=50
```

### Metrics Dashboard

Access Cloud Monitoring dashboards:

- [DBM Server Metrics](https://console.cloud.google.com/monitoring/dashboards/custom/dbm-mcp)
- [DV360 Server Metrics](https://console.cloud.google.com/monitoring/dashboards/custom/dv360-mcp)
- [TTD Server Metrics](https://console.cloud.google.com/monitoring/dashboards/custom/ttd-mcp)
- [Google Ads Server Metrics](https://console.cloud.google.com/monitoring/dashboards/custom/gads-mcp)
- [Meta Server Metrics](https://console.cloud.google.com/monitoring/dashboards/custom/meta-mcp)

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
# Start any server locally using the dev script
./scripts/dev-server.sh dbm-mcp     # port 3001
./scripts/dev-server.sh dv360-mcp   # port 3002
./scripts/dev-server.sh ttd-mcp     # port 3003
./scripts/dev-server.sh gads-mcp    # port 3004
./scripts/dev-server.sh meta-mcp    # port 3005
./scripts/dev-server.sh linkedin-mcp # port 3006
./scripts/dev-server.sh tiktok-mcp   # port 3007
```

### Testing MCP Tools

```bash
# Use MCP Inspector to test tools
npx @modelcontextprotocol/inspector packages/dbm-mcp

# Or use curl to test HTTP transport
curl -X POST http://localhost:3001/mcp \
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
- **[Microservice Topology](docs/architecture/mcp-microservice-topology.md)** - Direct + orchestration access model

---

## Technology Stack

**Languages & Frameworks**

- TypeScript 5.0+
- Node.js 20 LTS
- Zod (schema validation)
- Hono (HTTP server + MCP transport)

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
- The Trade Desk REST API
- Google Ads REST API v23
- Meta Marketing API v21.0

**Development Tools**

- Terraform (Infrastructure as Code)
- Docker (containerization)
- Turborepo (monorepo builds)
- pnpm (package management)
- Google Cloud Build (CI/CD)

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

[Business Source License 1.1](LICENSE.md) — converts to Apache 2.0 after 3 years.

---

## Support

For issues or questions:

- **Website**: [cesteral.com](https://cesteral.com) — request early access to the hosted service
- **Documentation**: Check [docs/](docs/) for detailed guides
- **GitHub Issues**: Report bugs or request features
- **Email**: support@cesteral.com

---

**Built with ❤️ for AI-native advertising optimization**
