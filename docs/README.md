# Cesteral Docs

Navigation index for the `docs/` directory. Every file under `docs/` is reachable from this page, except the individual per-server reports in `reviews/2026-09-fleet-review/`, which are indexed by that folder's own README.

> [!IMPORTANT]
> **Start here for development:** [`../CLAUDE.md`](../CLAUDE.md) covers architecture, commands, tool patterns, and the cross-cutting subsystems. The fleet overview (servers, API versions, tool counts) is in the root [`README.md`](../README.md).

---

## Quick Links

| Document                                                                         | Why you'd open it                              |
| -------------------------------------------------------------------------------- | ---------------------------------------------- |
| [`guides/quickstart.md`](guides/quickstart.md)                                   | Run a connector locally and connect an AI tool |
| [`../CLAUDE.md`](../CLAUDE.md)                                                   | Primary developer guide (repo root)            |
| [`guides/connect-clients.md`](guides/connect-clients.md)                         | Connect Claude Code or Codex to the servers    |
| [`guides/ENV-VARIABLES-GUIDE.md`](guides/ENV-VARIABLES-GUIDE.md)                 | Environment variable reference for all servers |
| [`CROSS_SERVER_CONTRACT.md`](CROSS_SERVER_CONTRACT.md)                           | Standards all management servers must follow   |
| [`guides/mcp-prompts-quick-reference.md`](guides/mcp-prompts-quick-reference.md) | Catalog of every MCP prompt, by server         |
| [`guides/platform-mapping.md`](guides/platform-mapping.md)                       | Platform-to-package mapping and rules          |

---

## Navigation by Audience

### Getting started

| Document                                                 | Description                                                           |
| -------------------------------------------------------- | --------------------------------------------------------------------- |
| [`guides/quickstart.md`](guides/quickstart.md)           | Self-host a flagship connector, by how much credential setup you have |
| [`guides/connect-clients.md`](guides/connect-clients.md) | Connect Claude Code or Codex, with per-server credentials and configs |
| [`guides/demo-transcript.md`](guides/demo-transcript.md) | What the Meta Ads quickstart looks like once running                  |
| [`guides/observability.md`](guides/observability.md)     | Audit-grade logging: tool-call and tool-failure records               |

### Developers

| Document                                                                                               | Description                                                           |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| [`repository-structure.md`](repository-structure.md)                                                   | Repo layout: packages, scripts, evals, infra, CI                      |
| [`CROSS_SERVER_CONTRACT.md`](CROSS_SERVER_CONTRACT.md)                                                 | Standards all management MCP servers must follow                      |
| [`guides/ENV-VARIABLES-GUIDE.md`](guides/ENV-VARIABLES-GUIDE.md)                                       | Environment configuration reference for all servers                   |
| [`guides/platform-mapping.md`](guides/platform-mapping.md)                                             | Platform-to-package mapping and naming rules                          |
| [`guides/adding-a-new-server.md`](guides/adding-a-new-server.md)                                       | Adding a platform: `pnpm new:server`, the template, what CI checks    |
| [`architecture/mcp-microservice-topology.md`](architecture/mcp-microservice-topology.md)               | Service topology and inter-server access patterns                     |
| [`architecture/monorepo-strategy.md`](architecture/monorepo-strategy.md)                               | Why one monorepo, and what stays independent                          |
| [`architecture/server-card-operational-envelope.md`](architecture/server-card-operational-envelope.md) | The server card's `operational` block: rate limits, retries, rollback |
| [`architecture/untrusted-content-marking.md`](architecture/untrusted-content-marking.md)               | How platform text in tool results is marked untrusted                 |
| [`architecture/platform-facts-ledger.md`](architecture/platform-facts-ledger.md)                       | The ledger of claims about external platforms, and its CI checks      |
| [`architecture/release-attestation.md`](architecture/release-attestation.md)                           | Release manifest, `definitionHash`, and verification status           |
| [`architecture/governance-runtime.md`](architecture/governance-runtime.md)                             | Decision-token enforce mode and the distributed jti store             |
| [`architecture/http-transport-security.md`](architecture/http-transport-security.md)                   | DNS-rebinding protection and server→client message routing            |
| [`architecture/tool-failure-logging.md`](architecture/tool-failure-logging.md)                         | `tool_failure` records, destinations, redaction                       |
| [`architecture/report-csv-spill.md`](architecture/report-csv-spill.md)                                 | Spilling large report CSVs to GCS                                     |
| [`architecture/evals.md`](architecture/evals.md)                                                       | Tool-search ranking and cross-server routing evals                    |
| [`../scripts/README.md`](../scripts/README.md)                                                         | Deployment and bootstrap scripts                                      |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md)                                                             | Contribution workflow                                                 |

