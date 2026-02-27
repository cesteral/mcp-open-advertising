# Cesteral MCP Servers — Licensing Strategy

**Date:** February 25, 2026
**Author:** Cesteral AB
**Status:** Approved — publishing with early access gate, billing in parallel

---

## Executive Summary

Cesteral will license its MCP server connectors (`cesteral-mcp-servers`) under the **Business Source License 1.1 (BSL 1.1)**, with an **Additional Use Grant** scoped to prevent competing hosted advertising-platform connector services. The governance and optimization platform (`cesteral-intelligence`) remains fully proprietary. This is a **staged rollout**: the repository stays private now, transitioning to public BSL 1.1 when two readiness triggers are met (billing proceeds in parallel). After three years per version, the BSL automatically converts to **Apache License 2.0**.

---

## Architecture Context

Cesteral's product is a two-layer system. Understanding the layers is essential to understanding the licensing decision.

```
┌──────────────────────────────────────────────────┐
│              cesteral-intelligence                │
│         (Governance & Optimization Layer)         │
│                                                  │
│   Guardrails · Approval workflows · Audit logs   │
│   Budget enforcement · Cross-platform strategy   │
│   AI orchestration · Customer-facing product      │
│                                                  │
│              LICENSE: Proprietary                 │
├──────────────────────────────────────────────────┤
│              cesteral-mcp-servers                 │
│           (Connector / Execution Layer)           │
│                                                  │
│   dbm-mcp · dv360-mcp · gads-mcp                │
│   ttd-mcp · meta-mcp                             │
│                                                  │
│   5 MCP servers wrapping platform REST APIs      │
│   Commodity connectors — no business logic       │
│                                                  │
│              LICENSE: BSL 1.1                     │
│          (converts to Apache 2.0)                │
└──────────────────────────────────────────────────┘
          ↕ MCP Protocol (tools, resources, prompts)
┌──────────────────────────────────────────────────┐
│            Advertising Platforms                  │
│   DV360 · Google Ads · The Trade Desk · Meta     │
│             Bid Manager (reporting)              │
└──────────────────────────────────────────────────┘
```

**The key insight:** The MCP servers are commodity connectors that wrap public REST APIs. They contain no proprietary business logic — the intelligence lives in `cesteral-intelligence`. Opening the connectors sacrifices nothing while gaining distribution and trust.

---

## Why BSL 1.1

### Why not MIT / Apache 2.0 (fully open source)?

MIT/Apache would allow any competitor to fork the connectors and launch a competing hosted service with zero friction. While the connectors themselves are commodity, they represent significant engineering effort (48 tools across 5 platforms, auth flows, session management, per-platform quirks). Giving that away unconditionally hands a free head start to competitors.

### Why not fully proprietary?

MCP servers live and die by discoverability. The primary acquisition channels are GitHub, MCP registries, and community recommendations. A proprietary repo is invisible on all three. Additionally, enterprises connecting ad accounts with significant spend want to audit what touches their data — source visibility builds trust.

### Why not open-core with feature gating?

Cesteral's architecture **already is open-core** — by design, not by license gymnastics. The MCP servers are the "open core" (connectors), and `cesteral-intelligence` is the "premium tier" (governance). There is no need to split features within the connector layer because the entire value tier sits in a separate repository.

### Why BSL 1.1 specifically?

BSL 1.1 is purpose-built for this exact scenario. It provides:

1. **Source visibility** — GitHub discoverability, community audit, MCP registry presence
2. **Legal protection** — prevents competitors from hosting our connectors as a competing service
3. **Time-limited restriction** — converts to Apache 2.0 after three years, building goodwill
4. **Production use permitted** — agencies and enterprises can self-host for their own accounts
5. **Proven model** — used by HashiCorp, Sentry, MariaDB, Outline, and dozens of infrastructure companies

---

## BSL 1.1 Parameters

These are the specific parameters that fill the BSL 1.1 template for Cesteral:

