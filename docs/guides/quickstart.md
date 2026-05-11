# Quickstart: Self-Host a Flagship Connector

Get a flagship MCP server running locally and connected to your AI tool.

Use this guide when you want direct platform access and infrastructure you
control. If you already know the workflow needs approvals, credential brokering,
auditability, or cross-platform coordination, skip to **Cesteral Intelligence**
instead of self-hosting first.

## Pick a path by credential time-cost

Choose based on how much credential setup you can do in this session. The
build, configure, and run steps are the same in every path -- only the
credential acquisition is different.

| Path                       | Credential time                                                | When to pick it                                                  |
| -------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Meta Ads** _(recommended)_ | ~2 min _if_ you have Graph API Explorer access + ad-account permissions | Fastest evaluation. Token from Graph API Explorer.               |
| **DV360**                  | ~15 min                                                        | You already have a GCP project and can create a service account. |
| **Google Ads**             | Hours to days                                                  | You've already been approved for a Google Ads developer token.   |

If you don't have any of these credentials yet and just want to see the server
work, jump to [No-credential evaluation](#no-credential-evaluation).

## Prerequisites

- Node.js 20+
- pnpm 8+ -- `npm install -g pnpm`
- An ad platform account with API access for one of the paths above

---

## Path A: Meta Ads (recommended)

### 1. Get a Meta Marketing API token (~2 min)

1. Open [Graph API Explorer](https://developers.facebook.com/tools/explorer/).
2. Pick your app and click **Generate Access Token**.
3. Grant **only `ads_read`** for the read-only evaluation prompts in step 6.
   Add `ads_management` and `business_management` later only if you want to
   try write workflows (campaign creation, edits, bulk updates).
4. Copy the token. It expires in ~1 hour by default -- for longer-lived
   evaluation, exchange it for a long-lived token via the
   [Access Token Tool](https://developers.facebook.com/tools/accesstoken/).

If your Meta app does not yet have ads permissions or your user does not have
access to a usable ad account, the token will fail at first call. In that case,
fall back to [No-credential evaluation](#no-credential-evaluation).

### 2. Clone, install, build

```bash
git clone https://github.com/cesteral/cesteral-mcp-servers.git
cd cesteral-mcp-servers
pnpm install
pnpm --filter @cesteral/meta-mcp build
```

### 3. Configure

```bash
cp .env.example .env
```

Set this in `.env`:

| Variable             | Description                       |
| -------------------- | --------------------------------- |
| `META_ACCESS_TOKEN`  | The token from Graph API Explorer |

All packages share one root `.env` file -- no per-package config needed.

### 4. Start the server

```bash
pnpm --filter @cesteral/meta-mcp dev:http
```

Server starts on `http://localhost:3005`.

### 5. Connect to Claude Desktop

Add to your Claude Desktop MCP config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "meta-ads": {
      "url": "http://localhost:3005/mcp"
    }
  }
}
```

### 6. Try it

Ask Claude:

- "List my Meta ad accounts."
- "Show me campaign insights for the last 7 days."

---

## Path B: DV360 (~15 min credential setup)

### 1. Create a GCP service account with DV360 access

1. In your GCP project, create a service account.
2. Grant it the DV360 user role on your DV360 partner/advertiser.
3. Download a JSON key.

[DV360 service account setup details](../../packages/dv360-mcp/README.md).

### 2. Clone, install, build

```bash
git clone https://github.com/cesteral/cesteral-mcp-servers.git
cd cesteral-mcp-servers
pnpm install
pnpm --filter @cesteral/dv360-mcp build
```

### 3. Configure

```bash
cp .env.example .env
```

Set this in `.env`:

| Variable                     | Description                                       |
| ---------------------------- | ------------------------------------------------- |
| `DV360_SERVICE_ACCOUNT_JSON` | Contents of the service account JSON key file.    |

### 4. Start and connect

```bash
pnpm --filter @cesteral/dv360-mcp dev:http   # http://localhost:3002
```

Use the same Claude Desktop config pattern as Path A, with port `3002` and a
name like `dv360`.

---

## Path C: Google Ads (hours to days for credentials)

Pick this only if you already have a Google Ads developer token. New developer
tokens require manual Google approval and can take days. The remaining
credentials (OAuth2 client + refresh token) take another 15-30 min once you
have the developer token.

### 1. Collect credentials

See the [secret collection sheet](secret-collection-sheet.md) for where each
value comes from. You need:

| Variable                 | Description                              |
| ------------------------ | ---------------------------------------- |
| `GADS_DEVELOPER_TOKEN`   | Google Ads developer token               |
| `GADS_CLIENT_ID`         | OAuth2 client ID                         |
| `GADS_CLIENT_SECRET`     | OAuth2 client secret                     |
| `GADS_REFRESH_TOKEN`     | OAuth2 refresh token                     |
| `GADS_LOGIN_CUSTOMER_ID` | Manager account ID (optional, no dashes) |

### 2. Clone, install, build

```bash
git clone https://github.com/cesteral/cesteral-mcp-servers.git
cd cesteral-mcp-servers
pnpm install
pnpm --filter @cesteral/gads-mcp build
```

### 3. Configure and run

```bash
cp .env.example .env
# fill in the five GADS_* variables
pnpm --filter @cesteral/gads-mcp dev:http   # http://localhost:3004
```

Use the same Claude Desktop config pattern as Path A, with port `3004` and a
name like `google-ads`.

---

## No-credential evaluation

You can verify the server boots, exposes its tool list, and speaks MCP without
any platform credentials. This proves protocol conformance, not that the
connector returns real data -- platform tool calls will still fail at runtime
without credentials.

```bash
git clone https://github.com/cesteral/cesteral-mcp-servers.git
cd cesteral-mcp-servers
pnpm install
pnpm --filter @cesteral/meta-mcp build
MCP_AUTH_MODE=none pnpm --filter @cesteral/meta-mcp dev:http
```

Then:

```bash
# Health check
curl http://localhost:3005/health

# List the 27 Meta MCP tools
curl -X POST http://localhost:3005/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'

# Discovery metadata (SEP-2127 server card)
curl http://localhost:3005/.well-known/mcp/server-card.json
```

For a richer no-credential demo with canned but realistic platform responses,
follow Path A with a real Meta token from Graph API Explorer -- it is the
fastest path to seeing real tool calls succeed.

---

## Verify any running server

```bash
# Health check
curl http://localhost:<port>/health

# List available MCP tools
curl -X POST http://localhost:<port>/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'
```

Ports: Meta `3005`, DV360 `3002`, Google Ads `3004`.

---

## Need Governed Team Execution Instead?

[Compare OSS connectors vs Cesteral Intelligence](https://cesteral.com/compare?utm_source=github&utm_medium=quickstart&utm_campaign=skip-setup) -- see when self-hosting is enough and when a governed control plane is the better fit.

[Book a workflow demo](mailto:sales@cesteral.com?subject=Workflow%20demo%20-%20Cesteral%20MCP%20Servers) if you want to walk through a real ad-platform workflow with your own team context.

## Next steps

- [Full deployment guide](deployment-instructions.md) for production self-hosting
- [Environment variables reference](ENV-VARIABLES-GUIDE.md) for all configuration options
- [Compare OSS connectors vs Cesteral Intelligence](https://cesteral.com/compare?utm_source=github&utm_medium=quickstart&utm_campaign=next-steps)
