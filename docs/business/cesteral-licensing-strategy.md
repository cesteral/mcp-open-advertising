# Cesteral MCP Servers — Licensing Strategy

**Date:** March 9, 2026
**Author:** Cesteral AB
**Status:** Revised recommendation

---

## Executive Summary

Cesteral should publish `cesteral-mcp-servers` as **open source under Apache License 2.0**. `cesteral-intelligence` remains proprietary.

This is the cleanest fit for Cesteral's actual architecture and go-to-market model:

- The MCP servers are the **distribution layer** for trust, discoverability, and ecosystem adoption
- The proprietary moat lives in **governance, orchestration, optimization, hosted operations, and enterprise service**
- Self-hosting should remain available as a **trust and lead-generation channel**, not a licensing upsell

This recommendation replaces the prior BSL-first strategy. BSL remains a fallback if competitive cloning becomes a materially larger risk than adoption friction, but it is not the best default for the current stage.

---

## Architecture Context

Cesteral's product is a two-layer system:

```
┌──────────────────────────────────────────────────┐
│              cesteral-intelligence                │
│         Governance & Optimization Layer           │
│                                                  │
│   Guardrails · Approval workflows · Audit logs   │
│   Budget enforcement · Cross-platform strategy   │
│   AI orchestration · Customer-facing product      │
│                                                  │
│              LICENSE: Proprietary                 │
├──────────────────────────────────────────────────┤
│              cesteral-mcp-servers                 │
│           Connector / Execution Layer             │
│                                                  │
│   dbm-mcp · dv360-mcp · gads-mcp                │
│   ttd-mcp · meta-mcp · linkedin-mcp             │
│   tiktok-mcp                                     │
│                                                  │
│   7 MCP servers wrapping platform REST APIs      │
│   113+ tools · CRUD · bulk ops · validation      │
│   reporting · auth/session handling              │
│                                                  │
│              LICENSE: Apache 2.0                 │
└──────────────────────────────────────────────────┘
          ↕ MCP Protocol (tools, resources, prompts)
┌──────────────────────────────────────────────────┐
│            Advertising Platforms                  │
│   DV360 · Google Ads · The Trade Desk · Meta     │
│   LinkedIn · TikTok · Bid Manager                │
└──────────────────────────────────────────────────┘
```

The key decision is where to optimize:

- If Cesteral were selling the MCP servers themselves as the core product, source-available restrictions would be more defensible
- Cesteral is instead selling a higher layer: managed operations, governance, orchestration, and optimization

That makes the connector repo a distribution asset, not the main monetized asset.

---

## Decision Framework

### Option 1: Fully closed source

**Recommendation:** Reject.

Why it does not fit:

- MCP adoption depends heavily on GitHub, registries, and community references
- Buyers connecting ad accounts want to inspect the code that touches credentials and spend
- Closed source weakens trust and makes the repo invisible in the channels where MCP infrastructure is discovered
- It turns self-hosting from a growth asset into a custom-sales conversation

Closed source only makes sense if Cesteral decides ecosystem distribution is unimportant and wants to sell only direct managed access. That is not the current strategy.

### Option 2: BSL / source-available

**Recommendation:** Acceptable fallback, not the default.

What BSL gets right:

- Source visibility is better than closed source
- It deters direct hosted clones
- It preserves optional commercial licensing leverage

Why BSL is still the wrong primary choice now:

- It is not treated as true open source by many buyers, registries, and contributors
- Legal review friction increases for exactly the enterprise users Cesteral wants to attract
- Community contribution incentives are weaker
- The message gets muddled: if the real business is hosted governance and enterprise operations, Cesteral should not optimize around enforcing connector licensing
- The repo already presents self-hosting as a legitimate path; BSL introduces friction into that path without strengthening the real moat

BSL becomes more attractive only if there is evidence that near-term hosted cloning risk is materially more important than adoption and trust.

### Option 3: Apache 2.0 open source

**Recommendation:** Choose this.

Why Apache 2.0 is the best fit:

1. **Maximizes distribution**
   GitHub discovery, MCP registry inclusion, and community references work best when the license is simple and widely understood.

2. **Matches the actual moat**
   The differentiator is not raw access to platform APIs. It is managed reliability, governance, orchestration, optimization logic, compliance posture, and enterprise support.

3. **Improves trust**
   Agencies and enterprises can inspect exactly how credentials, mutations, validation, and telemetry work.

4. **Reduces procurement friction**
   Apache 2.0 is familiar, OSI-approved, and broadly acceptable to enterprise legal teams.

5. **Strengthens contribution potential**
   External fixes, platform coverage expansions, and interoperability improvements are more likely under a standard open-source license.

6. **Keeps focus on execution**
   Cesteral can compete on shipping, support, hosted experience, and cross-platform governance instead of on license enforcement.

