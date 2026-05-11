# MCP in 2026 — Protocol Notes and Cesteral Implications

Notes from the MCP state-of-the-protocol talk, cross-checked against public sources, plus the concrete implications for this repository.

## Where MCP is now

MCP applications, now officially called **MCP Apps**, let a server ship interactive UI that renders in a client conversation. MCP Apps became the first official MCP extension in January 2026. They use tool UI metadata plus `ui://` resources, rendered by hosts in sandboxed iframes. Current official client support includes Claude, ChatGPT, Goose, and Visual Studio Code.

The speaker's "110M monthly downloads" figure broadly tracks with public reporting: MCP hit roughly 97M monthly SDK downloads in March 2026, up from roughly 2M near launch in November 2024.

## The 2026 framing: connectivity

The speaker's thesis — that 2026 agents will combine skills, MCP, and CLI/computer use — aligns with Anthropic's public "2026 MCP Roadmap" and commentary across the ecosystem framing MCP as the connective tissue for non-coding knowledge-worker agents. 2024 was demos, 2025 was coding agents (ideal case: local, verifiable, compiler in the loop), and 2026 is general knowledge-worker agents that need to connect to SaaS apps and shared drives.

There is no single connectivity solution. The right stack combines skills (reusable domain knowledge), CLI/computer use (great for local coding agents with a sandbox), and MCP (for rich semantics, UI, long-running tasks, auth, governance, platform independence).

## Progressive discovery

The context-bloat problem is real and directly relevant to this repository. Cesteral exposes 13 platform servers and several packages already have 20+ tools. Clients increasingly defer tool loading behind a "tool search" primitive so the model only pulls in tools when needed.

## Programmatic tool calling ("code mode")

Cloudflare's public write-up is the strongest corroboration here. Their Code Mode pattern exposes the entire Cloudflare API (2,500+ endpoints) through just two tools — `search()` and `execute()` — in roughly 1,000 tokens of context. They claim a 99.9% reduction in input tokens versus a conventional MCP server, which would otherwise need ~1.17M tokens (more than most models' context windows). The model writes JavaScript against a typed representation of the API and the server executes it, returning only results.

Cloudflare's framing captures the underlying insight: LLMs are better at writing code to call MCP than at calling MCP directly, because they have seen millions of lines of real code but only contrived tool-calling examples. MCP's structured output primitive helps the model compose calls together by giving it type information for tool return values.

## Protocol roadmap — core

**Transport scalability.** Confirmed, but the current official framing is not "add gRPC as another official transport." The March 2026 roadmap says MCP is not adding more official transports this cycle; the work is to evolve Streamable HTTP and the session model so remote servers can scale horizontally without sticky sessions or transport-held state. Discovery metadata served via `.well-known` is part of the same priority area.

**SDK v2s.** FastMCP's standalone project is downloaded roughly a million times a day and reportedly powers ~70% of MCP servers across all languages. FastMCP 1.0 was folded into the official Python SDK in 2024, but the standalone project has continued advancing (proxying, OpenAPI/FastAPI auto-generation). The speaker's "FastMCP is better than what we shipped" comment is consistent with community sentiment — though strictly speaking the gap is between FastMCP 2.0 (the active standalone project) and the in-tree version.

**Tasks.** SEP-1686 is now Final. Tasks introduce a protocol-level call-now, fetch-later primitive for long-running work. The roadmap still calls out production gaps to improve, especially retry semantics and result expiry policy, but server authors should treat Tasks as the preferred direction instead of ad hoc `submit`/`check`/`download` tool conventions when client support is available.

## Protocol roadmap — integrations

**Cross App Access (XAA).** Confirmed and already shipping. XAA landed in the 2025-11-25 MCP spec as SEP-990, built on the Identity Assertion JWT Authorization Grant (ID-JAG), with Okta marketing it as "Cross App Access." It lets enterprises broker token exchanges through their IdP (Okta, Google, etc.) so users don't re-auth per MCP server, and replaces static API keys and service accounts with short-lived scoped tokens. IdPs become the control plane for AI enterprise connections — centralized policy, auditable access, no consent fatigue.

