# Pre-Deploy Security Fixes Design

**Date:** 2026-02-20
**Status:** Approved
**Scope:** Three deploy-blocking security fixes across all 4 MCP servers

## Problem

The MCP servers have three security gaps identified during the pre-deployment audit:

1. **Session fingerprint validation never called** — `validateFingerprint()` exists in `SessionServiceStore` but is never invoked during session reuse. An attacker with a session ID can hijack the session without matching credentials.
2. **No per-advertiser authorization** — All tools accept `advertiserId`/`customerId` parameters with no enforcement that the authenticated user should have access to that account.
3. **No audit logging of data access** — No structured record of which user accessed which advertiser's data through which tool.

## Root Cause

`AuthResult` (containing `authInfo`, `scopes`, `credentialFingerprint`) is available at auth time in the transport layer but is discarded before tool execution. Tools only receive `sessionId` via `sdkContext` and have no access to authentication metadata.

## Design

### Approach: Extend SessionServices with AuthContext

Store authentication metadata in the session store alongside platform services. Enforce authorization in the shared `registerToolsFromDefinitions()` factory — one enforcement point for all tools across all 4 servers.

### 1. Data Flow: SessionAuthContext

New shared type that persists auth metadata for the session lifetime:

```typescript
// packages/shared/src/auth/auth-strategy.ts
export interface SessionAuthContext {
  authInfo: AuthInfo;                    // clientId, subject, scopes, authType
  credentialFingerprint?: string;        // SHA-256 of credential identifier
  allowedAdvertisers?: string[];         // From JWT claim; undefined = unrestricted
}
```

**SessionServiceStore changes:**
- New `Map<string, SessionAuthContext>` alongside existing maps
- `setAuthContext(sessionId, ctx)` — called during session creation
- `getAuthContext(sessionId)` — called during tool execution
- Auth context cleaned up alongside services on session expiry

**Transport flow on new session:**
1. `authStrategy.verify(headers)` returns `AuthResult`
2. Create platform services as before
3. Also call `sessionServiceStore.setAuthContext(sessionId, { authInfo, credentialFingerprint, allowedAdvertisers })`
4. For JWT auth: `allowedAdvertisers` extracted from `allowed_advertisers` JWT claim
5. For header-based auth: `allowedAdvertisers` stays `undefined` (unrestricted — platform credentials scope access)

**resolveSessionServices changes:**
- Returns `{ services, authContext }` instead of just services
- Factory uses `authContext` for authorization and audit logging

### 2. Fingerprint Validation on Session Reuse

In each server's `streamable-http-transport.ts`, when a request provides `Mcp-Session-Id`:

1. Validate session exists (existing check)
2. Run `authStrategy.verify(headers)` to extract current request's fingerprint
3. Call `sessionServiceStore.validateFingerprint(sessionId, fingerprint)`
4. Return HTTP 401 if mismatch, proceed if match

Edge cases:
- **`none` auth mode:** No fingerprint generated. `validateFingerprint` returns `true` when no stored fingerprint exists.
- **stdio mode:** Uses `sessionId="stdio"` with env var credentials. No headers to re-verify. The "no fingerprint stored" fallback handles this.

Performance: Re-running `authStrategy.verify()` on reuse adds negligible overhead — header parsing and (for JWT) a symmetric signature check. No network calls.

Extract shared helper `validateSessionReuse(authStrategy, sessionServiceStore, headers, sessionId)` to avoid duplication across 4 transports.

### 3. Per-Advertiser Authorization

Enforced in `registerToolsFromDefinitions()` between input validation and `tool.logic()`.

**JWT claim shape:**

```json
{
  "sub": "user@example.com",
  "scope": "tools:read tools:write",
  "allowed_advertisers": ["adv123", "adv456", "cust789"]
}
```

`allowed_advertisers` is a flat array covering all platforms (DV360 advertiser IDs, TTD advertiser IDs, Google Ads customer IDs). The token issuer controls access. Absent claim = unrestricted (backwards-compatible).

