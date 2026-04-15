# Cesteral MCP Servers

Self-hostable MCP connectors for major advertising platforms.

Use this repo when you want transparent platform integrations, local experimentation,
and infrastructure you control. Use **Cesteral Intelligence** when your team needs
approvals before spend commits, credential brokering, auditability, and
cross-platform execution from one governed environment.

[**Self-host a flagship connector**](docs/guides/quickstart.md) | [**Compare OSS vs Cesteral Intelligence**](https://cesteral.com/compare?utm_source=github&utm_medium=readme&utm_campaign=hero) | [**Book a workflow demo**](mailto:sales@cesteral.com?subject=Workflow%20demo%20-%20Cesteral%20MCP%20Servers)

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-2024--11--05-green)](https://modelcontextprotocol.io/)

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

- **Credential brokering** -- keep platform secrets out of local operator workflows
- **Approval workflows** -- require human review before destructive or high-spend changes
- **Audit trail** -- preserve action history, provenance, and compliance evidence
- **Cross-platform orchestration** -- coordinate governed execution across multiple connectors
- **Team operations** -- support shared workflows, tenant isolation, and operator visibility

[Compare OSS connectors vs Cesteral Intelligence](https://cesteral.com/compare?utm_source=github&utm_medium=readme&utm_campaign=why-managed)

---

## The Full Fleet

| Server | Platform | Tools | Auth |
|--------|----------|-------|------|
| [gads-mcp](packages/gads-mcp) | Google Ads REST API v23 | 15 | OAuth2 refresh token |
| [meta-mcp](packages/meta-mcp) | Meta Marketing API v25.0 | 25 | Bearer token |
| [dv360-mcp](packages/dv360-mcp) | DV360 API v4 | 25 | Google OAuth2 / service account |
| [ttd-mcp](packages/ttd-mcp) | The Trade Desk REST + GraphQL API | 55 | Partner ID + API secret |
| [linkedin-mcp](packages/linkedin-mcp) | LinkedIn Marketing API v2 | 20 | Bearer token |
| [tiktok-mcp](packages/tiktok-mcp) | TikTok Marketing API v1.3 | 23 | Bearer token + advertiser ID |
| [cm360-mcp](packages/cm360-mcp) | CM360 API v5 | 20 | Google OAuth2 |
| [sa360-mcp](packages/sa360-mcp) | SA360 Reporting API v0 + DS v2 | 15 | OAuth2 refresh token |
| [pinterest-mcp](packages/pinterest-mcp) | Pinterest Ads API v5 | 22 | Bearer token |
| [snapchat-mcp](packages/snapchat-mcp) | Snapchat Ads API v1 | 23 | Bearer token |
| [amazon-dsp-mcp](packages/amazon-dsp-mcp) | Amazon DSP API | 18 | Bearer token |
| [msads-mcp](packages/msads-mcp) | Microsoft Advertising API v13 | 24 | Access token + developer token |
| [dbm-mcp](packages/dbm-mcp) | Bid Manager API v2 | 6 | Google OAuth2 |

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
git clone https://github.com/cesteral/cesteral-mcp-servers.git
cd cesteral-mcp-servers
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
cesteral-mcp-servers/
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
