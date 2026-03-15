# MCP Registry Listings — Draft

Ready-to-submit listings for the three major MCP registries. Submit once the repository is public and the landing page is live.

---

## Smithery (smithery.ai)

**Name:** Cesteral MCP Servers

**Category:** Advertising / Marketing

**Description:**
Thirteen production-ready MCP servers for programmatic advertising management across DV360, Google Ads, Meta Ads, The Trade Desk, LinkedIn Ads, TikTok Ads, CM360, SA360, Pinterest, Snapchat, Amazon DSP, and Microsoft Ads. Provides campaign CRUD, reporting, bulk operations, targeting, custom bidding, and performance insights to AI agents via the Model Context Protocol.

**Platforms:** Google Display & Video 360, Google Ads, Meta Ads, The Trade Desk, LinkedIn Ads, TikTok Ads, Bid Manager, Campaign Manager 360, Search Ads 360, Pinterest Ads, Snapchat Ads, Amazon DSP, Microsoft Ads

**Tool Count:** 13 independent servers; tool count should be refreshed before submission

- dbm-mcp: 5 reporting tools (delivery metrics, performance KPIs, pacing, custom queries)
- dv360-mcp: 20 management tools (entity CRUD, batch ops, custom bidding, targeting, validation)
- ttd-mcp: 20 management tools (entity CRUD, bulk ops, reporting, GraphQL)
- gads-mcp: 12 management tools (entity CRUD, GAQL queries, bulk mutate, insights)
- meta-mcp: 18 management tools (entity CRUD, insights, targeting, duplication, previews)
- linkedin-mcp: 18 management tools (entity CRUD, analytics, targeting, duplication, forecasting)
- tiktok-mcp: 21 management tools (entity CRUD, reporting, targeting, duplication, audience estimation)
- cm360-mcp: Campaign Manager 360 management and reporting tools
- sa360-mcp: Search Ads 360 management and reporting tools
- pinterest-mcp: Pinterest Ads management and reporting tools
- snapchat-mcp: Snapchat Ads management and reporting tools
- amazon-dsp-mcp: Amazon DSP management and reporting tools
- msads-mcp: Microsoft Ads management and reporting tools

**Auth:**

- Hosted via Cesteral Intelligence: managed access to a Cesteral-operated MCP fleet
- Self-hosted: platform-specific credentials and deployment under your own infrastructure

**Deployment:**

- Self-hosted via Docker + Terraform on GCP Cloud Run
- Each server runs as an independent container
- Full IaC included (Terraform modules, Cloud Build CI/CD)
- Managed hosting and orchestration available through Cesteral Intelligence at https://cesteral.com

**License:** Apache License 2.0

**Links:**

- GitHub: https://github.com/cesteral/cesteral-mcp-servers
- Landing page: https://cesteral.com
- Documentation: See repository README

---

## mcp.so

**Name:** Cesteral MCP Servers

**Category:** Advertising / Marketing

**Short Description:** AI-native programmatic advertising optimization across 13 open-source MCP servers for major ad platforms, with managed hosting and orchestration available through Cesteral Intelligence.

**Long Description:**
Cesteral provides 13 independent MCP servers for managing programmatic advertising campaigns across major platforms. Built for AI agents, each server wraps a platform API and exposes tools via the Model Context Protocol:

- **dbm-mcp** — DV360 reporting via Bid Manager API v2 (delivery metrics, pacing, custom queries)
- **dv360-mcp** — DV360 campaign management via DV360 API v4 (11 entity types, targeting, custom bidding)
- **ttd-mcp** — The Trade Desk management via TTD REST API (9 entity types, GraphQL, bulk operations)
- **gads-mcp** — Google Ads management via REST API v23 (GAQL queries, entity CRUD, bulk mutate)
- **meta-mcp** — Meta Ads management via Marketing API v21.0 (insights, targeting discovery, duplication)
- **linkedin-mcp** — LinkedIn Ads management via Marketing API v2 (analytics, targeting, forecasting)
- **tiktok-mcp** — TikTok Ads management via Marketing API v1.3 (reporting, targeting, audience estimation)
- **cm360-mcp** — Campaign Manager 360 management and reporting
- **sa360-mcp** — Search Ads 360 management and reporting
- **pinterest-mcp** — Pinterest Ads management and reporting
- **snapchat-mcp** — Snapchat Ads management and reporting
- **amazon-dsp-mcp** — Amazon DSP management and reporting
- **msads-mcp** — Microsoft Ads management and reporting

All servers feature production-minded auth handling, OpenTelemetry observability, rate limiting, and structured logging. Deploy self-hosted on GCP Cloud Run with included Terraform and CI/CD configuration, or use them through the hosted Cesteral Intelligence control plane.

**Auth Requirements:**
| Server | Self-hosted | Hosted |
|--------|-------------|--------|
| All servers | Platform-specific credentials under your control | Managed through Cesteral Intelligence |

Managed hosting and orchestration available through Cesteral Intelligence at https://cesteral.com

**License:** Apache License 2.0

**Links:**

- GitHub: https://github.com/cesteral/cesteral-mcp-servers
- Landing page: https://cesteral.com

---

## Glama (glama.ai)

**Name:** Cesteral MCP Servers

**Category:** Advertising / Marketing

**Tagline:** AI-native programmatic advertising management across 13 open-source MCP servers for major ad platforms

**Description:**
Thirteen production-ready MCP servers for programmatic advertising campaign management. Each server wraps a major advertising platform API and exposes operations through the Model Context Protocol, enabling AI agents to manage campaigns, analyze performance, adjust bids, and configure targeting across platforms.

**Key capabilities:**

- Campaign lifecycle management across major advertising platforms
- Performance reporting with custom metrics, breakdowns, and time series
- Bulk operations for bid adjustments, status updates, and entity creation
- Targeting configuration and audience discovery (DV360, Meta, LinkedIn, TikTok)
- Custom bidding algorithm management (DV360)
- GAQL query execution for flexible Google Ads reporting
- GraphQL API access for advanced Trade Desk operations
- LinkedIn analytics with multi-pivot breakdowns
- TikTok async reporting with breakdown dimensions

**Architecture:**

- 13 independent servers, each deployable as a separate container
- Per-session authentication with platform-specific credential handling
- OpenTelemetry traces and metrics for production observability
- TypeScript/Node.js with Zod runtime validation
- Terraform + Cloud Build IaC for GCP Cloud Run deployment
- Managed hosting and orchestration available through Cesteral Intelligence at https://cesteral.com

**License:** Apache License 2.0

**Links:**

- GitHub: https://github.com/cesteral/cesteral-mcp-servers
- Landing page: https://cesteral.com
- Demo/screenshots: See repository README for workflow examples
