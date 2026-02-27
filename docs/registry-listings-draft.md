# MCP Registry Listings — Draft

Ready-to-submit listings for the three major MCP registries. Submit once the repository is public and the landing page is live.

---

## Smithery (smithery.ai)

**Name:** Cesteral MCP Servers

**Category:** Advertising / Marketing

**Description:**
Five production-ready MCP servers for programmatic advertising management across DV360, Google Ads, Meta Ads, and The Trade Desk. Provides ~68 tools for campaign CRUD, reporting, bulk operations, targeting, custom bidding, and performance insights — all accessible to AI agents via the Model Context Protocol.

**Platforms:** Google Display & Video 360, Google Ads, Meta Ads, The Trade Desk, Bid Manager (reporting)

**Tool Count:** ~68 tools across 5 servers
- dbm-mcp: 5 reporting tools (delivery metrics, performance KPIs, pacing, custom queries)
- dv360-mcp: 17 management tools (entity CRUD, batch ops, custom bidding, targeting)
- ttd-mcp: 18 management tools (entity CRUD, bulk ops, reporting, GraphQL)
- gads-mcp: 9 management tools (entity CRUD, GAQL queries, bulk mutate)
- meta-mcp: 15 management tools (entity CRUD, insights, targeting, duplication, previews)

**Auth:**
- Hosted: JWT authentication (single token for all servers)
- Self-hosted: Platform-specific credentials (Google OAuth2, TTD partner tokens, Meta Bearer tokens)

**Deployment:**
- Self-hosted via Docker + Terraform on GCP Cloud Run
- Each server runs as an independent container
- Full IaC included (Terraform modules, Cloud Build CI/CD)

**License:** Business Source License 1.1 (converts to Apache 2.0 after 3 years)

**Links:**
- GitHub: `https://github.com/cesteral/cesteral-mcp-servers` _(update when public)_
- Landing page: _(update when built)_
- Documentation: See repository README

---

## mcp.so

**Name:** Cesteral MCP Servers

**Category:** Advertising / Marketing

**Short Description:** AI-native programmatic advertising optimization across DV360, Google Ads, Meta Ads, and The Trade Desk via 5 MCP servers with ~68 tools.

**Long Description:**
Cesteral provides five independent MCP servers for managing programmatic advertising campaigns across major platforms. Built for AI agents, each server wraps a platform API and exposes tools via the Model Context Protocol:

- **dbm-mcp** — DV360 reporting via Bid Manager API v2 (delivery metrics, pacing, custom queries)
- **dv360-mcp** — DV360 campaign management via DV360 API v4 (11 entity types, targeting, custom bidding)
- **ttd-mcp** — The Trade Desk management via TTD REST API (9 entity types, GraphQL, bulk operations)
- **gads-mcp** — Google Ads management via REST API v23 (GAQL queries, entity CRUD, bulk mutate)
- **meta-mcp** — Meta Ads management via Marketing API v21.0 (insights, targeting discovery, duplication)

All servers feature per-session authentication, OpenTelemetry observability, rate limiting, and structured logging. Deploy self-hosted on GCP Cloud Run with included Terraform and CI/CD configuration.

**Auth Requirements:**
| Server | Self-hosted | Hosted |
|--------|-------------|--------|
| dbm-mcp | Google OAuth2 headers | JWT |
| dv360-mcp | Google OAuth2 headers | JWT |
| ttd-mcp | TTD partner token headers | JWT |
| gads-mcp | Google Ads OAuth2 headers | JWT |
| meta-mcp | Meta Bearer token | JWT |

**License:** BSL 1.1

**Links:**
- GitHub: _(update when public)_
- Landing page: _(update when built)_

---

## Glama (glama.ai)

**Name:** Cesteral MCP Servers

**Category:** Advertising / Marketing

**Tagline:** AI-native programmatic advertising management for DV360, Google Ads, Meta Ads, and The Trade Desk

**Description:**
Five production-ready MCP servers providing ~68 tools for programmatic advertising campaign management. Each server wraps a major advertising platform API and exposes operations through the Model Context Protocol, enabling AI agents to manage campaigns, analyze performance, adjust bids, and configure targeting across platforms.

**Key capabilities:**
- Campaign lifecycle management (create, update, pause, archive) across 4 platforms
- Performance reporting with custom metrics, breakdowns, and time series
- Bulk operations for bid adjustments, status updates, and entity creation
- Targeting configuration and audience discovery (DV360, Meta)
- Custom bidding algorithm management (DV360)
- GAQL query execution for flexible Google Ads reporting
- GraphQL API access for advanced Trade Desk operations

**Architecture:**
- 5 independent servers, each deployable as a separate container
- Per-session authentication with platform-specific credential handling
- OpenTelemetry traces and metrics for production observability
- TypeScript/Node.js with Zod runtime validation
- Terraform + Cloud Build IaC for GCP Cloud Run deployment

**License:** Business Source License 1.1 (Apache 2.0 change date: 3 years from release)

**Links:**
- GitHub: _(update when public)_
- Landing page: _(update when built)_
- Demo/screenshots: _(update when available)_
