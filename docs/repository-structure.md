# BidShifter Repository Structure

## Overview

This repository contains the BidShifter platform - an AI-native programmatic advertising optimization system built on three independent MCP (Model Context Protocol) servers.

## Repository Layout

```
bidshifter-mcp/
├── docs/                           # Documentation
├── mcp-ts-quickstart-template/     # MCP server template
├── scripts/                        # Deployment and automation scripts
├── terraform/                      # Infrastructure as Code (GCP)
├── Dockerfile                      # Container build configuration
├── cloudbuild.yaml                 # Cloud Build CI/CD pipeline
├── cloudbuild-manual.yaml          # Manual deployment pipeline
├── README.md                       # Main documentation
└── SETUP.md                        # Setup instructions
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
- `get_platform_entities`
- `get_pacing_status`

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

- `fetch_campaign_entities`
- `update_campaign_budget`
- `update_campaign_dates`
- `update_line_item_status`
- `update_line_item_bid`
- `update_revenue_margin`

---

### 3. **bidshifter-mcp** (Optimization Server)

**Purpose**: BidShifter-specific optimization intelligence and orchestration

**Responsibilities**:

- Analyze pacing and calculate bid adjustments
- Optimize revenue margins
- Track historical adjustments and effectiveness
- Provide AI agent guidance via MCP prompts
- Orchestrate calls to dbm-mcp and dv360-mcp servers
- Execute scheduled optimization scans

**Platform-Agnostic**: Works with any platform supported by reporting and management servers

**Key Tools**:

- `optimize_campaign_bids`
- `adjust_revenue_margin`
- `get_optimization_recommendations`
- `get_adjustment_history`
- `get_pacing_forecast`
- `configure_optimization`

**MCP Prompts**:

- `campaign_optimization_workflow`
- `troubleshoot_underdelivery`
- `margin_optimization_strategy`

---

## Directory Details

### `/docs`

Documentation for the platform:

- `bidshifter-mcp-design-architecture.md` - Technical architecture and design decisions
- `PRD.md` - Product Requirements Document
- `gcp-deployment.md` - GCP deployment guide
- `terraform-setup.md` - Terraform infrastructure setup
- `repository-structure.md` - This file

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
│   dbm-mcp    │ │  dv360-mcp   │ │bidshifter-mcp│
│              │ │              │ │              │
│  Reporting   │ │ Management   │ │Optimization  │
│  Server      │ │   Server     │ │   Server     │
│              │ │              │ │              │
│ Read-only    │ │ CRUD Ops     │ │ Orchestrates │
│ BigQuery     │ │ SDF/API      │ │ other two    │
│ queries      │ │ updates      │ │ servers      │
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
           │  • Google Ads API  │
           │  • Meta API        │
           └────────────────────┘
```

---

## Current Status

**Repository State**: Planning and documentation phase

- Core documentation completed
- Architecture designed
- Infrastructure templates ready
- MCP server template available

**Next Steps**:

1. Create `packages/` directory structure
2. Implement `dbm-mcp` server
3. Implement `dv360-mcp` server
4. Implement `bidshifter-mcp` server
5. Deploy Terraform infrastructure
6. Deploy servers to GCP Cloud Run

---

## Key Technologies

- **Runtime**: Node.js 20 LTS, TypeScript 5.0+
- **Framework**: Express.js (HTTP transport for MCP)
- **Cloud Platform**: Google Cloud Platform (GCP)
- **Infrastructure**: Terraform
- **Protocol**: Model Context Protocol (MCP)
- **Authentication**: JWT Bearer Tokens
- **Data Storage**: BigQuery, Cloud Storage
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

_Last updated: 2025-11-07_
