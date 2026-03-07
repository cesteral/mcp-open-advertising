# Cesteral Repository Structure

## Overview

This repository contains the Cesteral platform - an AI-native programmatic advertising optimization system built on seven independent MCP (Model Context Protocol) servers.

## Repository Layout

```
cesteral-mcp-servers/
├── packages/
│   ├── dbm-mcp/                    # Server 1: DV360 reporting
│   ├── dv360-mcp/                  # Server 2: DV360 entity management
│   ├── ttd-mcp/                    # Server 3: The Trade Desk management & reporting
│   ├── gads-mcp/                   # Server 4: Google Ads management & reporting
│   ├── meta-mcp/                   # Server 5: Meta Ads management
│   ├── linkedin-mcp/               # Server 6: LinkedIn Ads management
│   ├── tiktok-mcp/                 # Server 7: TikTok Ads management
│   └── shared/                     # Shared types, utilities, auth, observability
├── docs/                           # Documentation
├── scripts/                        # Deployment and automation scripts
├── terraform/                      # Infrastructure as Code (GCP)
├── cloudbuild.yaml                 # Cloud Build CI/CD pipeline
├── README.md                       # Main documentation
└── CLAUDE.md                       # Claude Code instructions
```

## Seven MCP Servers

### 1. **dbm-mcp** (Reporting Server)

**Purpose**: Generic cross-platform reporting and metrics

**Responsibilities**:

- Fetch delivery metrics (impressions, clicks, spend, conversions)
- Calculate performance metrics (CPM, CTR, CPA, ROAS)
- Time-series data for trend analysis
- Real-time pacing calculations
- Execute and parse Bid Manager API reports for reporting workflows

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

### 4. **gads-mcp** (Google Ads Server)

**Purpose**: Google Ads campaign management and reporting

**Responsibilities**:

- Execute GAQL (Google Ads Query Language) queries for ad-hoc reporting
- Full CRUD on Google Ads entities (campaigns, ad groups, ads, keywords, budgets, extensions)
- List accessible customer accounts
- Bulk mutate operations and batch status updates
- Per-session auth via OAuth2 + developer token

**Platform**: Google Ads via REST API v23

**Key Tools**:

- `gads_gaql_search`
- `gads_list_accounts`
- `gads_get_entity`
- `gads_list_entities`
- `gads_create_entity`
- `gads_update_entity`
- `gads_remove_entity`
- `gads_bulk_mutate`
- `gads_bulk_update_status`

### 5. **meta-mcp** (Meta Ads Server)

**Purpose**: Meta Ads campaign management

**Responsibilities**:

- Full CRUD on Meta Ads entities (campaigns, ad sets, ads, creatives, custom audiences)
- Performance insights with dimensional breakdowns
- Targeting search and delivery estimates
- Bulk operations and entity duplication
- Per-session auth via Bearer token

**Platform**: Meta Marketing API v21.0

**Key Tools**:

- `meta_list_entities`
- `meta_get_entity`
- `meta_create_entity`
- `meta_update_entity`
- `meta_delete_entity`
- `meta_list_ad_accounts`
- `meta_get_insights`
- `meta_get_insights_breakdowns`
- `meta_bulk_update_status`
- `meta_bulk_create_entities`
- `meta_search_targeting`
- `meta_get_targeting_options`
- `meta_duplicate_entity`
- `meta_get_delivery_estimate`
- `meta_get_ad_previews`

---

### 6. **linkedin-mcp** (LinkedIn Ads Server)

**Purpose**: LinkedIn Ads campaign management and analytics

**Responsibilities**:

- Full CRUD on LinkedIn entities (ad accounts, campaign groups, campaigns, creatives, conversion rules)
- Analytics with dimensional breakdowns (geo, device, etc.)
- Targeting search and delivery forecasts
- Bulk operations and entity duplication
- Per-session auth via Bearer token

**Platform**: LinkedIn Marketing API v2

**Key Tools**:

- `linkedin_list_entities`
- `linkedin_get_entity`
- `linkedin_create_entity`
- `linkedin_update_entity`
- `linkedin_delete_entity`
- `linkedin_list_ad_accounts`
- `linkedin_get_analytics`
- `linkedin_get_analytics_breakdowns`
- `linkedin_bulk_update_status`
- `linkedin_bulk_create_entities`
- `linkedin_search_targeting`
- `linkedin_get_targeting_options`
- `linkedin_duplicate_entity`
- `linkedin_get_delivery_forecast`
- `linkedin_get_ad_previews`

---

### 7. **tiktok-mcp** (TikTok Ads Server)

**Purpose**: TikTok Ads campaign management and reporting

**Responsibilities**:

- Full CRUD on TikTok entities (campaigns, ad groups, ads, creatives)
- Async reporting with breakdown dimensions
- Targeting search and audience estimates
- Bulk operations and entity duplication
- Per-session auth via Bearer token + advertiser ID

**Platform**: TikTok Marketing API v1.3

**Key Tools**:

- `tiktok_list_entities`
- `tiktok_get_entity`
- `tiktok_create_entity`
- `tiktok_update_entity`
- `tiktok_delete_entity`
- `tiktok_list_advertisers`
- `tiktok_get_report`
- `tiktok_get_report_breakdowns`
- `tiktok_bulk_update_status`
- `tiktok_bulk_create_entities`
- `tiktok_search_targeting`
- `tiktok_get_targeting_options`
- `tiktok_duplicate_entity`
- `tiktok_get_audience_estimate`
- `tiktok_get_ad_previews`

