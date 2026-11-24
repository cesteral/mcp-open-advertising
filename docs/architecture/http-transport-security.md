# HTTP Transport: DNS-Rebinding Protection, Message Routing and OAuth Scopes

Reference for this subsystem. [CLAUDE.md](../../CLAUDE.md) keeps a short summary and links here.

## DNS-rebinding protection on `/mcp`

Added in #241 (`createDnsRebindingPolicy` in `mcp-transport-helpers.ts`), keyed on the **bind address** (`MCP_HTTP_HOST` / `<NAME>_MCP_HOST`; `getDefaultHost()` is `127.0.0.1` outside `NODE_ENV=production`, `0.0.0.0` in it). `MCP_ALLOWED_HOSTS` (comma-separated; an entry with `:port` matches exactly, one without matches any port) enforces Host on **any** bind when set. Unset on a **loopback** bind, Host must be `localhost` / `127.x.x.x` / `[::1]` and a present `Origin` must be a loopback origin (unless `MCP_ALLOWED_ORIGINS` is set, which replaces that rule). Unset on a **non-loopback** bind — every hosted Cloud Run deploy — Host is not checked, as before: a default cannot know the `run.app` or custom-domain name, and rejecting it would take the service down. Origin keeps its old rules there (`MCP_ALLOWED_ORIGINS` list; none in production rejects every Origin; `*` in `MCP_ALLOWED_ORIGINS` is a literal origin, not a wildcard). Rejections are 403 before auth runs. `/health` and the `.well-known` documents are not guarded. Binding 127.0.0.1 alone does **not** stop rebinding — the browser reaches loopback under the attacker's hostname — which is why the headers are checked

## Server→client messages

Server→client messages sent while handling a request (elicitation, `notifications/message`) must carry that request's id (SDK v2: `ctx.mcpReq.log` / `ctx.mcpReq.notify` are request-scoped; `ctx.mcpReq.elicitInput` is not and needs `{ relatedRequestId: ctx.mcpReq.id }`), so the SDK writes them on the request's POST response stream. Without it they go to the standalone GET stream, which this fleet answers with 405, and a destructive-op confirmation never reaches the client (#241, `tool-handler-factory.ts`; wire test `related-request-wire.test.ts`). Confirmation no longer pushes `elicitation/create` itself: it returns `input_required` and the SDK's legacy shim does the 2025-era push with the request id (#244, [confirmation-mrtr.md](confirmation-mrtr.md))

## OAuth scopes and step-up (#246)

Two scopes, published as `scopes_supported` in `/.well-known/oauth-protected-resource` and in the server card's `auth` block (`jwt` and `oauth` modes): `mcp:read` (tools annotated `readOnlyHint: true`) and `mcp:write` (every other tool; implies `mcp:read`). Defined in `packages/shared/src/auth/tool-scopes.ts`. A tool with no `readOnlyHint` counts as a write (fail closed).

**Enforcement** is in the transport factory, on `POST /mcp` `tools/call` (single or batched), after the session's MCP server exists so its tools are registered (`registerToolsFromDefinitions` records each tool's required scope). A scoped token missing the scope gets **HTTP 403** with `WWW-Authenticate: Bearer error="insufficient_scope", scope="mcp:write", resource_metadata="<PRM URL>"` (RFC 6750 §3.1, SEP-2350), not an in-band `isError` result, so a client can step up. The token is re-verified per request: scopes ride the token, not the session. `initialize`, `tools/list`, prompts and resources need no scope.

**When it applies:** to every `oauth`-mode token (fail closed: no `scope`/`scp` claim means no scopes, so every `tools/call` is a 403), and to a `jwt`-mode token that carries a non-empty `scope` claim. A token with no `scope` claim is an unrestricted pre-shared token and keeps full access (it was never narrowed, so there is nothing to step up to). Platform bearer / header modes and `none` never trigger it: they carry no scopes of ours, and `google-headers` fills `authInfo.scopes` with Google API scopes. A scoped token holding neither `mcp:` scope (e.g. only `openid`) is refused on every `tools/call`.