| Parameter | Value |
|-----------|-------|
| **Licensor** | Cesteral AB |
| **Licensed Work** | Cesteral MCP Servers (all packages in the `cesteral-mcp-servers` monorepo) |
| **Additional Use Grant** | Production use is permitted, provided such use does not include offering the Licensed Work or any derivative work to third parties as a commercial hosted service, managed service, or embedded component that provides MCP-protocol or API access to advertising platform functionality (DV360, Google Ads, Meta Ads, The Trade Desk, or Bid Manager). |
| **Change Date** | Three years from the first publication date of each version |
| **Change License** | Apache License, Version 2.0 |

### Additional Use Grant — Design Rationale

The change grant language is deliberately scoped:

- **"advertising platform functionality (DV360, Google Ads, Meta Ads, The Trade Desk, or Bid Manager)"** — Restricts only to our specific domain. Does not broadly restrict all MCP hosting.
- **Permits internal production use** — An agency running the servers for their own ad accounts is explicitly allowed.
- **Permits non-competing integration** — An analytics dashboard that happens to use our connectors as a component is fine, as long as it's not offering MCP/API access to ad platforms as its product.
- **Only blocks competing hosted services** — The sole restriction is someone taking our code and offering it as a hosted advertising-platform connector service.

### Why Apache 2.0 as Change License (not GPL)?

Apache 2.0 is more permissive than GPL and better suited for enterprise adoption post-conversion:

- No copyleft requirements — enterprises can integrate freely
- Patent grant included — provides IP safety
- Compatible with virtually all other licenses
- Standard choice for infrastructure software (Kubernetes, Terraform post-conversion, etc.)

---

## Staged Rollout

### Phase 1: Proprietary (Current)

The repository remains private. This is where we are now.

**What to do during this phase:**
- ~~Polish READMEs and documentation for external consumption~~ ✅ Done
- ~~Add `LICENSE.md` to the repo (ready to go when we flip)~~ ✅ Done
- ~~Add `LICENSE-NOTICE.md` for source file headers~~ ✅ Done
- Build the billing and subscription infrastructure in `cesteral-intelligence` *(in parallel — not a blocker for publishing)*
- ~~Create the landing page / marketing site~~ ✅ Landing page with early access form
- ~~Remove any internal-only references, hardcoded credentials, or debug artifacts~~ ✅ Audited

### Phase 2: BSL 1.1 Public (Triggered)

Make the repository public under BSL 1.1. This phase begins when **both readiness triggers** are met:

| # | Trigger | Rationale |
|---|---------|-----------|
| 1 | **Landing page with early access form is live** | Captures demand; funnels GitHub visitors to waitlist while billing is finalized |
| 2 | **READMEs are polished** | First impressions are permanent in open source |

> **Note:** Billing infrastructure proceeds in parallel. The early access form captures demand pre-billing, removing the need to wait for a live billing system or first paying customer before publishing.

**Actions on trigger:**
1. Make `cesteral-mcp-servers` repository public
2. Submit to MCP registries (Smithery, mcp.so, Glama)
3. Add source file headers referencing `LICENSE-NOTICE.md`
4. Publish announcement (blog post, social, relevant communities)

### Phase 3: Apache 2.0 Conversion (Automatic)

Three years after each version's publication, that version automatically converts to Apache 2.0. No action required — this is built into the BSL 1.1 mechanism.

**Strategic value:** The conversion date creates urgency for competitors ("we can't just wait it out — three years is too long") while building community goodwill ("Cesteral is committed to open source long-term").

---

## Preparation Checklist

Actions to complete **now**, while still in Phase 1:

- [x] Draft licensing strategy document (this document)
- [x] Create `LICENSE.md` with filled BSL 1.1 parameters
- [x] Create `LICENSE-NOTICE.md` for source file headers
- [x] Update business model analysis with Cesteral-specific context
- [x] Audit repo for hardcoded credentials, internal URLs, debug artifacts
- [x] Polish package READMEs for external audience
- [x] Add CONTRIBUTING.md with CLA requirements
- [ ] Build billing infrastructure in `cesteral-intelligence` *(in parallel — not a blocker)*
- [x] Create landing page with early access form
- [x] Register on MCP registries (draft listings ready)
- [ ] Prepare announcement content (blog post, social templates)

---

## Risk Matrix

