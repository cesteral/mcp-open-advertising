# Connect your AI client

Connect Claude Code or Codex to one or more Cesteral MCP servers. Both clients start a server on your machine and talk to it over stdio, so there is nothing to host and no repository to clone.

The per-server credentials and copy-paste configs are in the [client configuration reference](client-config-reference.md). It is generated from `registry.json`, so it always matches the code. This page is the walkthrough.

## Pick how to connect

| Path                           | Use it when                                                        | What you need                                 |
| ------------------------------ | ------------------------------------------------------------------ | --------------------------------------------- |
| **stdio via npx** (start here) | You want the server on your own machine, with your own credentials | Node.js 26 or later, the platform credentials |
| **Self-hosted HTTP**           | You run the server yourself and share one instance                 | A clone of this repo, a running server        |

The hosted Cesteral fleet at `mcp.cesteral.com` is not a path for outside users: it sits behind Google Cloud IAM and expects an identity token that these clients cannot send as a static header.

## 1. Choose servers and set credentials

Find the server in the [reference](client-config-reference.md). Each section has a table of the variables it needs. Export them in the shell that starts your client:

```bash
export META_ACCESS_TOKEN="..."
```

Servers with several credentials list a **preferred** group. For example, Snapchat and Amazon DSP prefer the refresh-token flow, because their access tokens expire within about an hour.

Start with the narrowest credential you have. Every server exposes write tools (create, update, delete), and a token that can only read cannot spend money. For Meta, `ads_read` is enough for reporting.

## 2. Add the server to your client

### Claude Code

Copy the server's block from the reference into `.mcp.json` in your project, or merge in the whole fleet from [`examples/clients/claude-code.mcp.json`](../../examples/clients/claude-code.mcp.json) and delete the servers you do not want:

```json
{
  "mcpServers": {
    "cesteral-meta": {
      "command": "npx",
      "args": ["-y", "@cesteral/meta-mcp"],
      "env": {
        "MCP_TRANSPORT_MODE": "stdio",
        "META_ACCESS_TOKEN": "${META_ACCESS_TOKEN}"
      }
    }
  }
}
```

`${META_ACCESS_TOKEN}` is read from your shell when Claude Code starts, so the file holds no secret and is safe to commit. Two things to know:

- A variable that is not set reaches the server as the literal text `${META_ACCESS_TOKEN}`, and Claude Code prints a warning. If a server fails to start, check that you exported its variables before launching `claude`.
- To add a server from the command line instead, use the `claude mcp add` line in the server's section. It copies the value of your variable into your Claude Code settings at that moment.

Check it: run `claude mcp list`, or type `/mcp` in a session.

### Codex

Copy the server's table from the reference into `~/.codex/config.toml`, or from [`examples/clients/codex.config.toml`](../../examples/clients/codex.config.toml) for the whole fleet:

```toml
[mcp_servers.cesteral-meta]
command = "npx"
args = ["-y", "@cesteral/meta-mcp"]
env = { MCP_TRANSPORT_MODE = "stdio" }
env_vars = ["META_ACCESS_TOKEN"]
```

`env_vars` lists the variables Codex passes through from your shell to the server. Check it with `codex mcp list`.

## 3. Try it

Ask the client something read-only, for example "List my Meta ad accounts". The first call to a server starts it and checks your credentials with the platform, so a wrong token fails here, with the platform's message.

## Self-hosted HTTP

Run a server from a clone of this repo:

```bash
pnpm install
pnpm --filter @cesteral/meta-mcp build
./scripts/dev-server.sh meta-mcp
```

The server answers on `http://localhost:<port>/mcp`. In its default auth mode each server reads its credentials from request headers, and the headers differ per server. The reference lists them, with a Claude Code block for each. Codex can connect over HTTP only to servers whose sole header is a bearer token (Meta and LinkedIn); for the rest, use stdio.

If you run a server with `MCP_AUTH_MODE=none`, a client needs no headers, but anyone who can reach the port can use your credentials. Keep that to a loopback address.

## Troubleshooting

| Symptom                                          | Cause and fix                                                                                                                                              |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server shows as failed at startup                | A required variable is unset. Run the server by hand (`npx -y @cesteral/<pkg>`) and read the first log line: it names the variables it needs.              |
| `Invalid OAuth access token` or a 401 at startup | The token is wrong or expired. Meta and Amazon access tokens last about an hour; use the refresh-token variables where the reference marks them preferred. |
| `${VAR}` shows up literally in an error          | The variable was not exported before the client started.                                                                                                   |
| HTTP: 401 with no `WWW-Authenticate`             | Header-style servers (Google, Google Ads, SA360, TTD) send no challenge. Check the header names against the reference.                                     |
| HTTP: 404 on `/dv360-mcp/mcp`                    | A self-hosted server answers on `/mcp`. The `/<package>/mcp` path in each `server.json` is a registry key, not a route.                                    |
| Two clients, same server, different results      | Each client starts its own server process with its own environment. Export the same variables in both.                                                     |

## Keeping the configs current

The reference and the two example files are generated from the `client` block of each entry in `registry.json`. When a server gains or changes a credential, edit that block and run:

```bash
pnpm run generate:client-configs
```

CI runs `pnpm run check:client-configs`, and `scripts/lib/client-configs.test.mjs` fails if the block names a variable the package does not read, or if a server started without credentials asks for a different set than the registry lists.