---

## Directory Details

### `/docs`

Documentation for the platform:

- `PRD.md` - Product Requirements Document
- `CROSS_SERVER_CONTRACT.md` - Cross-server API contract
- `repository-structure.md` - This file
- `architecture/` - Microservice topology and system design
- `business/` - Licensing strategy and business model analysis
- `features/` - Implemented feature design docs (MCP prompts, OpenAPI spec extraction)
- `governance/` - Architecture decision records, governance docs, and rollout plans
- `guides/` - Practical how-to references (env variables, package template, platform mapping)
- `plans/` - Active implementation plans; `plans/archive/` for completed plans
- `research/` - Research and advanced topics
- `strategy/` - Business positioning and build-vs-buy decisions

### `/scripts`

Automation scripts for deployment and operations:

- Deployment scripts for each MCP server
- GCP project initialization
- Build and CI/CD utilities

### `/terraform`

Infrastructure as Code for GCP resources:

- Cloud Run services (7 MCP servers)
- BigQuery datasets and tables
- Cloud Storage buckets
- Pub/Sub topics
- VPC, NAT, and networking
- Secret Manager secrets
- Cloud Scheduler jobs
- IAM roles and policies

**Environments**:

- `dev.tfvars` - Development environment
- `prod.tfvars` - Production environment

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                          AI Clients                                              │
│                                (Claude Desktop, Custom Agents)                                    │
└──┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬─────────────────────────────┘
   │          │          │          │          │          │          │
   │ HTTPS/MCP│          │          │          │          │    JWT Bearer Tokens
   │          │          │          │          │          │          │
   ▼          ▼          ▼          ▼          ▼          ▼          ▼
┌─────────┐┌─────────┐┌─────────┐┌─────────┐┌─────────┐┌──────────┐┌──────────┐
│ dbm-mcp ││dv360-mcp││ ttd-mcp ││gads-mcp ││meta-mcp ││linkedin- ││ tiktok-  │
│         ││         ││         ││         ││         ││  mcp     ││  mcp     │
│Reporting││DV360    ││TTD Mgmt ││Google   ││Meta Ads ││LinkedIn  ││TikTok   │
│ Server  ││Mgmt Svr ││ Server  ││Ads Svr  ││ Server  ││Ads Svr   ││Ads Svr  │
│         ││         ││         ││         ││         ││          ││          │
│Bid Mgr  ││DV360 API││TTD REST ││Google   ││Meta     ││LinkedIn  ││TikTok   │
│API      ││CRUD ops ││API CRUD ││Ads CRUD ││API CRUD ││API CRUD  ││API CRUD │
└────┬────┘└────┬────┘└────┬────┘└────┬────┘└────┬────┘└─────┬────┘└─────┬───┘
     │          │          │          │          │           │           │
     └──────────┼──────────┼──────────┼──────────┼───────────┼───────────┘
                │          │          │
                ▼          ▼          ▼
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
           ┌─────────────────────────────┐
           │    External APIs            │
           │  • DV360 API                │
           │  • Bid Manager API          │
           │  • TTD REST API             │
           │  • Google Ads API           │
           │  • Meta Marketing API       │
           │  • LinkedIn Marketing API   │
           │  • TikTok Marketing API     │
           └─────────────────────────────┘
```

### Access Patterns

- **Direct access (default)**: clients connect to any subset of `dbm-mcp`, `dv360-mcp`, `ttd-mcp`, `gads-mcp`, `meta-mcp`, `linkedin-mcp`, and `tiktok-mcp` in the same session.
- **Optional orchestration service**: for policy-heavy or high-scale workflows, an internal orchestration service can act as an MCP client to multiple servers and return a single consolidated result.

---

## Current Status

**Repository State**: Production-ready

- All seven MCP servers implemented with Streamable HTTP transport (Hono)
- Shared package provides auth strategies, observability, rate limiting, tool handler factory
- Per-session service architecture with `SessionServiceStore` pattern
- DV360 servers (dbm-mcp, dv360-mcp) use Google auth adapters
- TTD server (ttd-mcp) uses partner token auth via `TtdAuthAdapter`
- Google Ads server (gads-mcp) uses OAuth2 developer token auth via `GAdsAuthAdapter`
- Meta server (meta-mcp) uses Bearer token auth via `MetaBearerAuthStrategy`
- OpenTelemetry consolidated in shared package

**Next Steps**:

1. ~~Production API integrations~~ ✅ Complete — all seven servers have live API integrations
2. ~~Align Terraform and CI/CD for independent deployment of all seven servers~~ ✅ Complete
3. Standardize versioning and compatibility metadata across servers/contracts
4. Deploy servers to GCP Cloud Run

---

## Key Technologies

- **Runtime**: Node.js 20 LTS, TypeScript 5.0+
- **Framework**: Hono (Streamable HTTP transport for MCP)
- **Cloud Platform**: Google Cloud Platform (GCP)
- **Infrastructure**: Terraform
- **Protocol**: Model Context Protocol (MCP) via `@modelcontextprotocol/sdk`
- **Authentication**: Google headers, TTD partner tokens, Google Ads OAuth, Meta Bearer, LinkedIn Bearer, TikTok Bearer, JWT
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

> [!NOTE]
> Cost estimate based on GCP pricing as of March 2026. Validate against actual
> billing before using for planning.

---

_Last updated: 2026-02-27_
