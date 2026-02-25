# MCP Server Business Model & Licensing Strategy Analysis

## Case Study: Pipeboard / meta-ads-mcp

**Date:** February 25, 2026
**Subject:** Source-available vs. closed-source strategy for MCP server businesses

---

## Pipeboard's Business Model Logic

Their strategy is essentially: **give away the engine, sell the fuel.**

The source code is visible, which builds trust (people can audit what touches their Meta ad accounts), drives adoption through GitHub discovery (510+ stars), and creates a funnel toward the hosted service where the real money is. The BSL 1.1 license is the critical piece — it's specifically designed for this "source-available SaaS" model. It lets anyone read, modify, and even redistribute the code, but **the one thing you cannot do is offer it as a competing hosted service**. That single restriction protects their core revenue stream.

The bet they're making is that most users (marketers, agencies) will never self-host. The friction of creating a Meta Developer App, handling OAuth token refresh, and maintaining infrastructure is enough to push 95%+ of users toward paying $30–200/month for the hosted version.

### Pipeboard Pricing Tiers

| Plan | Price | Weekly AI Tool Executions | Ad Accounts |
|------|-------|--------------------------|-------------|
| **Free** | $0/mo | 30 | 2 |
| **Pro** | $29.90/mo | 100 | 10 |
| **Premium** | $99/mo | 500 | 50 |
| **Enterprise** | $199/mo | Unlimited | 50 |

---

## Licensing Options and Trade-offs

### Option 1: BSL 1.1 (Business Source License — what Pipeboard does)

This gives you the best of both worlds *if your moat is the hosted service*. You get GitHub visibility, community contributions, and trust — while legally preventing anyone from cloning your SaaS.

**Strengths:**

- GitHub discoverability and community trust
- Legal protection against direct cloning into a competing service
- Community contributions possible
- Converts to full open source on a future date (builds goodwill)

**Weaknesses:**

- A competitor can still read your entire codebase, learn your architecture, and build their own *different* implementation from scratch
- License prevents copying your code into a competing service, but doesn't prevent someone from understanding your approach and reimplementing it
- Enforcement is on you — if someone in another jurisdiction spins up a competing service using your BSL code, you'd need to pursue legal action

### Option 2: Fully Closed / Proprietary

This maximizes protection of your implementation details. Nobody can see your code, your architecture decisions, your optimizations.

**Strengths:**

- Maximum IP protection
- Competitors must build from scratch with no reference
- No risk of license violation disputes

**Weaknesses:**

- Lose the GitHub discovery channel entirely (significant for MCP servers — people browse GitHub and MCP registries to find tools)
- Lose community trust (users connecting ad accounts with six-figure monthly spend care about what code is touching their data)
- Zero community contributions
- Harder to build developer advocacy

### Option 3: True Open Source (MIT / Apache 2.0)

Maximum adoption, zero protection. Anyone can fork it and launch a competing service tomorrow.

**Strengths:**

- Maximum adoption and community growth
- Strongest trust signal
- Attracts contributors and integrators

**Weaknesses:**

- Anyone can fork and compete directly with your hosted service
- Only works if your moat is something other than the code — brand, network effects, integrations, speed of iteration, or enterprise sales relationships

### Option 4: Open-Core / Dual License

Keep a genuinely open-source core (basic MCP server functionality under MIT/Apache) and keep premium features closed or under a commercial license. This is what companies like GitLab do.

**Strengths:**

- Community adoption of the free tier
- Premium features (team accounts, bulk operations, advanced analytics) stay protected
- Clear upgrade path from free to paid
- Best of both worlds for developer marketing

**Weaknesses:**

- Requires careful decision-making about what goes in core vs. premium
- Community may push back if too much is gated
- More complex to manage than a single license

---

## What Protection Do You Actually Have Against Copying?

| Protection | What It Covers | Limitations |
|-----------|---------------|-------------|
| **Copyright** | Your literal code — someone can't copy-paste your files | Does *not* protect ideas, architecture, or functionality. Someone can rewrite from scratch legally. |
| **BSL 1.1** | Adds a contractual layer: anyone who uses your actual code in a competing service is in violation | Only works if you detect the violation and are willing to enforce it |
| **Trade Secrets** (closed source) | Strongest practical protection — nobody can see your implementation | MCP protocol is open and platform APIs are public, so a competent developer can build a comparable server without ever seeing your code |
| **Patents** | Could theoretically protect novel technical approaches | Most MCP server functionality is too close to "obvious application of known techniques" to be patentable; enforcement is expensive |

---

## Recommendation for MCP Server Businesses

For an MCP server business specifically, **BSL 1.1 or open-core** is likely the strongest strategy, for several reasons:

1. **Discoverability matters most.** MCP servers live and die by discoverability — GitHub, MCP registries, and community recommendations are the primary acquisition channels. Closed source cuts you off from the biggest funnel.