**Server discovery via well-known URLs.** Confirmed as active work. SEP-1649 / SEP-2127 proposes `.well-known/mcp/server-card.json` ("Server Cards") for HTTP-based discovery of capabilities, transports, and auth requirements — modeled on the same pattern as OAuth 2.0 (`/.well-known/oauth-authorization-server`) and OpenID Connect (`/.well-known/openid-configuration`). This will let crawlers, IDEs, and agents auto-discover MCP servers on a domain.

**Skills over MCP.** Coming. The idea: server authors can ship domain knowledge alongside tools ("this is how you're supposed to use this"), updateable without plugin registries. Some experimentation is already possible today by giving the model a "load skills" tool, but the formal semantics are not yet in the spec.

## Governance

The speaker's passing mention of "we just have created a foundation" corresponds to a significant recent development: in December 2025, Anthropic donated MCP to the newly formed Agentic AI Foundation (AAIF), a directed fund under the Linux Foundation co-founded with Block and OpenAI and backed by Google, Microsoft, AWS, Cloudflare, and Bloomberg. MCP is a founding project alongside Block's `goose` and OpenAI's `AGENTS.md`. Anthropic has stated MCP's governance model is unchanged — still community-driven.

## What server authors need to do

Stop mechanically wrapping REST APIs as MCP servers. Design for how a human would want to interact with the system — that is usually a good starting point for agents too. Consider providing a constrained execution environment on the server side for broad APIs rather than exposing a long list of individual tools. Use richer MCP semantics — Apps, prompts/skills-like guidance, Tasks, resources, structured output, and elicitations — rather than defaulting to plain text tools.

## Cesteral implications

Status legend: ✅ done · 🟡 partial · ⬜ not started.

### 1. Adopt the shared Tasks helper across long-running flows 🟡

The shared abstraction already exists: `@cesteral/shared` exposes `async-task-tool.ts`, which wraps `server.experimental.tasks.registerToolTask()` so servers only supply the tool name, schemas, and work function. The protocol primitive (SEP-1686) is Final; the SDK side remains under the `experimental` namespace, which is the actual gate on broader rollout — not the lack of an abstraction.

Today only `dbm_run_custom_query_async` consumes the helper. Adoption targets, in priority order:

- every `*_submit_report` / `*_check_report_status` / `*_download_report` trio (TTD, TikTok, Snapchat, Amazon DSP, Pinterest, MSADS, SA360) — these are the largest concentration of polling boilerplate in the repo
- TTD Workflows API batch jobs (`ttd_create_campaigns` / `ttd_update_campaigns` / `ttd_create_ad_groups` / `ttd_update_ad_groups` in `mode: "batch"`) plus `ttd_get_job_status`
- TTD GraphQL bulk jobs (`ttd_graphql_query_bulk`, `ttd_graphql_mutation_bulk`, `ttd_graphql_bulk_job`)
- any blocking `*_get_report` tool that currently polls inside the server

Keep the existing split tools as compatibility wrappers until client support is broad enough to rely on Tasks everywhere.

### 2. Harden Streamable HTTP for horizontal scaling ✅ (with two known gaps)

The shared HTTP transport rebuilds session services on cache miss, and `MCP_SESSION_MODE` was removed as dead plumbing. The remaining work is concrete:

- **Rate limiter counters are per-instance.** `RateLimiter` lives in process memory, so the same caller can exceed the intended budget after a scale-out event. Either back it with Redis/Memorystore or document the soft guarantee.
- **`report-csv://` resources are per-instance.** A second-instance follow-up read of an in-memory resource will miss. Today this is mitigated by GCS spill (`REPORT_SPILL_BUCKET`); the path forward is to make the GCS-backed resource the canonical handle and stop holding bodies in memory.
- Add explicit tests for session rehydration across simulated instances and assert that auth fingerprints and audit logs stay stable.

### 3. Treat discovery metadata as product surface 🟡

`/.well-known/mcp/server-card.json` ships in every auth mode on every server (per `project_server_card.md`). The remaining work is convergence:

- single source of truth across `server.json` manifests, the canonical `registry.json`, and the runtime server-card response — generate counts from tool/resource/prompt definitions
- CI check that fails when registry metadata drifts from the registered tool list (recent commits already moved this direction; tighten until drift is impossible)
- align the runtime server-card schema with SEP-2127 when it goes Final

