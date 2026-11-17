# HTTP Transport: DNS-Rebinding Protection and Message Routing

Reference for this subsystem. [CLAUDE.md](../../CLAUDE.md) keeps a short summary and links here.

## DNS-rebinding protection on `/mcp`

Added in #241 (`createDnsRebindingPolicy` in `mcp-transport-helpers.ts`), keyed on the **bind address** (`MCP_HTTP_HOST` / `<NAME>_MCP_HOST`; `getDefaultHost()` is `127.0.0.1` outside `NODE_ENV=production`, `0.0.0.0` in it). `MCP_ALLOWED_HOSTS` (comma-separated; an entry with `:port` matches exactly, one without matches any port) enforces Host on **any** bind when set. Unset on a **loopback** bind, Host must be `localhost` / `127.x.x.x` / `[::1]` and a present `Origin` must be a loopback origin (unless `MCP_ALLOWED_ORIGINS` is set, which replaces that rule). Unset on a **non-loopback** bind — every hosted Cloud Run deploy — Host is not checked, as before: a default cannot know the `run.app` or custom-domain name, and rejecting it would take the service down. Origin keeps its old rules there (`MCP_ALLOWED_ORIGINS` list; none in production rejects every Origin; `*` in `MCP_ALLOWED_ORIGINS` is a literal origin, not a wildcard). Rejections are 403 before auth runs. `/health` and the `.well-known` documents are not guarded. Binding 127.0.0.1 alone does **not** stop rebinding — the browser reaches loopback under the attacker's hostname — which is why the headers are checked

## Server→client messages

Server→client messages sent while handling a request (elicitation, `notifications/message`) must carry that request's id (SDK v2: `ctx.mcpReq.log` / `ctx.mcpReq.notify` are request-scoped; `ctx.mcpReq.elicitInput` is not and needs `{ relatedRequestId: ctx.mcpReq.id }`), so the SDK writes them on the request's POST response stream. Without it they go to the standalone GET stream, which this fleet answers with 405, and a destructive-op confirmation never reaches the client (#241, `tool-handler-factory.ts`; wire test `related-request-wire.test.ts`)