---

## Monetization Under The Open-Source Model

Open-sourcing the connectors does not require open-sourcing the business.

Cesteral should monetize:

- **Managed hosting** for customers who do not want to deploy and operate seven MCP services
- **Credential and session brokering** that removes platform-specific auth complexity from customers
- **Governance and approval workflows** in `cesteral-intelligence`
- **Cross-platform optimization and orchestration** that coordinate multiple connectors safely
- **Enterprise operations**: SLAs, monitoring, upgrades, incident response, compliance support, and premium onboarding

This keeps the connector layer open while preserving a proprietary and service-based revenue engine above it.

---

## Rollout Recommendation

### Phase 1: Final polish while private

Before publication:

- Finalize the Apache 2.0 license and repo metadata
- Align README, contributing guide, registry copy, and package manifests
- Remove stale BSL or commercial relicensing language
- Confirm no internal-only references or sensitive material remain

### Phase 2: Public Apache 2.0 release

Trigger when:

1. The external-facing README and package docs are ready
2. The landing page clearly explains managed hosting and the proprietary governance layer

Actions:

1. Make `cesteral-mcp-servers` public under Apache 2.0
2. Submit to MCP registries
3. Publish announcement content
4. Position managed hosting and `cesteral-intelligence` as the premium offer

There is no separate BSL stage and no delayed open-source conversion stage.

---

## Risks And Tradeoffs

### Risks of Apache 2.0

| Risk                                       | Impact | Likelihood | Mitigation                                                                                  |
| ------------------------------------------ | ------ | ---------- | ------------------------------------------------------------------------------------------- |
| Competitor forks or hosted clones          | Medium | Medium     | Compete on speed, quality, support, hosted reliability, and proprietary governance features |
| Some prospects self-host instead of buying | Medium | High       | Treat self-hosting as lead-gen; convert on convenience, compliance, and governance          |
| External contribution overhead             | Low    | Medium     | Keep contribution scope clear and maintain roadmap control                                  |

### Risks of BSL instead

| Risk                                                   | Impact | Likelihood | Mitigation                   |
| ------------------------------------------------------ | ------ | ---------- | ---------------------------- |
| Lower trust from buyers who expect open infrastructure | Medium | Medium     | Avoid by choosing Apache 2.0 |
| Reduced contribution volume                            | Medium | High       | Avoid by choosing Apache 2.0 |
| Procurement drag due to non-standard license review    | Medium | Medium     | Avoid by choosing Apache 2.0 |

### Risks of staying closed

| Risk                                         | Impact | Likelihood | Mitigation                 |
| -------------------------------------------- | ------ | ---------- | -------------------------- |
| Weak registry/GitHub discoverability         | High   | Certain    | Avoid by publishing        |
| Lower enterprise trust and auditability      | High   | Medium     | Avoid by publishing source |
| More sales friction for technical evaluators | High   | High       | Avoid by publishing source |

---

## Competitive Positioning

### What remains proprietary

`cesteral-intelligence` remains closed and is where Cesteral should keep:

- approval policies
- budget governance
- audit and compliance workflows
- optimization logic and strategy models
- multi-server orchestration and recommendation systems
- customer-specific product UX and analytics

### Why open connectors still defend the business

- No ad platform will ship Cesteral's cross-platform governance layer
- Most competitors can read connector code; far fewer can operate a reliable managed service and productize decisioning on top
- Fast response to API changes, breadth across platforms, and enterprise-grade operations are durable advantages even with open code

---

## Contributor Policy

The repo should use a standard Apache-style inbound contribution model:

- No CLA should be required by default
- Contributions are accepted under the repository's Apache 2.0 license unless explicitly stated otherwise
- If Cesteral later needs a separate enterprise add-on or dual-license component, that should live outside this repository

This keeps the contribution story simple and consistent with the open-source positioning.

---

## Recommended Repo Messaging

The public message should be:

- **Open-source MCP connectors** for major advertising platforms
- **Self-hostable** for teams that want transparency and control
- **Managed hosting available** for teams that want convenience and operational support
- **Proprietary governance and optimization layer** for customers who need approvals, auditability, and cross-platform intelligence

The message should not be:

- “Open core” in a vague sense
- “Source available” if the repo is actually Apache 2.0
- “Commercial license required” for ordinary production use of this repository

---

## Legal Notes

- **Entity:** Cesteral AB (Swedish aktiebolag)
- **License:** Apache License 2.0
- **Review:** Legal counsel should still review public release materials, trademark usage, and managed-service terms
- **Trademarks:** Platform names and logos remain subject to their respective trademark policies

---

## References

- [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- [Open Source Initiative: Apache-2.0](https://opensource.org/license/apache-2-0)
- [LICENSE.md](../../LICENSE.md)