### 4. Progressive discovery: ship grouped capabilities next ✅ for tool search, ⬜ for capability groups

`{platform}_search_tools` is wired into all servers (recent commits `27c16f29`, `c4ea6f50`, `b4a63ba2`, `653d6aaa`), backed by the shared `tool-search.ts` factory. `server-capabilities://{server}/overview` and on-demand `tool-examples://...` resources also exist. The next layer is grouped capability surfaces, because TTD alone is 52 tools and Meta is 27:

- grouped capability summaries — reporting, campaign setup, targeting, creative upload, bulk mutations, diagnostics — exposed as resources or as a `capability_groups://{server}` index
- schema/resource lazy-loading only after a capability group is selected (the DV360 dynamic schema pattern is the local precedent)
- a small evaluation: do clients actually use `_search_tools` in practice, or do they prefer reading the overview resource? That answer should drive whether the active-search surface stays as a tool

### 5. Lean further into elicitations before MCP Apps 🟡

Elicitations are already in production for archive confirmations (`linkedin-mcp`, `tiktok-mcp` via the shared `elicitArchiveConfirmation` helper) and the transport advertises the capability by default. Given the write-side risk on 13 ad platforms — bulk mutations, budget changes, campaign deletes, conversion uploads — extending elicitation coverage is a higher-value, lower-cost step than building an MCP App:

- `*_bulk_update_status` (delete/archive paths), `*_delete_entity`, `*_bulk_update_entities` write paths
- budget changes (`meta_manage_budget_schedule`, line-item budget edits)
- conversion uploads (`sa360_insert_conversions` / `sa360_update_conversions`)
- destructive Workflows batch jobs (`ttd_update_campaigns` `mode: "batch"`)

Elicitation gates also pair naturally with the upcoming MCP Apps work — confirmations become richer UI in clients that support Apps, plain prompts in clients that don't.

### 6. Prototype one MCP App where UI is clearly better than text ⬜

Good candidates, in order of risk:

- pacing diagnostics: visualize budget, spend, remaining days, and risk level (read-only)
- reporting dashboard: filter, sort, chart, and export rows returned by report tools (read-only)
- bulk-change review: show proposed entity mutations before execution (write — pair with elicitation)
- campaign setup wizard: collect validated inputs with platform-specific dependencies (write — most complex)

Start with pacing or reporting to keep the first UI prototype off the write path.

### 7. Explore code mode only for very large API surfaces ⬜

Cloudflare's Code Mode pattern is relevant, but constrained. Do not replace high-value first-class tools. Consider a `search` + `execute` pattern only for:

- uncovered endpoints
- diagnostic read paths
- APIs with too many endpoints to expose cleanly
- power-user workflows where typed composition beats dozens of narrow tools

TTD is the natural place to evaluate — it already has `ttd_rest_request`, GraphQL tools, and Workflows-specific tools. The repo's existing structured output coverage (every tool definition ships an `outputSchema`) gives the model the type information Cloudflare argues makes code-mode work.

### 8. Get ready for Cross App Access (XAA) ⬜

Every server today has its own bespoke header strategy (`google-headers`, `ttd-token`, `meta-bearer`, `linkedin-bearer`, …) — exactly the static-credential model XAA is meant to replace. Concrete prep work:

- design a `MCP_AUTH_MODE=xaa` (or equivalent) that accepts ID-JAG short-lived tokens and exchanges them for the underlying platform credential
- decide where the IdP-token-to-platform-credential mapping lives (per-session services, or a shared exchange utility in `@cesteral/shared`)
- audit which platforms actually publish XAA support — adoption will be uneven for years
- document non-readiness explicitly until the first platform integration ships

This is forward-looking, but XAA is the auth lever enterprise buyers will ask about, and the existing per-platform header strategies are the most credibility-relevant gap.

### 9. Treat prompts as the local precursor to "skills over MCP" ✅

The repo already ships workflow prompts (`full_campaign_setup_workflow` in dv360-mcp, `msads_import_from_google` in msads-mcp). When the formal "skills over MCP" SEP lands, these are the migration anchors. Action: keep adding prompts for genuinely cross-tool workflows (pacing-fix, conversion backfill, cross-platform import) rather than per-tool guidance, so the migration surface stays coherent.

