# BidShifter Repository Structure

## Overview

This repository contains the BidShifter platform - an AI-native programmatic advertising optimization system built on three independent MCP (Model Context Protocol) servers.

## Repository Layout

```
cesteral-mcp-servers/
├── packages/
│   ├── dbm-mcp/                    # Server 1: DV360 reporting
│   ├── dv360-mcp/                  # Server 2: DV360 entity management
│   ├── ttd-mcp/                    # Server 3: The Trade Desk management & reporting
│   └── shared/                     # Shared types, utilities, auth, observability
├── docs/                           # Documentation
├── mcp-ts-quickstart-template/     # MCP server template (reference)
├── scripts/                        # Deployment and automation scripts
├── terraform/                      # Infrastructure as Code (GCP)
├── cloudbuild.yaml                 # Cloud Build CI/CD pipeline
├── README.md                       # Main documentation
└── CLAUDE.md                       # Claude Code instructions
```

## Three MCP Servers

### 1. **dbm-mcp** (Reporting Server)

**Purpose**: Generic cross-platform reporting and metrics

**Responsibilities**:

- Fetch delivery metrics (impressions, clicks, spend, conversions)
- Calculate performance metrics (CPM, CTR, CPA, ROAS)
- Time-series data for trend analysis
- Real-time pacing calculations
- Query normalized data from BigQuery

**Platforms Supported**: DV360 (extensible to any DSP)

**Key Tools**:

- `get_campaign_delivery`
- `get_performance_metrics`
- `get_historical_metrics`
- `get_pacing_status`
- `run_custom_query`

---

### 2. **dv360-mcp** (Management Server)

**Purpose**: DV360 campaign entity management and configuration

**Responsibilities**:

- Fetch campaign hierarchies (advertisers → campaigns → line items)
- Update budgets, flight dates, and status (active/paused)
- Update bids (CPM, CPC) and revenue margins
- Create new line items
- Manage SDF (Structured Data Files) uploads

**Platform**: DV360 via DV360 API v4 and Bid Manager API v2

**Key Tools**:

- `list_entities` / `get_entity` / `create_entity` / `update_entity` / `delete_entity`
- `adjust_line_item_bids` / `bulk_update_status`
- `create_custom_bidding_algorithm` / `manage_custom_bidding_script` / `manage_custom_bidding_rules` / `list_custom_bidding_algorithms`
- `list_assigned_targeting` / `get_assigned_targeting` / `create_assigned_targeting` / `delete_assigned_targeting` / `validate_targeting_config`

---

### 3. **ttd-mcp** (The Trade Desk Server)

**Purpose**: The Trade Desk campaign entity management and reporting

**Responsibilities**:

- Full CRUD on TTD entities (advertisers, campaigns, ad groups, ads)
- List and filter entities with pagination
- Generate and retrieve TTD performance reports
- Per-session auth via partner ID + API secret

**Platform**: The Trade Desk via TTD REST API

**Key Tools**:

- `ttd_create_entity`
- `ttd_get_entity`
- `ttd_list_entities`
- `ttd_update_entity`
- `ttd_delete_entity`
- `ttd_get_report`

---

## Directory Details

### `/docs`

Documentation for the platform:

- `PRD.md` - Product Requirements Document
- `ENV-VARIABLES-GUIDE.md` - Environment variable configuration
- `repository-structure.md` - This file
- `architecture/mcp-microservice-topology.md` - Microservice + orchestration access model
- `governance/` - Architecture decision records and governance docs
- `packages/` - Per-package documentation

### `/mcp-ts-quickstart-template`

Template structure for MCP servers (used as reference for building the three servers):

- `src/mcp-server/` - MCP tool definitions
- `src/services/` - Business logic and integrations
- `src/http-transport.ts` - Express HTTP server for MCP protocol
- `Dockerfile` - Container build configuration
- `package.json` - Dependencies and scripts

### `/scripts`

Automation scripts for deployment and operations:

- Deployment scripts for each MCP server
- GCP project initialization
- Build and CI/CD utilities

### `/terraform`

Infrastructure as Code for GCP resources:

