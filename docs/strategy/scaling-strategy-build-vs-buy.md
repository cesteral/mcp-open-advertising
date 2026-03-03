# Scaling Strategy: Build vs. Buy for MCP Servers

> **Last updated:** February 2026
>
> Research into whether Cesteral should adopt official/third-party MCP servers for advertising platforms or continue owning its server implementations.

---

## 1. Landscape of Official Ad-Platform MCP Servers

| Platform | Official MCP Server? | Status | Capabilities |
|---|---|---|---|
| **Google Ads** | Yes -- [`googleads/google-ads-mcp`](https://github.com/googleads/google-ads-mcp) | Experimental (since Oct 2025) | **Read-only**: GAQL queries, list accessible accounts. No write operations. |
| **DV360** | **No** | Only a [community repo](https://github.com/caspercrause/dv360-ads-mcp-server) exists | N/A |
| **Bid Manager (DBM)** | **No** | None | N/A |
| **The Trade Desk** | **No** | None; no announced plans | N/A |
| **Amazon Ads** | Yes -- [Amazon Ads MCP Server](https://advertising.amazon.com/en-us/library/news/amazon-ads-mcp-server-open-beta/) | Open Beta (Feb 2026) | Full CRUD, reporting, multi-step workflow tools |

### Key observations

- **Google Ads MCP** is the only official server touching the Google advertising ecosystem. It is Python-based, marked experimental, and limited to two core tools (`search` for GAQL queries, `list_accessible_customers`). Write/mutation support is on the roadmap but has no published timeline.
- **No official DV360 or Bid Manager MCP server exists.** Google has not announced plans for one.
- **The Trade Desk has no MCP server** -- official or community. Their developer portal makes no mention of MCP.
- **Amazon Ads** is the most complete official offering, with full campaign CRUD, reporting, and pre-built multi-step workflow tools. It entered open beta in February 2026.

### Emerging standard: Ad Context Protocol (AdCP)

[AdCP](https://adcontextprotocol.org/) is an open industry standard for AI-powered advertising automation, managed by Agentic Advertising (AAO). It operates over both MCP and A2A (Agent-to-Agent Protocol) transports and defines three sub-protocols:

1. **Media Buy Protocol** -- campaign lifecycle management
2. **Creative Protocol** -- AI-powered creative generation
3. **Signals Protocol** -- first-party data and audience building

Current stable version is v2.5.1; v3.0.0-beta adds delivery forecasting and commerce media. Worth monitoring for interoperability as the standard matures.

---

## 2. Cesteral vs. Official Servers -- Capability Comparison

### Google Ads MCP (official) vs. Cesteral dbm-mcp

| Dimension | Google Ads MCP | Cesteral dbm-mcp |
|---|---|---|
| Tools | 2-3 (GAQL search, list accounts) | 5+ (custom query builder, pacing, performance metrics, historical trends) |
| Write operations | None | N/A (reporting is read-only by nature, but with rich query composition) |
| MCP Resources | None | 6+ resource URIs (filter types, metric types, report types, query examples) |
| Schema discovery | None | Dynamic filter/metric catalogs (~280 filters, ~100 metrics) |
| Transport | stdio only | Streamable HTTP (production-ready for Cloud Run) |
| Language | Python | TypeScript (consistent with Cesteral stack) |

### No official comparison possible for DV360 or TTD

Since no official MCP servers exist for DV360 or The Trade Desk, Cesteral's implementations are unmatched:

**Cesteral dv360-mcp** -- 16 tools:
- Full entity CRUD (list, get, create, update, delete)
- Targeting CRUD (list, get, create, delete assigned targeting options + validation)
- Custom bidding algorithms (create, manage scripts, manage rules, list)
- Workflow tools (bulk status updates, bid adjustments)
- Dynamic schema pattern with MCP Resources for stdio compatibility

**Cesteral ttd-mcp** -- 18 tools:
- Full entity CRUD across 9 entity types
- Bulk operations (create, update, status, archive)
- Reporting (async report generation + CSV download/parse)
- GraphQL query tool for advanced access
- Entity validation (dry-run mode)
- Bid adjustment with safe read-modify-write pattern

---

## 3. Recommendation: Continue Owning Our Servers

### Primary reasons

1. **No official alternatives exist for DV360, DBM, or TTD.** We would be waiting indefinitely for platforms that may never ship an MCP server. Google's focus appears to be on Google Ads (search/performance max), not DV360.

2. **The official Google Ads server covers ~5% of what dbm-mcp does.** It has no custom query builder, no MCP Resources for schema discovery, no structured output formatting. Even as a reporting-only server, it is far less capable.

3. **Cross-server orchestration is our differentiator.** The five-server architecture (reporting via dbm-mcp, DV360 management via dv360-mcp, TTD management via ttd-mcp, Google Ads management via gads-mcp, Meta Ads management via meta-mcp) enables end-to-end workflows like "detect underdelivery -> analyze metrics -> adjust bids" that no single official server could replicate.

4. **Domain-specific design patterns add significant value.** Dynamic schema introspection, simplified schemas + MCP Resources for stdio compatibility, parent-ID validation, entity validation dry-runs -- these are purpose-built for programmatic advertising automation and would not exist in generic official servers.

5. **We control the release cycle.** When DV360 API v4 adds entity types or TTD's REST API changes, we can update immediately. Official servers from platform vendors typically lag behind their own API releases.

6. **Stack consistency.** All five Cesteral servers share TypeScript, tsyringe DI, Pino logging, Zod validation, and the `@cesteral/shared` package. Adopting a Python-based official server would fragment the stack and increase maintenance burden.

### Where official servers could add value

| Scenario | Approach |
|---|---|
| **Expanding to Google Ads** (search, PMax campaigns) | Evaluate the official `google-ads-mcp` as a starting point; likely need to fork and extend for write operations and richer tooling |
| **Expanding to Amazon Ads** | The official Amazon Ads MCP server is the most complete; evaluate whether it meets requirements before building custom |
| **Meta/Facebook Ads** | Cesteral `meta-mcp` already built with 15 tools (full CRUD, insights, targeting, bulk operations) |

Even in expansion scenarios, we would likely outgrow official servers quickly due to the depth of tooling needed for production programmatic workflows.

---

## 4. Recommended Scaling Strategy

| Strategy | When to Apply |
|---|---|
| **Keep building our own** | DV360, Bid Manager, TTD -- no viable alternatives exist |
| **Evaluate official + extend** | Google Ads, Amazon Ads -- fork/enhance if expanding to those platforms |
| **Monitor AdCP** | If the standard matures and gains adoption, align tool interfaces for interoperability |
| **Maximize shared infrastructure** | Continue investing in `@cesteral/shared` -- transport helpers, auth, telemetry, error handling, session management all reduce per-server cost |
| **Standardize the new-server pattern** | Adding a new platform should be a matter of creating `packages/xxx-mcp/` following the established architecture, reusing shared infrastructure, and implementing platform-specific service logic |

### Cost of adding a new platform server

Given the shared infrastructure in `@cesteral/shared`, the incremental work for a new platform is:

1. Platform-specific HTTP client / auth strategy
2. Entity type mapping and schema definitions
3. Tool definitions following the established pattern (CRUD + bulk + reporting)
4. Platform-specific MCP Resources and Prompts

The transport layer, session management, telemetry, error handling, rate limiting, and deployment infrastructure are all reusable.

---

## 5. Sources

- [Google Ads MCP Server (GitHub)](https://github.com/googleads/google-ads-mcp) -- Experimental, read-only, Python
- [Google Ads MCP announcement (Oct 2025)](http://ads-developers.googleblog.com/2025/10/open-source-google-ads-api-mcp-server.html)
- [Google Ads MCP developer guide](https://developers.google.com/google-ads/api/docs/developer-toolkit/mcp-server)
- [Amazon Ads MCP Server open beta (Feb 2026)](https://advertising.amazon.com/en-us/library/news/amazon-ads-mcp-server-open-beta/)
- [Ad Context Protocol (AdCP)](https://adcontextprotocol.org/) -- Open standard for AI-powered advertising automation
- [AdCP documentation](https://docs.adcontextprotocol.org/)
- [Official MCP Registry](https://registry.modelcontextprotocol.io/) -- Anthropic's server registry
- [DV360 API v4 reference](https://developers.google.com/display-video/api/reference/rest/v4)