### 10. Surface tool-failure observability as a 2026 differentiator ✅

`InteractionLogger` captures every failed tool invocation with the full redacted upstream HTTP trail (method, URL, status, request/response bodies, per-attempt durations). `INTERACTION_LOG_MODE=file|gcs|stdout` covers self-host and hosted deployments, and the BigQuery external-table query in `CLAUDE.md` makes the data immediately useful. This is exactly the auditability story the 2026 enterprise framing demands — XAA gives short-lived tokens, this gives the audit trail of what was done with them. Document it more prominently in the public README and server cards rather than only in `CLAUDE.md`.

## Bottom line

2026 is about full agent connectivity, not tool wrappers. For this repo, the highest-value work is not adding more REST-shaped tools. The four levers, in priority order:

1. **Adopt Tasks across the report and Workflows trios** — the helper exists, only one tool uses it.
2. **Extend elicitations across destructive write paths** — biggest safety win for the smallest investment.
3. **Ship grouped capability surfaces** — `_search_tools` covers passive search; clients still need a coherent map of 20–50-tool servers.
4. **Prepare for XAA** — every server's bespoke header strategy is the credibility gap enterprise buyers will name first.

MCP Apps and code mode are real, but each is one rung up the ladder from where today's gaps actually are.

## Sources

- [MCP Hits 97M Downloads: Model Context Protocol Guide](https://www.digitalapplied.com/blog/mcp-97-million-downloads-model-context-protocol-mainstream)
- [The 2026 MCP Roadmap — Model Context Protocol Blog](https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/)
- [Exploring the Future of MCP Transports — MCP Blog](https://blog.modelcontextprotocol.io/posts/2025-12-19-mcp-transport-future/)
- [Google Pushes for gRPC Support in Model Context Protocol — InfoQ](https://www.infoq.com/news/2026/02/google-grpc-mcp-transport/)
- [gRPC as a custom transport for MCP — Google Cloud Blog](https://cloud.google.com/blog/products/networking/grpc-as-a-native-transport-for-mcp)
- [Cross App Access extends MCP to bring enterprise-grade security — Okta](https://www.okta.com/newsroom/articles/cross-app-access-extends-mcp-to-bring-enterprise-grade-security-to-ai-agents/)
- [Cross-App Access (XAA): The enterprise way to govern AI app integrations — WorkOS](https://workos.com/blog/id-jag-cross-app-access)
- [Client Registration and Enterprise Management in the November 2025 MCP Authorization Spec — Aaron Parecki](https://aaronparecki.com/2025/11/25/1/mcp-authorization-spec-update)
- [SEP-2127: MCP Server Cards — HTTP Server Discovery via .well-known (PR)](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127)
- [SEP-1960: .well-known/mcp Discovery Endpoint for Server Metadata](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1960)
- [MCP Apps — Bringing UI Capabilities To MCP Clients](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/)
- [MCP Apps — Extending servers with interactive user interfaces](https://blog.modelcontextprotocol.io/posts/2025-11-21-mcp-apps/)
- [Code Mode: the better way to use MCP — Cloudflare](https://blog.cloudflare.com/code-mode/)
- [Code Mode: give agents an entire API in 1,000 tokens — Cloudflare](https://blog.cloudflare.com/code-mode-mcp/)
- [Cloudflare Launches Code Mode MCP Server to Optimize Token Usage for AI Agents — InfoQ](https://www.infoq.com/news/2026/04/cloudflare-code-mode-mcp-server/)
- [MCP joins the Linux Foundation — GitHub Blog](https://github.blog/open-source/maintainers/mcp-joins-the-linux-foundation-what-this-means-for-developers-building-the-next-era-of-ai-tools-and-agents/)
- [Donating the Model Context Protocol and establishing the Agentic AI Foundation — Anthropic](https://www.anthropic.com/news/donating-the-model-context-protocol-and-establishing-of-the-agentic-ai-foundation)
- [Linux Foundation Announces the Formation of the Agentic AI Foundation](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation)
- [FastMCP 2.0 vs MCP Python SDK Server — GitHub Issue](https://github.com/modelcontextprotocol/python-sdk/issues/1068)
- [Welcome to FastMCP](https://gofastmcp.com/getting-started/welcome)
