# Stateless Serving (MCP 2026-07-28)

One `/mcp` endpoint serves two protocol eras (#243, tracker #241). The code is in the shared transport factory (`createMcpHttpTransport`), so no server package carries any of it.

## Routing

`POST /mcp` is classified with the SDK's own `isLegacyRequest(request)`:

- **Modern (2026-07-28)**: the request carries the per-request `_meta` envelope (`io.modelcontextprotocol/protocolVersion`, client info and capabilities), or names a non-2025 version in `MCP-Protocol-Version`. Served by the SDK's `createMcpHandler(factory, { legacy: "reject" })`: one `McpServer` per request, no `initialize`, no `Mcp-Session-Id`. The handler's validation ladder owns `server/discover`, `UnsupportedProtocolVersionError` (`-32022`) and `HeaderMismatch` (`-32020`) as JSON-RPC bodies with HTTP 400.
- **Legacy (2025-03-26 … 2025-11-25)**: everything else (`initialize`, claim-less POSTs, session `GET`/`DELETE`). Unchanged sessionful path.

Chosen over `legacy: "stateless"`: the 2025 path keeps its session store, credential-fingerprint binding, 404-for-unknown-session (#373), revalidation age (#374), and `DELETE /mcp` byte for byte, so no 2025 client sees any change. Legacy-stateless would drop `initialize`-time state that existing clients rely on (and answers GET/DELETE with 405).

## Who is the caller: the principal key

The modern era has no session, so the services holding an authenticated upstream client are keyed on the **credential**:

`principalSessionKey(fingerprint) = "principal-" + sha256("cesteral-principal-v1:" + fingerprint)[0..32]`

(`none` mode, no fingerprint, maps to `principal-anonymous`.) The key never crosses the wire and can never equal a legacy session id (those are exactly 64 hex chars; `isValidSessionId` rejects it). It is passed wherever a `sessionId` was passed: `createSessionForAuth`, `createMcpServer(logger, key, bucket)`, the per-server `SessionServiceStore`. So per-session service stores, `resolveSessionServices`, the auth-context resolver and the `onDelete` hooks work unchanged, with principal semantics.

Per modern request, in order (`serveModern`):

1. **Authenticate.** `getCredentialFingerprint` (cheap) or `verify`. Failure: HTTP 401 with a JSON-RPC error body and the same `WWW-Authenticate` challenge as the 2025 path. Runs before the SDK ladder, so an unauthenticated caller learns nothing, not even a version error.
2. **Ensure services for the key.** Held: `validateSessionReuse` re-applies the shared five-minute non-sliding revalidation age (#374), then touch. Not held: capacity check (503), `verify`, `createSessionForAuth`, `setAuthContext`, single-flight per key so concurrent first requests build once.
3. **Build the per-request server** and run the scope check (#246, same rule, JSON-RPC 403 body).
4. **Hand it to `modernHandler.fetch`** through an `AsyncLocalStorage` slot read by the handler's factory.

DNS-rebinding Host/Origin checks stay in the `/mcp` middleware, ahead of all of this.

## What happens to the session machinery

| Mechanism                      | Modern path                                                                                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Session store                  | Reused as a **principal store**: one entry per credential fingerprint. Same cap (503 when full).                                               |
| Idle sweep                     | Applies to principal entries (`trackSession`/`touchSession`), same timeout. A swept principal is rebuilt by its next request; nothing breaks.  |
| Fingerprint rebinding          | Cannot occur: the key is derived from the fingerprint.                                                                                         |
| 404 for unknown session (#373) | Legacy only. A modern request has no id to be unknown.                                                                                         |
| Revalidation age (#374)        | Applied to the principal entry.                                                                                                                |
| `Mcp-Session-Id` header        | Never read, never minted on the modern path.                                                                                                   |
| `DELETE /mcp`, `GET /mcp`      | Legacy / 405, unchanged.                                                                                                                       |
| Hosted deploys                 | Unchanged: `max_instances = 1` (#386), `enforce` still needs the distributed jti store. Principal entries are per instance, rebuilt on demand. |

## Cross-call state inventory

Tools that depend on state surviving between calls:

- **`*_download_report` with `storeRawCsv: true`** (ttd, amazon-dsp, msads, pinterest, snapchat, tiktok): the result is a `report-csv://{uuid}` URI whose read is authorized by the entry's owner key. On the 2025 path that is the transport's `extra.sessionId`; the modern transport has none, so `registerReportCsvResource` now takes `ownerKey` (the key the server instance was built for) as the fallback. Another principal gets "not found, not forbidden" (test: `report-csv-resource-wire.test.ts`). The id is already server-minted, but it is a bearer-ish capability with ownership held in an in-memory store: on a multi-instance deploy the read depends on the GCS mirror, and the ownership check on the principal key.
- **Spill objects** `{server}/{key}/…`: the key is now the principal key on the modern path. The idle sweep's `onDelete` hook still deletes them; the 24h GCS lifecycle rule is the real control.
- Everything else (`SessionServiceStore` services, auth context) is cache of an authenticated client, rebuildable from the credential, not cross-call state a client could observe.

No tool takes a session-scoped argument today, so no new handle had to be minted for this slice.

## Stdio

Stdio is served by `serveStdioServer` (`@cesteral/shared`, `utils/transport/stdio-server.ts`), called by `bootstrapMcpServer`: the SDK's `serveStdio` picks the era from the opening message (`server/discover` → 2026-07-28, `initialize` → 2025) and pins one instance for the connection. No server has its own stdio code. The env-credential session (`setupStdioSession`, session id `stdio`) is built once before serving; every instance the factory makes (a `server/discover` probe is discarded on fallback) resolves it from the session store. Test: `packages/shared/tests/utils/stdio-server.test.ts` (linked in-memory transport, raw JSON-RPC).

## Not done here (see the PR)

- `subscriptions/listen` over HTTP (stdio gets it from `serveStdio`, which routes it at the entry).
- Modern-path rejections made before routing (DNS-rebinding 403, body-size 413 from Hono) are still plain JSON.
- `registry.json` `protocol_version` stays `2025-11-25` (the card's `mcp_protocol_versions` now lists the modern revision too).
- Elicitation reading `ctx.mcpReq.envelope` (#244), Mcp-Method/Mcp-Name header routing (#248).