2. **Your real moat isn't the code.** It's the hosted infrastructure, the OAuth flow, the reliability, the support, and the speed at which you ship new features. Pipeboard's code is maybe a few thousand lines of Python — any decent developer could rewrite it in a week. What they can't easily replicate is the operational wrapper.

3. **BSL provides sufficient legal protection.** It discourages lazy cloning while keeping the benefits of being visible. Most would-be competitors will build their own thing rather than risk a license violation.

4. **The real threat isn't code copying.** The scenario you should worry about isn't someone copying your code — it's a well-funded competitor building their own implementation from scratch with a better product. No license protects you from that. Your defense there is execution speed, customer relationships, and building switching costs into your product.

---

## Cesteral's Strategic Position

> **Decision:** BSL 1.1 for `cesteral-mcp-servers`, proprietary for `cesteral-intelligence`. See [Cesteral Licensing Strategy](./cesteral-licensing-strategy.md) for the full strategy document and [LICENSE.md](../../LICENSE.md) for the ready-to-use license.

### How Cesteral Differs from Pipeboard

The analysis above examines a model where **the MCP server is the product** — Pipeboard sells hosted access to their Meta Ads MCP tools. Cesteral's architecture is fundamentally different:

| | Pipeboard | Cesteral |
|--|-----------|---------|
| **What's licensed** | The product itself | The connector layer only |
| **Revenue source** | Hosted MCP tool access ($30–200/mo) | Governance platform (guardrails, approvals, cross-platform optimization) |
| **Platform coverage** | Meta only | DV360, Google Ads, Meta, TTD, Bid Manager |
| **What BSL protects** | Core revenue stream | Engineering investment in commodity connectors |
| **What drives revenue** | Making self-hosting inconvenient | Making connectors ubiquitous → governance upsell |

### Cesteral's Architecture Is Already Open-Core

The open-core model (Option 4 above) recommends splitting features between a free open-source core and premium closed features. Cesteral doesn't need to artificially split features — the architecture naturally creates this separation:

```
Open (BSL → Apache 2.0)          Proprietary
─────────────────────────         ─────────────────────────
cesteral-mcp-servers              cesteral-intelligence
• 5 MCP servers                   • Budget guardrails
• 48 tools across platforms       • Approval workflows
• Auth adapters                   • Cross-platform strategy
• Session management              • AI orchestration
• Platform API wrappers           • Audit logs & compliance
                                  • Customer-facing product
```

The MCP servers are **commodity connectors** — they wrap public REST APIs using the open MCP protocol. Any competent team could rewrite them. The governance layer is the moat: it embodies domain expertise in programmatic advertising optimization, cross-platform decision-making, and enterprise compliance workflows that take years to build.

### Why BSL (Not MIT) for the Connectors

Even though the connectors are commodity, they represent significant engineering:

1. **48 tools** across 5 platforms with consistent patterns
2. **Auth complexity** — OAuth2, service accounts, partner tokens, bearer tokens
3. **Per-platform quirks** — DV360's dynamic schemas, TTD's GraphQL, Bid Manager's async reports
4. **Session management** — per-session services, cleanup, concurrent users

Giving this away under MIT hands competitors a free 3–6 month head start. BSL preserves the engineering investment while still enabling the distribution and trust benefits of source availability. The Apache 2.0 conversion after three years ensures long-term community goodwill.

### Staged Rollout

The repository stays proprietary until four readiness triggers are met:

1. **Billing is live** — without a conversion mechanism, visibility has no revenue path
2. **Landing page exists** — GitHub visitors need a "Star → Learn → Sign up" funnel
3. **First paying customer** — validates the product before investing in distribution
4. **READMEs are polished** — first impressions are permanent in open source

See the [full licensing strategy](./cesteral-licensing-strategy.md) for the complete rollout plan, risk matrix, and competitive analysis.

---

## Summary Decision Matrix

| Factor | BSL 1.1 | Closed Source | MIT/Apache | Open-Core |
|--------|---------|--------------|------------|-----------|
| GitHub discoverability | ✅ High | ❌ None | ✅ High | ✅ High |
| Community trust | ✅ High | ⚠️ Low | ✅ Highest | ✅ High |
| Protection from cloning | ✅ Good | ✅ Best | ❌ None | ✅ Good (for premium) |
| Community contributions | ✅ Possible | ❌ None | ✅ Maximum | ✅ For core |
| Revenue protection | ✅ Strong | ✅ Strong | ❌ Weak | ✅ Strong |
| Complexity to manage | ⚠️ Low | ✅ Lowest | ✅ Lowest | ⚠️ Medium |
| **Overall for MCP SaaS** | **⭐ Recommended** | Viable | Risky | **⭐ Recommended** |
