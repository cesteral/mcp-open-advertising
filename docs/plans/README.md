# Plans

Dated design docs and implementation plans, named `YYYY-MM-DD-topic.md`. They record why something was built and how it was meant to be built. They are history, not reference: for how the code works now, read the code and [CLAUDE.md](../../CLAUDE.md).

Each file opens with a `Status` line. Statuses were checked against the code on 2026-10-12. Files stay at their original paths because code, `verification.json` ledgers and review reports cite them.

When you add a plan, put a `Status` line under the title and add it here. When it ships, update both.

## Active

| Doc                                                                                | What                                                                                                   |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [2026-10-09-hash-alg-selector-handoff.md](2026-10-09-hash-alg-selector-handoff.md) | `hashAlg` selector: slice 1 shipped; slice 2 waits on governance-side work                             |
| [2026-11-25-skills-over-mcp-prototype.md](2026-11-25-skills-over-mcp-prototype.md) | Skills over MCP (SEP-2640) prototype on meta-mcp, off by default; keep prompts and skills side by side |

## Partly implemented

| Doc                                                                                      | What                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [2026-04-28-mcp-tasks-primitive-adoption.md](2026-04-28-mcp-tasks-primitive-adoption.md) | Adopting the MCP Tasks primitive (SEP-1686): shipped for `dbm_run_custom_query_async` and the shared helper, both removed in the SDK v2 move (#242); superseded by #245 |

## Implemented

| Area                | Docs                                                                                                                                                                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reporting           | [design](2026-04-16-reporting-consistency-design.md), [plan](2026-04-16-reporting-consistency.md)                                                                                                                                                                    |
| Sessions            | [stateless session rebuild](2026-04-22-stateless-session-rebuild.md)                                                                                                                                                                                                 |
| Tool discovery      | [progressive discovery and tool search](2026-05-03-progressive-discovery-and-tool-search.md)                                                                                                                                                                         |
| TTD                 | [GraphQL report schedules](2026-04-01-ttd-graphql-report-schedule-tools.md), [live-test fixes](2026-04-01-ttd-mcp-live-test-findings-and-fixes.md), [report type discovery](2026-04-07-ttd-report-type-discovery-tools.md)                                           |
| Amazon DSP          | [v1 commitments design](2026-05-28-amazon-dsp-v1-commitments-design.md) and [plan](2026-05-28-amazon-dsp-v1-commitments.md); [commitment testkit design](2026-05-28-amazon-dsp-commitment-testkit-design.md) and [plan](2026-05-28-amazon-dsp-commitment-testkit.md) |
| Release attestation | [signed-manifest design](2026-05-20-signed-manifest-upstream-design.md) and [plan](2026-05-20-signed-manifest-upstream-plan.md); [pnpm provenance follow-up](2026-06-10-pnpm-provenance-followup.md)                                                                 |
| Governance          | [decision-token design](2026-06-01-connector-governance-decision-token-design.md) and [plan](2026-06-01-connector-governance-decision-token.md); [governed-write round 4](2026-05-21-governed-write-round4-rollout-plan.md)                                          |
| Infrastructure      | [dev fleet first deploy design](2026-06-11-dev-fleet-first-deploy-design.md) and [plan](2026-06-11-dev-fleet-first-deploy.md); [Terraform drift check](2026-08-03-terraform-drift-check-design.md)                                                                   |

## Point-in-time reports

| Doc                                                                                        | What                                                         |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| [2026-03-15-production-readiness-audit.md](2026-03-15-production-readiness-audit.md)       | Production readiness audit of all servers                    |
| [2026-05-15-amazon-dsp-live-test-findings.md](2026-05-15-amazon-dsp-live-test-findings.md) | Live run of amazon-dsp-mcp, before the Unified API migration |
| [2026-06-11-dev-fleet-deploy-results.md](2026-06-11-dev-fleet-deploy-results.md)           | Outcome of the first dev fleet deploy                        |