**Authorization check flow:**

1. Resolve `authContext` from session store via `sessionId`
2. If `authContext.allowedAdvertisers` is defined:
   - Extract advertiser-like params from validated input using known keys: `advertiserId`, `customerId`, `partnerId`
   - If any present and not in allowlist: return MCP error (`isError: true`, message: "Access denied: advertiser X not in authorized scope")
   - If none present (tool doesn't take advertiser params): allow through
3. If `allowedAdvertisers` is `undefined`: skip check entirely

**Parameter extraction keys:**

```typescript
const ADVERTISER_PARAM_KEYS = ["advertiserId", "customerId", "partnerId"];
```

**Not covered (future enhancements):**
- List operations returning multiple advertisers (e.g., `gads_list_accounts`) — platform API scopes the response via credentials
- Nested advertiser references in `data` payloads — platform API validates ownership
- Read vs write scope enforcement — all tools treated equally for now

### 4. Audit Logging

Dedicated Pino child logger with `component: "audit"` for Cloud Logging filterability.

**Every tool invocation emits:**

```json
{
  "component": "audit",
  "event": "tool_access",
  "sessionId": "abc123",
  "clientId": "user@example.com",
  "authType": "jwt",
  "tool": "dv360_list_entities",
  "advertiserId": "adv456",
  "authorized": true,
  "durationMs": 142,
  "success": true
}
```

**Authorization denial:**

```json
{
  "component": "audit",
  "event": "tool_access_denied",
  "sessionId": "abc123",
  "clientId": "user@example.com",
  "authType": "jwt",
  "tool": "dv360_get_entity",
  "advertiserId": "adv789",
  "authorized": false,
  "reason": "advertiser not in allowed scope"
}
```

**Fingerprint mismatch (in transport):**

```json
{
  "component": "audit",
  "event": "session_fingerprint_mismatch",
  "sessionId": "abc123",
  "storedFingerprint": "a1b2c3...",
  "requestFingerprint": "d4e5f6..."
}
```

**Not logged:** Credential values, full request/response payloads, tool parameters beyond advertiser ID.

**Cloud Logging queries:**

```
jsonPayload.component = "audit"
jsonPayload.event = "tool_access_denied"
```

Exportable to BigQuery for retention and dashboarding.

## Files Changed

| File | Change |
|------|--------|
| `packages/shared/src/auth/auth-strategy.ts` | Add `SessionAuthContext` type, `allowed_advertisers` to `JwtPayload` |
| `packages/shared/src/auth/jwt.ts` | Extract `allowed_advertisers` claim |
| `packages/shared/src/utils/session-store.ts` | Add `authContexts` map, `setAuthContext()`, `getAuthContext()`, cleanup |
| `packages/shared/src/utils/tool-handler-factory.ts` | Add authorization check + audit logging in `registerToolsFromDefinitions()` |
| `packages/shared/src/utils/mcp-transport-helpers.ts` | Add `validateSessionReuse()` shared helper |
| `packages/dbm-mcp/src/mcp-server/transports/streamable-http-transport.ts` | Call `validateSessionReuse()` + `setAuthContext()` |
| `packages/dv360-mcp/src/mcp-server/transports/streamable-http-transport.ts` | Same |
| `packages/ttd-mcp/src/mcp-server/transports/streamable-http-transport.ts` | Same |
| `packages/gads-mcp/src/mcp-server/transports/streamable-http-transport.ts` | Same |
| `packages/*/src/mcp-server/tools/utils/resolve-session.ts` | Return `{ services, authContext }` |
| `packages/shared/tests/` | Tests for fingerprint validation, authorization, audit logging |

## Backwards Compatibility

- Existing JWT tokens without `allowed_advertisers` claim: unrestricted (no breaking change)
- Header-based auth (google-headers, ttd-headers, gads-headers): unrestricted (no breaking change)
- `none` auth mode: unrestricted, no fingerprint stored (no breaking change)
- stdio mode: no change to behavior
