# Cesteral MCP Servers

Self-hostable MCP connectors for major advertising platforms.

Use this repo when you want transparent platform integrations, local experimentation,
and infrastructure you control. Use **Cesteral Intelligence** when your team needs
approvals before spend commits, credential brokering, auditability, and
cross-platform execution from one governed environment.

[**Try Meta Ads MCP locally (~10 min)**](docs/guides/quickstart.md#path-a-meta-ads-recommended) | [**Compare OSS vs Cesteral Intelligence**](https://cesteral.com/compare?utm_source=github&utm_medium=readme&utm_campaign=hero) | [**Book a workflow demo**](mailto:sales@cesteral.com?subject=Workflow%20demo%20-%20Cesteral%20MCP%20Servers)

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-2025--11--25-green)](https://modelcontextprotocol.io/)

<p align="center">
  <img src="docs/logos/dv360.svg" width="32" height="32" alt="DV360" title="DV360">&nbsp;&nbsp;
  <img src="docs/logos/google-ad-manager.svg" width="32" height="32" alt="Google Ads" title="Google Ads">&nbsp;&nbsp;
  <img src="docs/logos/thetradedesk.svg" width="32" height="32" alt="The Trade Desk" title="The Trade Desk">&nbsp;&nbsp;
  <img src="docs/logos/meta.svg" width="32" height="32" alt="Meta" title="Meta Ads">&nbsp;&nbsp;
  <img src="docs/logos/linkedin.svg" width="32" height="32" alt="LinkedIn" title="LinkedIn Ads">&nbsp;&nbsp;
  <img src="docs/logos/tiktok.svg" width="32" height="32" alt="TikTok" title="TikTok Ads">&nbsp;&nbsp;
  <img src="docs/logos/campaign-manager.svg" width="32" height="32" alt="CM360" title="Campaign Manager 360">&nbsp;&nbsp;
  <img src="docs/logos/search-ads-360.svg" width="32" height="32" alt="SA360" title="Search Ads 360">&nbsp;&nbsp;
  <img src="docs/logos/pinterest.svg" width="32" height="32" alt="Pinterest" title="Pinterest Ads">&nbsp;&nbsp;
  <img src="docs/logos/snapchat.svg" width="32" height="32" alt="Snapchat" title="Snapchat Ads">&nbsp;&nbsp;
  <img src="docs/logos/amazon.svg" width="32" height="32" alt="Amazon DSP" title="Amazon DSP">&nbsp;&nbsp;
  <img src="docs/logos/microsoft-bing.svg" width="32" height="32" alt="Microsoft Ads" title="Microsoft Ads (Bing)">
</p>

---

## Start With One Workflow

This repo should be read as an **open connector layer**, not as the full product.

- **Primary launch pair**: Google Ads + Meta Ads
- **Primary wedge**: AI-managed optimization with human approval
- **Secondary proof of depth**: DV360

If you just need direct platform access, self-host a connector. If the workflow
needs approvals, credential control, audit trails, or cross-platform coordination,
that is the handoff point to **Cesteral Intelligence**.

## Choose Your Path

- **Use OSS connectors** when you want transparency, self-hosting, and direct
  control of credentials and infrastructure.
- **Use Cesteral Intelligence** when you need governed writes, team approvals,
  credential brokering, auditability, and multi-platform execution.

---

## Flagship Connectors

### <img src="docs/logos/google-ad-manager.svg" width="20" height="20" alt="Google Ads"> Google Ads MCP

Campaign writes, GAQL reporting, bid adjustments, previews, and validation via
Google Ads REST API v23.

[Package docs](packages/gads-mcp) | [Use with Cesteral Intelligence](https://cesteral.com/integrations/google-ads?utm_source=github&utm_medium=readme&utm_campaign=gads-mcp)

### <img src="docs/logos/meta.svg" width="20" height="20" alt="Meta"> Meta Ads MCP

Campaign writes, insights, targeting discovery, delivery estimates, previews, and
bulk operations via Meta Marketing API v25.0.

[Package docs](packages/meta-mcp) | [Use with Cesteral Intelligence](https://cesteral.com/integrations/meta-ads?utm_source=github&utm_medium=readme&utm_campaign=meta-mcp)

### <img src="docs/logos/dv360.svg" width="20" height="20" alt="DV360"> DV360 MCP

Campaign writes, targeting, custom bidding, previews, uploads, and schema-driven
validation via DV360 API v4.

[Package docs](packages/dv360-mcp) | [Use with Cesteral Intelligence](https://cesteral.com/integrations/dv360?utm_source=github&utm_medium=readme&utm_campaign=dv360-mcp)

---

## When You Need Cesteral Intelligence

The OSS connectors give you per-server tool execution + audit logs. Cesteral
Intelligence layers governance and orchestration on top:

- **Credential brokering** -- keep platform secrets out of local operator workflows
- **Approval workflows** -- require human review before destructive or high-spend changes
- **Aggregated audit** -- unified, cross-server activity feed with provenance, tied to operator identity
- **Cross-platform orchestration** -- coordinate governed execution across multiple connectors
- **Team operations** -- shared workflows, tenant isolation, and operator visibility

[Compare OSS connectors vs Cesteral Intelligence](https://cesteral.com/compare?utm_source=github&utm_medium=readme&utm_campaign=why-managed)

---

## The Full Fleet

| Server                                    | Platform                          | Tools | Auth                            |
| ----------------------------------------- | --------------------------------- | ----- | ------------------------------- |
| [gads-mcp](packages/gads-mcp)             | Google Ads REST API v23           | 15    | OAuth2 refresh token            |
| [meta-mcp](packages/meta-mcp)             | Meta Marketing API v25.0          | 27    | Bearer token                    |
| [dv360-mcp](packages/dv360-mcp)           | DV360 API v4                      | 26    | Google OAuth2 / service account |
| [ttd-mcp](packages/ttd-mcp)               | The Trade Desk REST + GraphQL API | 43    | User token (TTD-Auth header)    |
| [linkedin-mcp](packages/linkedin-mcp)     | LinkedIn Marketing API v2         | 21    | Bearer token                    |
| [tiktok-mcp](packages/tiktok-mcp)         | TikTok Marketing API v1.3         | 24    | Bearer token + advertiser ID    |
| [cm360-mcp](packages/cm360-mcp)           | CM360 API v5                      | 21    | Google OAuth2                   |
| [sa360-mcp](packages/sa360-mcp)           | SA360 Reporting API v0 + DS v2    | 16    | OAuth2 refresh token            |
| [pinterest-mcp](packages/pinterest-mcp)   | Pinterest Ads API v5              | 23    | Bearer token                    |
| [snapchat-mcp](packages/snapchat-mcp)     | Snapchat Ads API v1               | 23    | Bearer token                    |
| [amazon-dsp-mcp](packages/amazon-dsp-mcp) | Amazon DSP API                    | 26    | Bearer token                    |
| [msads-mcp](packages/msads-mcp)           | Microsoft Advertising API v13     | 25    | Access token + developer token  |
| [dbm-mcp](packages/dbm-mcp)               | Bid Manager API v2                | 6     | Google OAuth2                   |

Thirteen servers, 280+ tools. Tool counts are the live registered total per
server, including the `*_search_tools` discovery tool where present.

### What Every Server Ships

These connectors have grown past "thin REST wrappers." Beyond raw tool calls,
every server in the fleet exposes the full surface of the modern MCP spec
(protocol revisions `2025-03-26` through `2025-11-25`):

- **MCP Prompts** — on-demand, multi-step workflow guidance (campaign launch,
  reporting, troubleshooting) so agents don't have to rediscover each
  platform's sequencing. Present on all 13 servers.
- **MCP Resources** — structured, addressable context (schemas, field catalogs,
  examples, enums) fetched on demand instead of bloating every tool schema.
  Present on all 13 servers. DV360 uses these to keep its >1 MB discriminated
  unions off the wire (`entity-schema://`, `entity-fields://`, `entity-examples://`).
- **Tool discovery** — a `<platform>_search_tools` tool that lets an agent
  search the server's own catalog by intent instead of paging the full list.
  On 11 servers (all except the small `gads-mcp` and `sa360-mcp` / reporting-only
  `dbm-mcp`).
- **Server discovery cards** — SEP-2127 metadata at
  `/.well-known/mcp/server-card.json` (name, version, transports, auth modes,
  capabilities) on every server, in every auth mode.
- **OAuth resource discovery** — in `jwt` auth mode, the RFC 9728 endpoint at
  `/.well-known/oauth-protected-resource`.
- **Report CSV spill** — large report bodies spill to GCS behind a signed URL
  so responses stay bounded. On the six reporting-heavy servers: `ttd-mcp`,
  `tiktok-mcp`, `snapchat-mcp`, `amazon-dsp-mcp`, `pinterest-mcp`, `msads-mcp`.

| Server         | Discovery | Prompts | Resources | CSV spill |
| -------------- | :-------: | :-----: | :-------: | :-------: |
| gads-mcp       |           |   ✅    |    ✅     |           |
| meta-mcp       |    ✅     |   ✅    |    ✅     |           |
| dv360-mcp      |    ✅     |   ✅    |    ✅     |           |
| ttd-mcp        |    ✅     |   ✅    |    ✅     |    ✅     |
| linkedin-mcp   |    ✅     |   ✅    |    ✅     |           |
| tiktok-mcp     |    ✅     |   ✅    |    ✅     |    ✅     |
| cm360-mcp      |    ✅     |   ✅    |    ✅     |           |
| sa360-mcp      |           |   ✅    |    ✅     |           |
| pinterest-mcp  |    ✅     |   ✅    |    ✅     |    ✅     |
| snapchat-mcp   |    ✅     |   ✅    |    ✅     |    ✅     |
| amazon-dsp-mcp |    ✅     |   ✅    |    ✅     |    ✅     |
| msads-mcp      |    ✅     |   ✅    |    ✅     |    ✅     |
| dbm-mcp        |           |   ✅    |    ✅     |           |

---

## Built for Production

Self-hosting an AI agent that touches live ad spend is a trust problem first
and a capability problem second. Two things make this fleet shippable to
production without hand-rolling guardrails:

- **Audit-grade observability**. Every tool call is captured as append-only
  JSONL. Failures additionally capture the full upstream HTTP trail — every
  request, every retry, every response — with secrets redacted at the source.
  Query it directly in BigQuery for hosted deployments, or pipe stdout to
  your existing log stack for self-host.
  [Read the observability guide](docs/guides/observability.md).
- **Destructive-action elicitation gates**. 51 destructive tools across the
  twelve write-capable servers (`dbm-mcp` is reporting-only) prompt the user
  before deletes, bulk status changes, bid adjustments, budget changes,
  conversion uploads, and async Workflows batch jobs. Stdio and clients
  without elicitation support fall back to a documented non-interactive
  contract. Bulk mutations under 10 items skip the prompt unless they touch a
  sensitive field (status / budget / bid).
- **Verifiable release provenance**. Governed tools carry a canonical
  SHA-256 `definitionHash` (from `@cesteral/contract-hash`) emitted into a
  per-package `cesteral-manifest.json`. Tagged releases publish to npm with
  build provenance, signing the manifest transitively inside the tarball, so a
  downstream governance system can verify exactly which tool definitions
  shipped and promote matching tools to `attested` trust.

If your security review needs evidence — the redaction list, the field
schema, the upstream capture path, the contract hash — all of it is in this
repository.

---

## Quick Start

For a guided walkthrough, see the [10-minute quickstart](docs/guides/quickstart.md).

### Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** >= 8.0.0 -- `npm install -g pnpm`
- **Docker** (for containerization)
- **Terraform** >= 1.6.0 _(for deployment)_

### 1. Clone and install

```bash
git clone https://github.com/cesteral/mcp-open-advertising.git
cd mcp-open-advertising
pnpm install
```

### 2. Build

```bash
pnpm run build
```

### 3. Run a server locally

```bash
# Start any server using the dev script
./scripts/dev-server.sh gads-mcp    # port 3004
./scripts/dev-server.sh meta-mcp    # port 3005
./scripts/dev-server.sh dv360-mcp   # port 3002

# See each package README for required environment variables
```

### 4. Configure your AI agent

```json
{
  "mcpServers": {
    "cesteral-gads": {
      "url": "https://gads.your-domain.com/mcp",
      "apiKey": "your-gads-api-key"
    },
    "cesteral-meta": {
      "url": "https://meta.your-domain.com/mcp",
      "apiKey": "your-meta-api-key"
    }
  }
}
```

Add as many servers as you need. Each runs independently and can be deployed separately.

### 5. Deploy

```bash
cd terraform
terraform init
terraform apply -var-file=dev.tfvars
```

See the [deployment guide](docs/guides/deployment-instructions.md) for production setup.

---

## Architecture

Cesteral uses a **GCP-native architecture** with thirteen independently deployable Cloud Run MCP services. Each server exposes the MCP protocol directly via HTTPS on Cloud Run.

**Key design decisions:**

- **Single cloud provider (GCP)**: Cloud Run, BigQuery, Pub/Sub, Secret Manager -- unified monitoring, ~$150-220/month
- **Direct HTTP transport**: No edge gateway layer needed
- **Independent deployment**: Each server can be deployed and scaled separately
- **Composable**: Use one server or all thirteen -- they work independently or together

### Access Model

- **Self-hosted**: AI clients connect directly to one or more MCP servers
- **Cesteral Intelligence**: Hosted product layers tenancy, credentials, approvals, orchestration, and governance above the connector fleet

### Repository Structure

```
mcp-open-advertising/
├── packages/
│   ├── gads-mcp/          # Google Ads
│   ├── meta-mcp/          # Meta Ads
│   ├── dv360-mcp/         # DV360
│   ├── ttd-mcp/           # The Trade Desk
│   ├── linkedin-mcp/      # LinkedIn Ads
│   ├── tiktok-mcp/        # TikTok Ads
│   ├── cm360-mcp/         # Campaign Manager 360
│   ├── sa360-mcp/         # Search Ads 360
│   ├── pinterest-mcp/     # Pinterest Ads
│   ├── snapchat-mcp/      # Snapchat Ads
│   ├── amazon-dsp-mcp/    # Amazon DSP
│   ├── msads-mcp/         # Microsoft Ads
│   ├── dbm-mcp/           # Bid Manager (reporting)
│   ├── contract-hash/     # Shared library -- canonical tool-definition hash
│   └── shared/            # Shared auth, telemetry, utilities
├── terraform/             # Infrastructure as Code
├── scripts/               # Deployment and dev automation
└── docs/                  # Documentation and guides
```

---

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm run build

# Run tests
pnpm run test

# Type checking
pnpm run typecheck

# Lint
pnpm run lint
```

### Testing MCP Tools

```bash
# Use MCP Inspector
npx @modelcontextprotocol/inspector packages/gads-mcp

# Or use curl
curl -X POST http://localhost:3004/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'
```

### Technology Stack

- **Runtime**: TypeScript 5.0+, Node.js 20 LTS, Hono (HTTP + MCP transport)
- **Validation**: Zod schemas
- **Infrastructure**: GCP Cloud Run, BigQuery, Pub/Sub, Secret Manager, Terraform
- **Build**: Turborepo, pnpm workspaces, Docker

---

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make changes and write tests
4. Run tests: `pnpm run test`
5. Submit a Pull Request

See also: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | [SECURITY.md](SECURITY.md) | [ROADMAP.md](ROADMAP.md)

---

## License

[Apache License 2.0](LICENSE.md)

---

## Support

- **Website**: [cesteral.com](https://cesteral.com) -- managed hosting and commercial features
- **Documentation**: [docs/](docs/) for guides and architecture
- **GitHub Issues**: Report bugs or request features
- **Email**: support@cesteral.com
