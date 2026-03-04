# @cesteral/linkedin-mcp

LinkedIn Ads MCP server for campaign management, analytics, and optimization via LinkedIn Marketing API v2.

## Features

- 18 MCP tools across CRUD, analytics, targeting, bulk operations, ad previews, and validation
- 5 entity types: `adAccount`, `campaignGroup`, `campaign`, `creative`, `conversionRule`
- LinkedIn-specific behaviors:
  - URN entity identifiers (for example `urn:li:sponsoredCampaign:123`)
  - `LinkedIn-Version` header support (default `202409`)
  - Rest.li partial updates via `X-Restli-Method: PARTIAL_UPDATE`

## Auth Modes

- `linkedin-bearer` (recommended for HTTP): pass `Authorization: Bearer <token>`
- `jwt`
- `none`

For stdio mode, set `LINKEDIN_ACCESS_TOKEN`.

## Local Development

```bash
# from repo root
LINKEDIN_ACCESS_TOKEN=<token> ./scripts/dev-server.sh linkedin-mcp
curl http://localhost:3006/health
```

## Environment Variables

- `LINKEDIN_MCP_PORT` (default `3006`)
- `LINKEDIN_MCP_HOST` (default `127.0.0.1` or `0.0.0.0` in containers)
- `LINKEDIN_ACCESS_TOKEN`
- `LINKEDIN_API_BASE_URL` (default `https://api.linkedin.com`)
- `LINKEDIN_API_VERSION` (default `202409`)
- `LINKEDIN_RATE_LIMIT_PER_MINUTE` (default `100`)

## Quality Gates

```bash
pnpm --filter @cesteral/linkedin-mcp typecheck
pnpm --filter @cesteral/linkedin-mcp lint
pnpm --filter @cesteral/linkedin-mcp test
pnpm --filter @cesteral/linkedin-mcp test:coverage
```
