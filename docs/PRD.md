# BidShifter - Product Requirements Document (PRD)

**Version:** 2.0
**Date:** January 2025
**Status:** Active Development
**Product Owner:** Daniel Thorner

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Problem Statement](#problem-statement)
3. [Product Vision](#product-vision)
4. [Target Users](#target-users)
5. [Core Features](#core-features)
6. [Technical Architecture](#technical-architecture)
7. [User Workflows](#user-workflows)
8. [Success Metrics](#success-metrics)
9. [Development Phases](#development-phases)
10. [Future Enhancements](#future-enhancements)

---

## Executive Summary

BidShifter is an **AI-native programmatic advertising optimization platform** that automatically adjusts campaign bids and margins to achieve pacing and performance goals across multiple advertising platforms (DV360, Google Ads, Meta).

Built on three separate Model Context Protocol (MCP) servers, BidShifter enables AI agents (like Claude) to autonomously manage routine optimization while humans focus on strategic decisions.

### Key Differentiators

- **AI-First Interface**: MCP protocol as primary interface, not an afterthought
- **Multi-Platform Support**: Single optimization logic works across DV360, Google Ads, Meta, and future DSPs
- **Composable Architecture**: Three separate MCP servers can be used independently or combined
- **Transparent Decision-Making**: All optimization decisions are explainable and auditable
- **Cost-Efficient**: Hybrid cloud architecture reduces costs by 40-60% vs. traditional approaches

---

## Problem Statement

### Current State

Programmatic advertising campaign optimization is:

1. **Time-Consuming**: Media buyers manually review pacing reports daily and adjust bids across hundreds of line items
2. **Reactive**: Issues are discovered hours or days after they occur, limiting corrective action
3. **Inconsistent**: Different team members apply different strategies, leading to unpredictable results
4. **Platform-Locked**: Optimization logic is reimplemented for each advertising platform
5. **Opaque**: Automated systems make decisions without clear explanations

### Pain Points

**For Media Buyers:**
- Spend 2-4 hours/day on routine bid adjustments
- Miss pacing issues during off-hours (nights, weekends)
- Difficult to optimize across multiple platforms consistently
- Limited visibility into why automated systems made specific changes

**For Campaign Managers:**
- Cannot scale optimization operations without hiring more people
- Inconsistent application of optimization strategies across team
- Difficult to audit historical decisions
- Platform-specific tools don't provide unified view

**For Advertisers:**
- Campaigns underdeliver due to delayed optimization responses
- Budget waste from overdelivering campaigns
- Inconsistent performance across different media buyers
- Limited insight into optimization rationale

---

## Product Vision

### Vision Statement

**"Enable AI agents to autonomously optimize programmatic advertising campaigns with human-level intelligence and superhuman consistency, while maintaining full transparency and control for human supervisors."**

### Guiding Principles

1. **AI Agents as Primary Users** - Design for Claude, ChatGPT, and future AI systems first
2. **Explainability by Design** - Every decision must be traceable and understandable
3. **Platform Independence** - Optimization logic should be reusable across all DSPs
4. **Composability** - Components should be useful independently and in combination
5. **Fail-Safe Operations** - Conservative defaults, dry-run modes, human approval for large changes

---

## Target Users

### Primary Users (AI Agents)

**Claude Desktop / API**
- Connects to all three MCP servers simultaneously
- Executes optimization workflows based on prompts
- Makes routine bid adjustment decisions
- Escalates edge cases to humans

**Custom AI Agents**
- Built by customers using BidShifter MCP servers as building blocks
- Can focus on specific workflows (e.g., only margin optimization)
- Integrate with customer's existing tools and processes

### Secondary Users (Human Supervisors)

**Media Buyers**
- Review AI agent recommendations before execution (optional approval mode)
- Handle escalations that AI agent cannot resolve
- Configure optimization strategies and thresholds
- Monitor performance dashboards

**Campaign Managers**
- Set up new campaigns for optimization
- Define performance goals and constraints
- Review optimization effectiveness reports
- Approve large bid changes (>20% threshold)

**Analysts**
- Query reporting data for insights
- Build custom reports and dashboards
- Analyze optimization effectiveness over time
- Identify opportunities for strategy improvements

---

## Core Features

### Feature 1: Multi-Platform Reporting (`dbm-mcp`)

**Description**: Generic cross-platform reporting queries that normalize data from multiple advertising platforms.

**Capabilities**:
- Fetch delivery metrics (impressions, clicks, conversions, spend) for any campaign across DV360, Google Ads, Meta
- Calculate performance metrics (CPM, CTR, CPA, ROAS) consistently across platforms
- Retrieve time-series data for trend analysis
- Real-time pacing calculations vs. expected delivery

**User Value**:
- Single query interface works across all platforms (no platform-specific code)
- Consistent metric definitions regardless of source platform
- Fast responses via edge caching (< 500ms P50 latency)
- AI agents can ask questions in natural language and get structured data

**Technical Details**:
- Platform adapters for DV360, Google Ads, Meta APIs
- BigQuery normalized schemas for unified data model
- Read-only operations (safe to call repeatedly)
- Partitioned tables for fast queries

---

### Feature 2: Campaign Entity Management (`dv360-mcp`)

**Description**: Generic campaign CRUD operations across advertising platforms.

**Capabilities**:
- Fetch full campaign hierarchy (advertisers → campaigns → line items)
- Update campaign budgets, flight dates, status (active/paused)
- Update line item bids (CPM, CPC) and revenue margins
- Create new line items (future)

**User Value**:
- AI agents can make changes directly on advertising platforms
- Manual override capability for edge cases
- Complete audit trail of all changes
- Idempotent operations with safe retry logic

**Technical Details**:
- DV360: SDF download/upload + API v4 mutations
- Google Ads: Mutation endpoints via Google Ads API
- Meta: Marketing API write operations
- Pub/Sub events for audit trail (all changes logged to BigQuery)
- Cloud Storage for SDF file staging

---

### Feature 3: Intelligent Optimization (`bidshifter-mcp`)

**Description**: BidShifter-specific optimization intelligence that analyzes pacing and performance to calculate bid/margin adjustments.

**Capabilities**:
- **Pacing Optimization**: Automatically adjust bids to achieve target pacing (e.g., 95% of expected delivery)
- **Performance Goal Optimization**: Factor in CPA, ROAS, or other KPI goals when calculating adjustments
- **Margin Optimization**: Optimize revenue margins for margin-based line items
- **Historical Learning**: Learn from past adjustments to improve future decisions
- **Dry-Run Mode**: Preview recommended changes before applying
- **Multi-Strategy Support**: Aggressive, moderate, conservative optimization strategies

**User Value**:
- Continuous 24/7 monitoring and optimization (no nights/weekends gaps)
- Faster response to pacing issues (4-hour check cycles vs. daily manual review)
- Consistent application of optimization logic across all campaigns
- Explainable decisions (AI agent shows reasoning for each adjustment)
- Human control (approval workflows, strategy selection, threshold configuration)

**Technical Details**:
- Calls `dbm-mcp` for delivery data
- Runs optimization algorithms (pacing offset calculation, bid delta calculation)
- Calls `dv360-mcp` to execute changes
- Records all adjustments to BigQuery for effectiveness analysis
- Scheduled functions for automated optimization scans

**Optimization Algorithm** (high-level):
```
1. Fetch current pacing from reporting server
2. Calculate pacing offset (actual vs. expected)
3. Fetch historical adjustments for this line item
4. Calculate bid adjustment based on:
   - Pacing offset magnitude
   - Optimization strategy (aggressive/moderate/conservative)
   - Historical effectiveness of past adjustments
   - Goal performance (CPA, ROAS within target?)
5. Cap adjustment at configured max (e.g., ±10%)
6. Queue adjustment for execution
7. Track outcome 24 hours later to measure effectiveness
```

**Optimization Algorithms** (detailed implementation):

BidShifter preserves the proven optimization logic from the current Firebase Cloud Function implementation:

**Revenue Type Handling**:
1. **Cost Plus (`cost_plus`)**: Adjusts CPM based on pacing, calculates markup from performance goal
   - Markup = (Required CPM - Media CPM) / Media CPM × 100
   - Capped at 500% maximum markup

2. **Margin (`margin`)**: Adjusts both CPM and margin percentage based on pacing
   - More flexible for balancing volume vs. revenue

3. **Fixed CPM (`fixed_cpm`)**: No pacing-based adjustments
   - Maintains stable bidding regardless of delivery

**Pacing Calculations**:
- **Optimal pacing target**: 95% of expected delivery
- **Pacing tolerance**: ±5% band before adjustments trigger
- **Daily adjustment rate**: 2% maximum to prevent volatility
- **Minimum impressions**: 1,000 for statistical significance

**Bid Adjustment Logic**:
```typescript
if (pacingOffset < -5%) {
  // Underpacing: Increase bid
  adjustment = +2% × strategy_multiplier
} else if (pacingOffset > +5%) {
  // Overpacing: Decrease bid
  adjustment = -2% × strategy_multiplier
}

// Strategy multipliers:
// - Aggressive: 1.5× (±3% daily adjustment)
// - Moderate: 1.0× (±2% daily adjustment)
// - Conservative: 0.5× (±1% daily adjustment)
```

**Advanced Features**:
- **Historical Learning**: Analyzes past adjustments from BigQuery to improve future decisions
- **Budget Protection**: Reduces adjustment magnitude when < 3 days budget remaining
- **Insertion Order Constraints**: Line item adjustments consider parent IO pacing
- **Performance Goal Optimization**: Factors in CPA/ROAS goals when calculating adjustments

---

### Feature 4: Scheduled Automation

**Description**: Background processes that run on schedules to enable continuous optimization.

**Scheduled Functions**:

**Data Sync (every 4 hours)**
- Fetch fresh delivery data from all advertising platforms
- Run ETL jobs to normalize raw data into BigQuery unified schemas

**Optimization Scan (every 4 hours)**
- Query all active campaigns for pacing status
- Identify campaigns with pacing offset > 5%
- Publish `optimization.needed` events to Pub/Sub
- AI agents can consume events and decide whether to optimize

**Adjustment Executor (every 30 minutes)**
- Query BigQuery `pending_adjustments` table for queued adjustments
- Batch execute changes via platform APIs (reduce API call costs)
- Publish `adjustments.completed` events to Pub/Sub
- Update BigQuery task status (pending → completed)

**Outcome Tracker (daily)**
- For adjustments made 24 hours ago, measure effectiveness
- Calculate pacing improvement post-adjustment
- Update adjustment records in BigQuery with outcomes
- Feed data to ML model for future optimization improvements

**User Value**:
- Continuous operation without manual intervention
- Batching reduces API costs and rate limit issues
- Automatic effectiveness tracking improves optimization over time
- Scheduled scans catch issues within 4 hours (vs. 24 hours for daily manual review)

---

### Feature 5: AI Agent Guidance (MCP Prompts)

**Description**: Pre-built workflow prompts that guide AI agents through complex optimization scenarios.

**Prompts Available**:

**`campaign_optimization_workflow`**
- Step-by-step guide for optimizing a campaign from assessment through execution
- Includes decision criteria (when to adjust, by how much)
- Recommends when to escalate to humans

**`troubleshoot_underdelivery`**
- Systematic diagnostic workflow for campaigns significantly underdelivering
- Checks bid competitiveness, budget caps, targeting restrictions, historical adjustments
- Provides recommended actions based on root cause analysis

**`margin_optimization_strategy`**
- Specific guidance for margin-based revenue line items
- Balances margin percentage vs. delivery volume
- Considers advertiser's margin and performance goals

**User Value**:
- AI agents can handle complex workflows without custom coding
- Embedded best practices from experienced media buyers
- Consistent approach across different AI agent implementations
- Reduces need for AI agents to "figure out" optimization strategies

---

## Technical Architecture

### Monorepo Structure

```
bidshifter-mcp/
├── packages/
│   ├── dbm-mcp/                 # Server 1: Generic cross-platform reporting
│   ├── dv360-mcp/               # Server 2: DV360 entity management
│   ├── bidshifter-mcp/          # Server 3: BidShifter optimization
│   └── shared/                  # Shared types, utilities
├── terraform/                   # Infrastructure as Code
├── scripts/                     # Deployment automation
└── docs/                        # Documentation
```

### Technology Stack

**GCP-Native Architecture** (no Cloudflare layer)

**Compute Layer**
- **Cloud Run**: Containerized MCP servers (Node.js 20, TypeScript, Express.js)
- **Auto-scaling**: 0-10 instances per service based on load
- **Regional deployment**: europe-west2 (London) for EU data residency
- **HTTP Transport**: MCP protocol directly over HTTPS with JWT authentication

**Data Layer**
- **BigQuery**: Data warehouse and operational data store
  - Normalized delivery metrics (partitioned by date, clustered by advertiser)
  - Raw platform-specific tables (DV360, Google Ads, Meta)
  - Optimization configuration (strategies, thresholds, schedules)
  - Task state tracking (queued, processing, completed)
  - Adjustment history and effectiveness analysis
- **Cloud Storage**: Object storage (SDF files, entity snapshots, 7-day retention)
- **Pub/Sub**: Event streaming (audit trail, async workflows, <1M messages/month)
- **Secret Manager**: Credentials storage (OAuth tokens, JWT secrets, API keys)

**Automation**
- **Cloud Scheduler**: Cron jobs (data sync every 4h, optimization scans every 4h, adjustment execution every 30min)
- **VPC & Cloud NAT**: Networking (controlled egress, static IPs for API allow lists)

**External Integrations**
- DV360 API v4 + Bid Manager API v2
- Google Ads API
- Meta Marketing API
- Future: The Trade Desk, Amazon DSP

### Data Flow Example: Optimize Campaign Bids

```
1. AI Agent (Claude Desktop)
   → HTTPS POST (JWT auth) → Optimization MCP Server (Cloud Run)
   MCP method: tools/call "optimize_campaign_bids"

2. Optimization Service (internal MCP client)
   → Reporting MCP Server (Cloud Run)
   MCP method: tools/call "get_campaign_delivery"

3. Reporting Service
   → BigQuery: Query normalized delivery metrics tables

4. Optimization Service (internal logic)
   - Calculate pacing offset (actual vs expected)
   - Determine revenue type (cost_plus, margin, fixed_cpm)
   - Apply adjustment algorithm (2% daily rate, strategy multiplier)
   - Check budget protection rules
   - Generate adjustment recommendations

5. Optimization Service (internal MCP client)
   → Management MCP Server (Cloud Run)
   MCP method: tools/call "update_line_item_bid" (for each adjustment)

6. Management Service
   → DV360 API: SDF download → modify CSV → SDF upload
   → Pub/Sub: Publish "bids.adjusted" event

7. Historical Service (Pub/Sub subscriber)
   → BigQuery: Insert to adjustments_changelog table

8. Optimization Service → AI Agent
   Return: {taskId, status: "completed", adjustments: [...]}
```

---

## User Workflows

### Workflow 1: Initial Campaign Setup

**Actor**: Media Buyer (human) + AI Agent

**Steps**:
1. Media buyer creates campaign in DV360/Google Ads/Meta
2. Media buyer tells AI agent: "Enable optimization for campaign X with moderate strategy"
3. AI agent calls `configure_optimization` tool on optimization server
4. Configuration written to BigQuery `optimization_config` table:
   - Campaign ID, target pacing: 95%, strategy: moderate, max adjustment: 10%
   - Enabled: true, created_at: timestamp
5. Next scheduled optimization scan (within 4 hours) queries config table and picks up new campaign
6. AI agent begins monitoring and optimizing automatically

**Success Criteria**:
- Campaign appears in optimization scan results
- First optimization runs within 8 hours of setup
- Media buyer receives notification when optimization starts

---

### Workflow 2: Routine Optimization (Autonomous)

**Actor**: AI Agent (Claude) running on schedule

**Steps**:
1. Scheduled scan (every 4 hours) publishes `optimization.needed` events for campaigns with pacing issues
2. AI agent consumes event, calls `get_campaign_delivery` to fetch current metrics
3. AI agent analyzes pacing: Campaign at 72% pacing, expected 85% → 13% underdelivering
4. AI agent calls `get_optimization_recommendations` (dry-run mode)
5. Optimization server recommends: +12% CPM increase across 24 line items
6. AI agent reviews recommendations, determines reasonable (< 20% threshold)
7. AI agent calls `optimize_campaign_bids` (execute mode)
8. Adjustments queued, executed in next batch window (within 30 minutes)
9. AI agent posts notification to Slack: "Optimized Campaign X: 15 line items adjusted, avg +12% CPM"
10. 24 hours later, outcome tracker measures pacing improvement: 72% → 81% (9% improvement)

**Success Criteria**:
- Optimization completes within 1 hour of scan identifying issue
- AI agent shows clear reasoning for adjustments
- Pacing improves within 24-48 hours
- No adjustments exceed configured thresholds

---

### Workflow 3: Edge Case Escalation

**Actor**: AI Agent + Human (Media Buyer)

**Steps**:
1. AI agent identifies campaign severely underdelivering (42% pacing, expected 85%)
2. AI agent calls `troubleshoot_underdelivery` prompt for diagnostic guidance
3. Prompt guides AI through checks:
   - Bid competitiveness: CPM hasn't increased significantly
   - Budget caps: Not hitting daily budget limit
   - Targeting: Frequency cap of 3/week potentially limiting reach
4. AI agent determines: Likely frequency cap issue, outside threshold for autonomous action
5. AI agent posts to Slack: "Campaign X severely underdelivering. Frequency cap may be limiting reach. Recommend human review of targeting settings."
6. Media buyer reviews, decides to relax frequency cap from 3/week to 5/week
7. Media buyer makes change in DV360 directly (or via management MCP server)
8. AI agent continues monitoring, pacing improves over next 48 hours

**Success Criteria**:
- AI agent correctly identifies edge case requiring human review
- Escalation includes diagnostic information and recommended action
- Human receives escalation within 4 hours of issue detection
- Resolution tracked in system

---

### Workflow 4: Performance Reporting (Ad-Hoc)

**Actor**: Campaign Manager (human) + AI Agent

**Steps**:
1. Campaign manager asks AI agent: "How did Campaign X perform last week compared to two weeks ago?"
2. AI agent calls `get_campaign_delivery` for two date ranges:
   - Last week (2025-01-13 to 2025-01-19)
   - Two weeks ago (2025-01-06 to 2025-01-12)
3. Reporting server queries BigQuery normalized tables
4. AI agent calls `get_adjustment_history` to see if optimizations occurred
5. AI agent synthesizes response:
   ```
   Campaign X Performance Comparison:

   Last Week (Jan 13-19):
   - Spend: $12,450 (vs. $9,230 two weeks ago, +35%)
   - Impressions: 2.1M (vs. 1.8M, +17%)
   - CPA: $48.20 (vs. $51.30, -6% improvement)
   - Pacing: 94% (vs. 72%, +22%)

   Optimization Activity:
   - Jan 15: Increased bids by avg 12% (24 line items)
   - Jan 17: Increased bids by avg 8% (18 line items)

   Analysis: Bid increases drove higher spend and impressions while maintaining CPA performance. Pacing significantly improved.
   ```

**Success Criteria**:
- Response includes relevant metrics automatically
- Historical adjustments correlated with performance changes
- Natural language response, no need for campaign manager to write SQL

---

## Success Metrics

### Operational Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Optimization Response Time | < 4 hours from pacing issue detection | Time between scan identifying issue and AI agent completing optimization |
| Autonomous Operation Rate | > 80% of optimizations run without human intervention | % of optimizations that don't require escalation |
| Optimization Success Rate | > 70% of adjustments improve pacing within 48 hours | % of adjustments where post-adjustment pacing is better than pre-adjustment |

### Performance Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| MCP Tool Latency (P50) | < 500ms | Cloud Run metrics |
| MCP Tool Latency (P99) | < 2s | Cloud Run metrics |

### Business Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time Savings | > 70% reduction in manual optimization time | Survey + time tracking |
| Campaign Pacing Accuracy | > 90% of campaigns deliver within ±10% of target | BigQuery analysis of final pacing |
| Multi-Platform Adoption | Support 3+ platforms (DV360, Google Ads, Meta) | Feature availability |

---

## Development Phases

### Phase 1: Foundation (Weeks 1-6)

**Goals**: Establish monorepo, shared types, basic infrastructure

**Deliverables**:
- Monorepo structure with three packages
- Shared TypeScript types (Zod schemas)
- BigQuery normalized schemas deployed
- Terraform modules for GCP infrastructure
- CI/CD pipeline (GitHub Actions)

**Success Criteria**:
- All three MCP servers deploy successfully
- Can insert/query test data in BigQuery
- MCP Gateway responds to basic requests

---

### Phase 2: Reporting Server (Weeks 7-10)

**Goals**: Build `dbm-mcp` with DV360 support

**Deliverables**:
- MCP tools: `get_campaign_delivery`, `get_performance_metrics`, `get_pacing_status`
- DV360 reporting adapter (Bid Manager API v2)
- BigQuery normalized tables populated from DV360
- Scheduled data sync function (every 4 hours)

**Success Criteria**:
- AI agent can query DV360 campaign metrics via MCP
- Query latency < 500ms P50, < 3s P99
- Data freshness < 4 hours

---

### Phase 3: Management Server (Weeks 11-14)

**Goals**: Build `dv360-mcp` with DV360 SDF support

**Deliverables**:
- MCP tools: `fetch_campaign_entities`, `update_line_item_bid`, `update_revenue_margin`
- DV360 SDF download/upload implementation
- Cloud Storage integration for SDF staging
- Pub/Sub event publishing for audit trail
- Idempotent retry logic

**Success Criteria**:
- AI agent can update DV360 line item bids via MCP
- All bid changes logged to BigQuery
- SDF operations complete within 5 minutes P99

---

### Phase 4: Optimization Server (Weeks 15-20)

**Goals**: Build `bidshifter-optimization-mcp` orchestrating other two servers

**Deliverables**:
- MCP tools: `optimize_campaign_bids`, `get_optimization_recommendations`, `configure_optimization`
- Optimization algorithms (pacing offset → bid delta calculation)
- MCP-to-MCP client (calls reporting + management servers)
- Historical analysis service (effectiveness tracking)
- Scheduled functions: optimization scan, adjustment executor, outcome tracker
- MCP prompts: `campaign_optimization_workflow`, `troubleshoot_underdelivery`

**Success Criteria**:
- AI agent can run full optimization workflow end-to-end
- > 70% of optimizations improve pacing within 48 hours
- Scheduled optimization scan runs every 4 hours
- Adjustment executor processes batches every 30 minutes

---

### Phase 5: Multi-Platform Expansion (Weeks 21-28)

**Goals**: Add Google Ads and Meta platform support

**Deliverables**:
- Google Ads reporting adapter in reporting server
- Google Ads management adapter in management server
- Meta reporting adapter in reporting server
- Meta management adapter in management server
- BigQuery ETL jobs for Google Ads and Meta raw data
- Platform selection logic in optimization server

**Success Criteria**:
- AI agent can optimize Google Ads and Meta campaigns
- Same optimization logic works across all three platforms
- No changes required to optimization server algorithms

---

### Phase 6: Production Hardening (Weeks 29-32)

**Goals**: Comprehensive testing, monitoring, documentation

**Deliverables**:
- Unit tests (> 80% coverage)
- Integration tests (service-to-service)
- E2E tests (MCP client workflows)
- Load testing (simulate production traffic)
- Grafana dashboards for monitoring
- Alert policies for critical metrics
- Runbooks for common operations
- API documentation for all MCP tools

**Success Criteria**:
- All tests pass
- Alerts fire correctly on test failures
- < 0.1% error rate under production load
- Documentation complete for all features

---

## Future Enhancements

### Short-Term (6 months)

**1. Budget Optimization**
- Automatically reallocate budget across campaigns based on performance
- Recommend budget increases for high-performing campaigns

**2. Goal Performance Optimization**
- Adjust bids to hit CPA/ROAS targets, not just pacing
- Multi-objective optimization (pacing + goal)

**3. Creative Performance Analysis**
- Identify underperforming creatives
- Recommend pausing poor performers, scaling winners

**4. A/B Testing Support**
- Run controlled experiments on optimization strategies
- Measure lift from BidShifter vs. manual optimization

### Medium-Term (12 months)

**5. Machine Learning Enhancements**
- Train ML model on historical adjustments
- Predict adjustment effectiveness before executing
- Personalized optimization strategies per advertiser

**6. Additional Platform Support**
- The Trade Desk
- Amazon DSP
- LinkedIn Ads
- TikTok Ads

**7. Advanced Forecasting**
- Predict end-of-flight delivery with confidence intervals
- Recommend mid-flight adjustments to hit targets

**8. Anomaly Detection**
- Detect sudden performance drops (fraud, technical issues)
- Auto-pause campaigns with severe anomalies

### Long-Term (18+ months)

**9. Cross-Platform Budget Allocation**
- Optimize budget split across DV360, Google Ads, Meta
- Unified performance view across all platforms

**10. Programmatic Guaranteed Support**
- Extend beyond auction-based campaigns
- Support guaranteed deals, preferred deals

**11. Audience Optimization**
- Recommend targeting adjustments based on performance
- Auto-create lookalike audiences from converters

**12. White-Label Solution**
- Enable agencies to deploy BidShifter for their clients
- Multi-tenant architecture with org isolation

---

## Appendix: Glossary

- **MCP**: Model Context Protocol - Standard for AI-to-tool communication
- **DV360**: Display & Video 360 - Google's programmatic advertising platform
- **DSP**: Demand-Side Platform - Software for buying digital ads programmatically
- **SDF**: Structured Data File - CSV format for bulk DV360 operations
- **CPM**: Cost Per Mille (thousand impressions) - Bid price
- **CPA**: Cost Per Action/Acquisition - Performance metric
- **ROAS**: Return on Ad Spend - Revenue divided by spend
- **Pacing**: Delivery progress vs. expected progress based on flight dates
- **Flight**: Time period from campaign start to end date
- **Line Item**: Ad unit with targeting and bidding configuration
- **Insertion Order**: Campaign-level entity in DV360 (contains line items)
- **Margin**: Percentage markup on media cost for revenue-based line items

---

**Document End**

_This PRD is a living document and will be updated as product requirements evolve._