- Cloud Run services (3 MCP servers)
- BigQuery datasets and tables
- Cloud Storage buckets
- Pub/Sub topics
- VPC, NAT, and networking
- Secret Manager secrets
- Cloud Scheduler jobs
- IAM roles and policies

**Environments**:

- `dev.tfvars` - Development environment
- `staging.tfvars` - Staging environment
- `prod.tfvars` - Production environment

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         AI Clients                              │
│                   (Claude Desktop, Custom Agents)               │
└────────────────┬────────────────┬──────────────────────────────┘
                 │                │
                 │ HTTPS/MCP      │ JWT Bearer Tokens
                 │                │
    ┌────────────┼────────────────┼────────────┐
    │            │                │            │
    ▼            ▼                ▼            │
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   dbm-mcp    │ │  dv360-mcp   │ │   ttd-mcp    │
│              │ │              │ │              │
│  Reporting   │ │ DV360 Mgmt   │ │  TTD Mgmt    │
│  Server      │ │   Server     │ │   Server     │
│              │ │              │ │              │
│ Bid Manager  │ │ DV360 API    │ │ TTD REST     │
│ API queries  │ │ CRUD ops     │ │ API CRUD     │
│              │ │              │ │              │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │
       └────────────────┼────────────────┘
                        │
                        ▼
           ┌────────────────────────┐
           │  GCP Data & Compute    │
           │                        │
           │  • BigQuery            │
           │  • Cloud Storage       │
           │  • Pub/Sub             │
           │  • Secret Manager      │
           │  • Cloud Scheduler     │
           └────────┬───────────────┘
                    │
                    ▼
           ┌────────────────────┐
           │   External APIs    │
           │  • DV360 API       │
           │  • Bid Manager API │
           │  • TTD REST API    │
           └────────────────────┘
```

### Access Patterns

- **Direct access (default)**: clients connect to any subset of `dbm-mcp`, `dv360-mcp`, and `ttd-mcp` in the same session.
- **Optional orchestration service**: for policy-heavy or high-scale workflows, an internal orchestration service can act as an MCP client to multiple servers and return a single consolidated result.

---

## Current Status

**Repository State**: Scaffolding complete

- All three MCP servers implemented with Streamable HTTP transport (Hono)
- Shared package provides auth strategies, observability, rate limiting, tool handler factory
- Per-session service architecture with `SessionServiceStore` pattern
- DV360 servers (dbm-mcp, dv360-mcp) use Google auth adapters
- TTD server (ttd-mcp) uses partner token auth via `TtdAuthAdapter`
- OpenTelemetry consolidated in shared package

**Next Steps**:

1. Production API integrations (live data vs. stubs)
2. Align Terraform and CI/CD for independent deployment of all three servers
3. Standardize versioning and compatibility metadata across servers/contracts
4. Deploy servers to GCP Cloud Run

---

## Key Technologies

- **Runtime**: Node.js 20 LTS, TypeScript 5.0+
- **Framework**: Hono (Streamable HTTP transport for MCP)
- **Cloud Platform**: Google Cloud Platform (GCP)
- **Infrastructure**: Terraform
- **Protocol**: Model Context Protocol (MCP) via `@modelcontextprotocol/sdk`
- **Authentication**: Google headers, TTD partner tokens, JWT
- **Observability**: OpenTelemetry (traces + metrics)
- **Containerization**: Docker
- **Monorepo**: pnpm workspaces + Turborepo

---

## Development Workflow

1. **Local Development**: Run individual MCP servers locally for testing
2. **Build**: Compile TypeScript and build Docker containers
3. **Deploy**: Use Cloud Build or scripts to deploy to GCP Cloud Run
4. **Test**: Use MCP Inspector or Claude Desktop to test tools
5. **Monitor**: View logs and metrics in Cloud Monitoring

---

## Cost Estimate

**Expected Monthly Costs** (50 advertisers, 500 campaigns):

- Cloud Run: $90-120/month
- BigQuery: $40-70/month
- Cloud Storage: $5-10/month
- Pub/Sub: $5-10/month
- VPC/NAT: $10-20/month
- Other: $5-10/month
- **Total**: ~$155-240/month

---

_Last updated: 2026-02-13_