### MCP prompts and protocol

| Document                                                                           | Description                                                                             |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [`features/mcp-prompts-implementation.md`](features/mcp-prompts-implementation.md) | MCP Prompts design doc                                                                  |
| [`guides/mcp-prompts-quick-reference.md`](guides/mcp-prompts-quick-reference.md)   | Catalog of all available MCP prompts                                                    |
| [`guides/mcp-in-2026.md`](guides/mcp-in-2026.md)                                   | Protocol notes from the MCP state-of-the-protocol talk and what they mean for this repo |

### Governance

| Document                                                                                                 | Description                                                       |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [`governance/GOVERNANCE-OVERVIEW.md`](governance/GOVERNANCE-OVERVIEW.md)                                 | Governance scope and operating model                              |
| [`governance/decision-token-rollout-and-rotation.md`](governance/decision-token-rollout-and-rotation.md) | Decision-token warn → enforce rollout and secret rotation runbook |
| [`governance/telemetry-governance.md`](governance/telemetry-governance.md)                               | Telemetry contract for tool execution spans                       |

### Deployment & operations

| Document                                                                                       | Description                                                                     |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [`guides/publishing.md`](guides/publishing.md)                                                 | Overview of all three publishing targets (Artifact Registry, npm, MCP Registry) |
| [`guides/deployment-instructions.md`](guides/deployment-instructions.md)                       | Self-hosting deployment guide                                                   |
| [`guides/first-deploy-checklist.md`](guides/first-deploy-checklist.md)                         | One-time bootstrap of a fresh GCP project                                       |
| [`guides/deployment-readiness-checklist.md`](guides/deployment-readiness-checklist.md)         | Pre-deployment checklist                                                        |
| [`guides/mcp-registry-publishing.md`](guides/mcp-registry-publishing.md)                       | MCP Registry manifest generation and publish flow                               |
| [`guides/secret-collection-sheet.md`](guides/secret-collection-sheet.md)                       | Secret Manager values reference                                                 |
| [`runbooks/2026-07-27-dev-fleet-lb-recovery.md`](runbooks/2026-07-27-dev-fleet-lb-recovery.md) | Recovering the dev fleet load balancer (resolved 2026-08-03)                    |
| [`../terraform/README.md`](../terraform/README.md)                                             | Terraform for the Cloud Run fleet                                               |

### Design history and reviews

These are point-in-time documents. They record why something was built or what a review found; they are not kept current.

| Location                                                                                                           | What is there                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| [`plans/`](plans/README.md)                                                                                        | Dated design docs and implementation plans (`YYYY-MM-DD-topic.md`)                                               |
| [`reviews/2026-09-fleet-review/`](reviews/2026-09-fleet-review/README.md)                                          | September 2026 review of every server; [`STATUS.md`](reviews/2026-09-fleet-review/STATUS.md) tracks each finding |
| [`reviews/governance-contract-producer-2026-06-17.md`](reviews/governance-contract-producer-2026-06-17.md)         | Producer-side review of the governance contract pipeline                                                         |
| [`reviews/governance-protocol-adoptability-2026-10-09.md`](reviews/governance-protocol-adoptability-2026-10-09.md) | Review of how adoptable the governance protocol is outside Cesteral                                              |

### Per-package docs

Package-specific docs live next to the package, not here. Each server with platform quirks also has a `packages/<server>/CLAUDE.md`, which Claude Code loads when working in that package; the root [`CLAUDE.md`](../CLAUDE.md) lists them.

| Package                                              | Docs                                                                                                                                                                                            |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`dv360-mcp`](../packages/dv360-mcp/docs/)           | Architecture, Claude Desktop and service-account setup, and the [OpenAPI schema extraction spec](../packages/dv360-mcp/docs/openapi-schema-extraction-spec.md) (implemented for dv360-mcp only) |
| [`ttd-mcp`](../packages/ttd-mcp/docs/)               | Architecture and vendor API reference copies                                                                                                                                                    |
| [`dbm-mcp`](../packages/dbm-mcp/docs/)               | Architecture                                                                                                                                                                                    |
| [`amazon-dsp-mcp`](../packages/amazon-dsp-mcp/docs/) | Vendor API reference copies                                                                                                                                                                     |

---

## Brand assets

[`logos/`](logos/) holds the platform SVGs used by the root README.
