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

### 1. Promote Tasks from experiment to shared infrastructure

The repo already has one task-based implementation: `dbm_run_custom_query_async`. It still uses SDK task imports from the SDK's `experimental` namespace, but the protocol primitive itself is Final. The next step is to define a shared task abstraction in `@cesteral/shared` and apply it first to long-running report flows:

- `*_submit_report` / `*_check_report_status` / `*_download_report`
- TTD workflow jobs and GraphQL bulk jobs
- any blocking `*_get_report` tool that currently polls inside the server

Keep the existing split tools as compatibility wrappers until client support is broad enough to rely on Tasks everywhere.

### 2. Harden Streamable HTTP for horizontal scaling

The shared HTTP transport already rebuilds session services on cache miss, which is the right direction for Cloud Run and other multi-instance deployments. The improvement path is:

- add explicit tests for session rehydration across simulated instances
- document the behavior as the default remote-server contract
- ensure auth fingerprints and audit logs remain stable after rehydration
- keep watching the transport/session SEPs before changing endpoint shape

### 3. Treat discovery metadata as product surface

The repo has generated `server.json` manifests, a canonical `registry.json`, and runtime server cards at `/.well-known/mcp/server-card.json`. These should converge:

- keep protocol versions current
- generate tool/resource/prompt counts from definitions instead of hand-maintaining them
- fail CI when registry metadata drifts from registered tools
- align the runtime server-card response with the final SEP-2127 schema when it lands

This matters because discovery and marketplaces are becoming the first interaction clients have with an MCP server.

### 4. Add progressive discovery before adding more tools

TTD alone now exposes more than 50 tools. The repo has started this through `server-capabilities://{server}/overview` resources and on-demand `tool-examples://...` resources. Before adding more platform coverage, continue moving discovery into compact capability surfaces:

- richer `server-capabilities://.../overview` resources for each server
- a shared `capability_search` or `tool_search` tool/resource when client support needs active search instead of passive resource reads
- grouped capability summaries such as reporting, campaign setup, targeting, creative upload, bulk mutations, and diagnostics
- schema/resource loading only after a capability is selected

The DV360 dynamic schema/resource pattern is a good local precedent.

### 5. Prototype one MCP App where UI is clearly better than text

Good candidates:

- reporting dashboard: filter, sort, chart, and export rows returned by report tools
- bulk-change review: show proposed entity mutations before execution
- pacing diagnostics: visualize budget, spend, remaining days, and risk level
- campaign setup wizard: collect validated inputs with platform-specific dependencies

Start with a read-only reporting/pacing UI to avoid coupling the first UI prototype to write approval semantics.

### 6. Explore code mode only for very large API surfaces

Cloudflare's Code Mode pattern is relevant, but it should be constrained. Do not replace high-value first-class tools. Consider a `search` + `execute` style pattern only for:

- uncovered endpoints
- diagnostic read paths
- APIs with too many endpoints to expose cleanly
- power-user workflows where typed composition beats dozens of narrow tools

TTD already has `ttd_rest_request`, GraphQL tools, and workflow-specific tools, so it is the natural place to evaluate this pattern.

## Bottom line

The high-level direction checks out: 2026 is about full agent connectivity, not just tool wrappers. For this repo, the highest-value work is not adding more REST-shaped tools. It is making the existing server fleet easier to discover, safer to scale, better at long-running work, and more useful to humans through Apps and workflow-level abstractions.

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
