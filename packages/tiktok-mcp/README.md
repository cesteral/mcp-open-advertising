# @cesteral/tiktok-mcp

TikTok Ads MCP server for campaign management and reporting via TikTok Marketing API v1.3.

## Features

- 18 MCP tools across CRUD, async reporting, targeting, bulk operations, ad previews, and validation
- 4 entity types: `campaign`, `adGroup`, `ad`, `creative`
- TikTok-specific behaviors:
  - Automatic `advertiser_id` injection in GET query params and write request bodies
  - Page-based pagination support
  - Async reporting flow (`submit -> poll -> download`)

## Auth Modes

- `tiktok-bearer` (recommended for HTTP):
  - `Authorization: Bearer <token>`
  - `X-TikTok-Advertiser-Id: <advertiser_id>`
- `jwt`
- `none`

For stdio mode, set `TIKTOK_ACCESS_TOKEN` and `TIKTOK_ADVERTISER_ID`.

## Local Development

```bash
# from repo root
TIKTOK_ACCESS_TOKEN=<token> TIKTOK_ADVERTISER_ID=<id> ./scripts/dev-server.sh tiktok-mcp
curl http://localhost:3007/health
```

## Environment Variables

- `TIKTOK_MCP_PORT` (default `3007`)
- `TIKTOK_MCP_HOST` (default `127.0.0.1` or `0.0.0.0` in containers)
- `TIKTOK_ACCESS_TOKEN`
- `TIKTOK_ADVERTISER_ID`
- `TIKTOK_API_BASE_URL` (default `https://business-api.tiktok.com`)
- `TIKTOK_API_VERSION` (default `v1.3`)
- `TIKTOK_RATE_LIMIT_PER_MINUTE` (default `100`)

## Quality Gates

```bash
pnpm --filter @cesteral/tiktok-mcp typecheck
pnpm --filter @cesteral/tiktok-mcp lint
pnpm --filter @cesteral/tiktok-mcp test
pnpm --filter @cesteral/tiktok-mcp test:coverage
```