**Decision: A (real OAuth), implemented as the separate `oauth` mode; `jwt` stays service-to-service.** See [OAuth mode](#oauth-mode-jwks-verification-246) below. `jwt` is HS256 shared-secret tokens issued out of band (mode B in substance). Its PRM document still lists `MCP_AUTHORIZATION_SERVERS` when set, but nothing verifies a JWKS-signed token in that mode; a deployment that wants MCP OAuth clients uses `MCP_AUTH_MODE=oauth`. Without `MCP_AUTHORIZATION_SERVERS` a `jwt` server logs `oauth_prm_incomplete` at startup.

**Why `allowed_advertisers` violations stay in-band.** They are data-scoped, not capability-scoped: the token is valid and the tool is permitted, but this particular `advertiserId` argument is outside the token's allow-list (`tool-handler-factory.ts`). Re-authorizing for a broader OAuth scope cannot fix that, so a step-up challenge would invite a pointless loop; the same tool with a different argument succeeds. The failure belongs in the tool result where the agent can read it and retry with a permitted advertiser. Scope failures are about which tools a token may call at all, which a client can fix by re-authorizing, hence 403.

## OAuth mode: JWKS verification (#246)

`MCP_AUTH_MODE=oauth` (accepted by every server; `packages/shared/src/auth/oauth-jwks.ts`) verifies access tokens issued by an external authorization server. **Naming:** `jwt` = HS256 shared secret, service-to-service; `oauth` = asymmetric JWKS verification for MCP OAuth clients. The two are separate values and separate strategies.

**Boundary.** This is token verification, not an OAuth implementation. A compatible authorization server must supply the client authorization flow and token issuance (OAuth 2.1 with PKCE, RFC 8707 `resource`, RFC 9207 `iss`, ideally Client ID Metadata Documents). This repo supplies none of that; it only publishes where that server is (`authorization_servers`) and checks what it issued.

| Setting                     | Meaning                                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `MCP_OAUTH_ISSUER`          | Required `iss` (exact match). https, or http on loopback.                                                      |
| `MCP_JWKS_URI`              | Where signing keys are fetched. https, or http on loopback. Configured, never taken from a token.              |
| `MCP_RESOURCE_URI`          | Required `aud` (RFC 8707) and the PRM `resource`. Must be an absolute https URL: there is no default audience. |
| `MCP_AUTHORIZATION_SERVERS` | Optional. Published as `authorization_servers`; defaults to `MCP_OAUTH_ISSUER`.                                |

A missing or malformed value makes the server refuse to start. Verification rules: asymmetric algorithms only (RS/PS/ES 256-512, EdDSA; `none` and every HS\* are rejected, which also closes the HS256-signed-with-the-public-key confusion attack); `iss`, `aud`, `exp` required and checked, plus `sub` and `iat` as in the `jwt` mode (5 s clock tolerance); `jku`, `jwk`, `x5u`, `x5c` headers are rejected; the key set is cached (10 min), an unknown `kid` triggers at most one refetch per 30 s cooldown (that is how rotation is picked up), and an unreachable JWKS fails closed with 401. `allowed_advertisers` is honoured and rejected if malformed.

**No fallback.** A token that fails JWKS verification is never retried as HS256, and an HS256 token is never accepted in `oauth` mode (the strategy holds no shared secret and `MCP_AUTH_SECRET_KEY` is not read). A deployment runs one mode.

**Wire behaviour** is the same as `jwt`: 401 with `WWW-Authenticate: Bearer realm="mcp", resource_metadata="<PRM URL>"`, the PRM document (`resource`, `authorization_servers`, `scopes_supported`, `bearer_methods_supported`), the server card `auth` block (`oauth_protected_resource`, `scopes_supported`), and 403 `insufficient_scope` for a missing `mcp:read` / `mcp:write`. Platform-credential fallback for `oauth` follows `jwt` (env credentials for the upstream platform).

Tests: `packages/shared/tests/auth/oauth-jwks.test.ts` (stub JWKS endpoint, real keypairs: valid, wrong issuer/audience, expired, `alg: none`, key confusion, unknown kid, rotation, cooldown, no fallback) and `tests/utils/oauth-mode-transport.test.ts` (401, PRM, 403 through the transport).