### Risks of Waiting Too Long (Staying Proprietary)

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **MCP ecosystem land grab** — competitors claim registry presence first | High | High | Monitor registry listings monthly; have draft listings ready |
| **Lost community trust** — "why is this closed?" suspicion from enterprises | Medium | Medium | BSL conversion addresses this; have timeline communicated |
| **No inbound contributions** — miss bug reports and PRs from community | Low | High | Accept this cost during Phase 1; prioritize internal quality |
| **Invisibility** — zero GitHub discovery for the connector layer | High | Certain | This is the cost of Phase 1; triggers ensure we move to Phase 2 |

### Risks of Going Too Early (BSL Before Readiness)

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **No conversion funnel** — GitHub stars with no revenue path | Medium | Mitigated | Early access form captures demand pre-billing; waitlist converts to paying customers once billing is live |
| **Premature exposure** — unpolished docs create negative first impression | Medium | High (if rushed) | Trigger 2 prevents this |
| **Competitor intelligence** — competitors read architecture before we have customers | Low | Medium | MCP servers are commodity; architecture is not the moat |
| **Support burden** — issues/PRs from community without resources to handle | Medium | Medium | Start with "issues only, no PRs" policy; add CONTRIBUTING.md later |

### Risks Regardless of Timing

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Clean-room reimplementation** — competitor builds equivalent connectors from scratch | Medium | High | No license prevents this; compete on governance layer and execution speed |
| **Platform API changes** — Google/Meta/TTD break APIs, requiring maintenance | High | Certain (ongoing) | This affects everyone equally; fast response time is competitive advantage |
| **BSL enforcement** — someone violates the license in another jurisdiction | Low | Low | BSL is well-established; precedent from MariaDB, HashiCorp ecosystem |

---

## Competitive Positioning

### vs. Pipeboard (meta-ads-mcp)

Pipeboard's MCP server **is** their product — they sell hosted access to Meta Ads MCP tools. Their BSL protects their core revenue.

Cesteral's MCP servers are **connectors feeding a governance layer** — we sell the intelligence, not the connectors. Our BSL protects against free-riding on our engineering while we give away the commodity part to drive adoption of the premium tier.

| Dimension | Pipeboard | Cesteral |
|-----------|-----------|---------|
| What's BSL-licensed | The product itself | The connector layer |
| Revenue source | Hosted MCP access | Governance platform |
| Why BSL works | Prevents hosting clones | Drives adoption to premium tier |
| Platform coverage | Meta only | DV360, Google Ads, Meta, TTD, Bid Manager |
| Architecture | Single server = product | 5 servers = connectors → governance = product |

### vs. Hypothetical Competitors (Syntes, Fluency, etc.)

Most ad-tech competitors building MCP servers will face the same architectural decision. Cesteral's advantage is that our two-layer architecture makes BSL the obvious choice — the value is clearly in the governance layer, not the connectors. Competitors where the MCP server IS the product have a harder licensing decision.

### vs. Platform-Native Solutions

Google, Meta, and TTD may eventually offer their own MCP servers. Cesteral's cross-platform governance is the defense — no single platform will build connectors to competing platforms. Having our connectors open (BSL) strengthens the argument: "use our universal connectors, governed by our platform."

---

## Legal Notes

- **Entity:** Cesteral AB (Swedish aktiebolag)
- **BSL 1.1 trademark:** Owned by MariaDB plc. Usage in license text is per the BSL 1.1 covenant.
- **Apache 2.0:** Administered by the Apache Software Foundation. No trademark issues with using as change license.
- **CLA:** A Contributor License Agreement should be established before accepting external contributions in Phase 2. Standard individual + corporate CLA recommended.
- **Review:** This strategy should be reviewed by legal counsel before Phase 2 execution. The license text in `LICENSE.md` is based on the standard BSL 1.1 template and should be validated.

---

## References

- [BSL 1.1 Template](https://mariadb.com/bsl11/) — MariaDB plc
- [BSL Adopter FAQ](https://mariadb.com/bsl-faq-adopting/) — MariaDB plc
- [Cesteral Business Model Analysis](./mcp-server-business-model-analysis.md) — Pipeboard case study and licensing options
- [LICENSE.md](../../LICENSE.md) — Ready-to-use BSL 1.1 license for this repository
