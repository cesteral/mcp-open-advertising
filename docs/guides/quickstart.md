# Quickstart: Try a Cesteral MCP Server in 10 Minutes

Get a flagship MCP server running locally and connected to your AI tool.

## Prerequisites

- Node.js 20+
- pnpm 8+ -- `npm install -g pnpm`
- An ad platform account with API access

## Option A: Google Ads (gads-mcp)

### 1. Clone and build

```bash
git clone https://github.com/cesteral/cesteral-mcp-servers.git
cd cesteral-mcp-servers
pnpm install
pnpm --filter @cesteral/gads-mcp build
```

### 2. Configure credentials

```bash
cp .env.example .env
```

Edit `.env` with your Google Ads OAuth2 credentials. You need:

| Variable | Description |
|----------|-------------|
| `GADS_DEVELOPER_TOKEN` | Google Ads developer token |
| `GADS_CLIENT_ID` | OAuth2 client ID |
| `GADS_CLIENT_SECRET` | OAuth2 client secret |
| `GADS_REFRESH_TOKEN` | OAuth2 refresh token |
| `GADS_LOGIN_CUSTOMER_ID` | Manager account ID (optional, no dashes) |

All packages share a single root `.env` file -- no per-package config needed.

See the [secret collection sheet](secret-collection-sheet.md) for where to find each value.

### 3. Start the server

```bash
pnpm --filter @cesteral/gads-mcp dev:http
```

The server starts on `http://localhost:3004`.

### 4. Connect to Claude Desktop

Add to your Claude Desktop MCP config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "google-ads": {
      "url": "http://localhost:3004/mcp"
    }
  }
}
```

### 5. Try it

Ask Claude: "List my Google Ads accounts" or "Show me campaign performance for the last 7 days."

---

## Option B: Meta Ads (meta-mcp)

Same steps with these substitutions:

| Setting | Value |
|---------|-------|
| Filter | `@cesteral/meta-mcp` |
| Port | `3005` |
| Key credential | `META_ACCESS_TOKEN` (Meta Marketing API access token) |

[Meta server docs](../../packages/meta-mcp/README.md)

## Option C: DV360 (dv360-mcp)

Same steps with these substitutions:

| Setting | Value |
|---------|-------|
| Filter | `@cesteral/dv360-mcp` |
| Port | `3002` |
| Key credential | `DV360_SERVICE_ACCOUNT_JSON` (Google Cloud service account with DV360 API access) |

[DV360 server docs](../../packages/dv360-mcp/README.md)

---

## Verify the server is running

```bash
# Health check
curl http://localhost:3004/health

# List available MCP tools
curl -X POST http://localhost:3004/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'
```

Replace the port with `3005` (Meta) or `3002` (DV360) as needed.

---

## Skip the setup?

[Use managed hosting](https://cesteral.com?utm_source=github&utm_medium=quickstart&utm_campaign=skip-setup) -- credentials, governance, and multi-tenant access included. No infrastructure to manage.

## Next steps

- [Full deployment guide](deployment-instructions.md) for production self-hosting
- [Environment variables reference](ENV-VARIABLES-GUIDE.md) for all configuration options
- [Compare self-hosted vs managed](https://cesteral.com/compare?utm_source=github&utm_medium=quickstart&utm_campaign=next-steps)
