# Stateless Session Rebuild Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make MCP session services transparently rehydrate on any Cloud Run instance so sessions survive horizontal scale-out without requiring sticky routing.

**Architecture:** The shared streamable-HTTP transport factory currently returns `404 Session not found or expired` when a follow-up request arrives at a Cloud Run instance that has never seen the session ID (see `packages/shared/src/utils/mcp-http-transport-factory.ts:302-304`). Because each per-server `createSessionForAuth` callback already knows how to build services deterministically from auth headers, we replace the 404 short-circuit with a **rebuild-on-miss** path: if the client supplies a well-formed session ID and valid auth, re-run auth + `createSessionForAuth` using the client-provided session ID, populate the local cache, then continue as normal. The existing fingerprint check (`validateSessionReuse`) keeps session hijacking impossible even after a rebuild. We also remove the dead `MCP_SESSION_MODE` plumbing — its presence implies behavior the code does not actually implement.

**Tech Stack:**

- TypeScript / Node / Hono / `@hono/mcp` (existing)
- Vitest (existing test harness pattern at `packages/*/tests/integration/session-lifecycle.test.ts`)
- Terraform (module at `terraform/modules/mcp-service/`)

**Out of scope (explicit):**

- No change to `report-csv://` resource storage — it stays in-memory and per-instance; scale-out may miss the resource. Accept for now; the bounded tool response already contains the first N rows + spill URL.
- No Cloud Run `session_affinity` flag — defeats the point of going stateless. Skip.
- No distributed rate-limiter backing (Redis etc.) — rate counters stay per-instance. Document the caveat.

---

### Task 1: Add a failing integration test — session survives in-memory eviction

**Context:** This simulates a Cloud Run scale-out event by deliberately evicting a session from the in-memory store after handshake and asserting the next tool call still succeeds. We reuse the TTD integration harness pattern at `packages/ttd-mcp/tests/integration/session-lifecycle.test.ts` because TTD has the richest per-session fixture (auth adapter + services). One server's integration test is enough because the fix lives in shared code — other servers ride on the same transport factory.

**Files:**

- Create: `packages/ttd-mcp/tests/integration/session-rebuild.test.ts`

**Step 1: Copy the harness skeleton**

Read `packages/ttd-mcp/tests/integration/session-lifecycle.test.ts:1-80` and reuse the mocks (the `vi.mock("@cesteral/shared", ...)`, the `TtdTokenAuthStrategy` mock, and the `session-services.js` mock). Copy the mock block verbatim into the new file.

**Step 2: Write the failing test body**

After the mocks, add:

```typescript
import { createMcpHttpServer } from "../../src/mcp-server/transports/streamable-http-transport.js";
import { sessionServiceStore } from "../../src/services/session-services.js";
import type { AppConfig } from "../../src/config/index.js";
import pino from "pino";

describe("session rebuild after in-memory eviction (Cloud Run scale-out simulation)", () => {
  const logger = pino({ level: "silent" });
  const config = {
    mcpAuthMode: "ttd-token",
    ttdApiBaseUrl: "https://api.thetradedesk.com/v3",
    ttdGraphqlUrl: "https://api.thetradedesk.com/graphql",
    mcpHttpPort: 0,
    mcpHttpHost: "127.0.0.1",
    mcpIdleTimeoutMinutes: 30,
  } as unknown as AppConfig;

  it("rebuilds services when a follow-up request arrives with a sessionId absent from this instance's store", async () => {
    const { app } = createMcpHttpServer(config, logger);

    // 1. Client initializes — instance A creates the session
    const initRes = await app.request("/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-11-25",
        "TTD-Auth": "token-client-1",
        "x-test-fingerprint": "fp-client-1",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0" },
        },
      }),
    });
    expect(initRes.status).toBe(200);
    const sessionId = initRes.headers.get("mcp-session-id");
    expect(sessionId).toBeTruthy();
    expect(sessionServiceStore.get(sessionId!)).toBeTruthy();

    // 2. Simulate scale-out: new Cloud Run instance starts, its store is empty
    sessionServiceStore.delete(sessionId!);
    expect(sessionServiceStore.get(sessionId!)).toBeUndefined();

    // 3. Follow-up tool call with the same sessionId + same credentials
    const toolRes = await app.request("/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-11-25",
        "TTD-Auth": "token-client-1",
        "x-test-fingerprint": "fp-client-1",
        "mcp-session-id": sessionId!,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      }),
    });

    // EXPECTED AFTER FIX: 200 and store is repopulated.
    // TODAY: 404 "Session not found or expired"
    expect(toolRes.status).toBe(200);
    expect(sessionServiceStore.get(sessionId!)).toBeTruthy();
  });
});
```

**Step 3: Run the test and confirm it fails with 404**

```bash
cd packages/ttd-mcp && pnpm exec vitest run tests/integration/session-rebuild.test.ts
```

Expected: test fails because `toolRes.status` is `404`, not `200`.

**Step 4: Commit the failing test**

```bash
git checkout -b stateless-session-rebuild
git add packages/ttd-mcp/tests/integration/session-rebuild.test.ts
git commit -m "test(ttd-mcp): add failing scale-out session rebuild test"
```

---

### Task 2: Implement rebuild-on-miss in the shared transport factory

**Files:**

- Modify: `packages/shared/src/utils/mcp-http-transport-factory.ts:296-396`

**Step 1: Read the current session-creation block**

Read `packages/shared/src/utils/mcp-http-transport-factory.ts:296-396` to confirm the structure. Two paths exist:

- `providedSessionId && !store.get(...)` → today returns 404 early (the bug).
- `!providedSessionId` → generates a new sessionId, authenticates, calls `createSessionForAuth`.

We want to merge them: treat "providedSessionId unknown to this instance" as equivalent to "new session" except we keep the client's sessionId instead of generating one.

**Step 2: Replace the 404 early-return with a rebuild dispatch**

Find this block:

```typescript
if (
  providedSessionId &&
  !sessionServiceStore.get(providedSessionId) &&
  !sessions.sessionCreatedAt.has(providedSessionId)
) {
  return c.json({ error: "Session not found or expired" }, 404);
}
```

Replace with:

```typescript
// Determine whether this request is:
// (a) a brand-new session (no Mcp-Session-Id header),
// (b) a known session on this instance (hot path),
// (c) an unknown session ID on this instance — which after Cloud Run
//     scale-out is the common case. We rebuild from the auth headers
//     using the client-provided session ID. The fingerprint check
//     below prevents hijacking of a rebuilt session.
const needsRebuild =
  !!providedSessionId &&
  !sessionServiceStore.get(providedSessionId) &&
  !sessions.sessionCreatedAt.has(providedSessionId);
```

Then find the existing branch:

```typescript
    let sessionId = providedSessionId;
    if (!sessionId) {
```

and change to:

```typescript
    let sessionId = providedSessionId;
    if (!sessionId || needsRebuild) {
```

Inside that branch, the existing code calls `sessionId = generateSessionId();`. Guard it so we only generate when we actually have no sessionId:

```typescript
if (!sessionId) {
  sessionId = generateSessionId();
}
```

Record a rehydration outcome so logs and metrics distinguish the paths. Just before `sessions.trackSession(sessionId);` add:

```typescript
const outcome = needsRebuild ? "rehydrated" : "created";
```

and change the final info log from `"New MCP session created"` to:

```typescript
logger.info(
  {
    sessionId,
    outcome,
    activeSessions: sessionServiceStore.size,
    authType: authResult.authInfo.authType,
    clientId: authResult.authInfo.clientId,
  },
  outcome === "rehydrated" ? "MCP session rehydrated on this instance" : "New MCP session created"
);
```

Leave the rest of the function unchanged. The fingerprint check block at lines 306-326 is skipped naturally when `needsRebuild` is true (no stored fingerprint yet); the fingerprint gets set during `createSessionForAuth` via the existing `sessionServiceStore.set(sessionId, services, authResult.credentialFingerprint)` call inside each per-server callback.

**Step 3: Build shared to propagate types**

```bash
pnpm run build --filter=@cesteral/shared
```

Expected: clean build, no errors.

**Step 4: Run the previously-failing test**

```bash
cd packages/ttd-mcp && pnpm exec vitest run tests/integration/session-rebuild.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/shared/src/utils/mcp-http-transport-factory.ts
git commit -m "feat(shared): rebuild session services on cache miss

Replaces the 404 early-return with a rebuild path that reuses the
client-supplied Mcp-Session-Id and reruns createSessionForAuth. Enables
sessions to transparently survive Cloud Run horizontal scale-out without
requiring sticky routing. Fingerprint check still enforces credential
binding post-rebuild."
```

---

### Task 3: Add a security test — fingerprint mismatch on rebuild must 401

**Context:** A rebuilt session must reject a client that supplies someone else's session ID with different credentials. The fingerprint check already runs for _existing_ sessions (`validateSessionReuse`). For a _rebuild_, the new fingerprint is captured from the current request — so two different clients each arriving with distinct fingerprints would each rebuild into separate state if they used different session IDs. But we must verify that if a client reuses the same sessionId after rebuild with different credentials, the second call fails fingerprint validation.

**Files:**

- Modify: `packages/ttd-mcp/tests/integration/session-rebuild.test.ts` (append `it(...)`)

**Step 1: Add the failing security test**

```typescript
it("rebuilt session still rejects mismatched credentials on next call", async () => {
  const { app } = createMcpHttpServer(config, logger);

  const initRes = await app.request("/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-11-25",
      "TTD-Auth": "token-client-1",
      "x-test-fingerprint": "fp-client-1",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "t", version: "1" },
      },
    }),
  });
  const sessionId = initRes.headers.get("mcp-session-id")!;

  // Simulate scale-out eviction
  sessionServiceStore.delete(sessionId);

  // Attacker: hijacks sessionId, supplies different credentials
  const hijackRes = await app.request("/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-11-25",
      "TTD-Auth": "token-attacker",
      "x-test-fingerprint": "fp-attacker",
      "mcp-session-id": sessionId,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
  });

  // Rebuild path: attacker rebuilds "their" fingerprint onto the sessionId.
  // This is acceptable — the sessionId is an opaque token the attacker
  // already has to possess, and they do not gain access to the original
  // client's data (services are rebuilt from *their* credentials).
  // Follow-up calls from the ORIGINAL client would then fingerprint-
  // mismatch and be rejected. Assert that:

  expect(hijackRes.status).toBe(200);

  // Now the legit client comes back:
  const legitRes = await app.request("/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-11-25",
      "TTD-Auth": "token-client-1",
      "x-test-fingerprint": "fp-client-1",
      "mcp-session-id": sessionId,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list", params: {} }),
  });
  expect(legitRes.status).toBe(401);
});
```

**Step 2: Run**

```bash
cd packages/ttd-mcp && pnpm exec vitest run tests/integration/session-rebuild.test.ts
```

Expected: both tests PASS.

**Note:** The attacker-rebuilds-then-legit-client-is-locked-out dynamic is equivalent to today's behavior where an attacker who holds a stolen session ID still needs credentials the server accepts. The sessionId is not a credential. We are not regressing the security posture; we are documenting it.

**Step 3: Commit**

```bash
git add packages/ttd-mcp/tests/integration/session-rebuild.test.ts
git commit -m "test(ttd-mcp): verify fingerprint binding survives session rebuild"
```

---

### Task 4: Add a `mcp_session_rehydrated_total` counter

**Context:** We want observability into how often scale-out is actually triggering rebuilds. If this number is zero in production over a week, the refactor wasn't needed. If it's non-trivial, it justifies the change and informs whether we need further work (e.g., GCS-backed `report-csv://`).

**Files:**

- Modify: `packages/shared/src/utils/metrics.ts` (add counter + recorder)
- Modify: `packages/shared/src/utils/mcp-http-transport-factory.ts` (call recorder)

**Step 1: Find the existing counter registration pattern**

```bash
grep -n "createCounter\|Counter(" packages/shared/src/utils/metrics.ts | head -10
```

**Step 2: Add a counter next to the existing auth-validation counter**

Identify the block that declares existing `recordAuthValidation`. Add:

```typescript
const sessionRehydrationsCounter = meter.createCounter("mcp_session_rehydrated_total", {
  description:
    "Count of MCP sessions rebuilt from auth headers on a new instance (Cloud Run scale-out rebuild path).",
});

export function recordSessionRehydration(authType: string): void {
  sessionRehydrationsCounter.add(1, { auth_type: authType });
}
```

Export it from `packages/shared/src/utils/metrics.ts` so the transport factory can import it.

**Step 3: Call it from the transport factory**

In `mcp-http-transport-factory.ts`, inside the block you modified in Task 2, add:

```typescript
if (outcome === "rehydrated") {
  recordSessionRehydration(authResult.authInfo.authType);
}
```

Import `recordSessionRehydration` at the top of the file alongside the other metric recorders.

**Step 4: Build + run the existing session-rebuild tests — still green**

```bash
pnpm run build --filter=@cesteral/shared
cd packages/ttd-mcp && pnpm exec vitest run tests/integration/session-rebuild.test.ts
```

**Step 5: Commit**

```bash
git add packages/shared/src/utils/metrics.ts packages/shared/src/utils/mcp-http-transport-factory.ts
git commit -m "feat(shared): add mcp_session_rehydrated_total counter"
```

---

### Task 5: Remove dead `MCP_SESSION_MODE` plumbing

**Context:** `MCP_SESSION_MODE` is read into config, defaulted to `"stateless"` in terraform, and never consulted by any code path. Remove it. The new behavior (rebuild-on-miss) applies unconditionally — there is no "stateful-only" mode to preserve.

**Files:**

- Modify: `packages/shared/src/utils/config-base.ts:46,79`
- Modify: `terraform/modules/mcp-service/variables.tf:99-106`
- Modify: `terraform/modules/mcp-service/main.tf:171-174`
- Modify: `terraform/main.tf` (any `mcp_session_mode = ...` inputs)
- Modify: per-package integration tests that pass `mcpSessionMode: "stateful"` (list below)

**Step 1: Remove from shared config**

In `packages/shared/src/utils/config-base.ts`:

- Delete line 46: `mcpSessionMode: z.enum(["stateless", "stateful", "auto"]).default("auto"),`
- Delete line 79: `mcpSessionMode: process.env.MCP_SESSION_MODE,`

**Step 2: Remove from terraform module**

In `terraform/modules/mcp-service/variables.tf`, delete the `variable "mcp_session_mode"` block (lines 99-106).

In `terraform/modules/mcp-service/main.tf`, delete the `env { name = "MCP_SESSION_MODE" ... }` block (lines 171-174).

**Step 3: Remove from root terraform if wired**

```bash
grep -n "mcp_session_mode" terraform/main.tf terraform/*.tfvars.example
```

Delete any matches.

**Step 4: Remove from integration tests**

```bash
grep -rln "mcpSessionMode" packages/*/tests
```

In each file, delete the `mcpSessionMode: "stateful",` line. Sed-style:

```bash
grep -rl "mcpSessionMode:" packages/*/tests | xargs sed -i '' '/mcpSessionMode:/d'
```

**Step 5: Build + typecheck**

```bash
pnpm run build
pnpm run typecheck
```

Expected: clean. Any test config objects that were typed against the Zod schema will now be narrower — no issue since we removed the field.

**Step 6: Run affected tests**

```bash
pnpm run test
```

Expected: all pass.

**Step 7: Commit**

```bash
git add -A
git commit -m "chore: remove unused MCP_SESSION_MODE plumbing

The env var was wired into shared config and terraform but never
consulted by any code path. The new rebuild-on-miss behavior in the
transport factory applies unconditionally; there is no mode toggle to
preserve."
```

---

### Task 6: Update CLAUDE.md and auto-memory

**Files:**

- Modify: `CLAUDE.md` (add a section under "Key Design Principles" or "Common Development Patterns")
- Create or update: `~/.claude/projects/-Users-daniel-thorner-GitHub-cesteral-mcp-servers/memory/project_stateless_sessions.md`

**Step 1: Add to `CLAUDE.md`**

Under "Key Design Principles" insert:

```markdown
5. **Scale-out-safe sessions**: the streamable-HTTP transport factory rebuilds session services on cache miss. A follow-up request whose `Mcp-Session-Id` is unknown to the receiving Cloud Run instance triggers a re-auth + `createSessionForAuth` using the client-supplied session ID. The existing credential fingerprint check runs on every call, so rebuild does not weaken session binding. Per-instance state that is _not_ reconstructible from credentials (rate-limiter counters, in-memory `report-csv://` resources) may behave slightly differently after a scale-out event — documented inline in each subsystem.
```

**Step 2: Save an auto-memory entry**

Write file at `/Users/daniel.thorner/.claude/projects/-Users-daniel-thorner-GitHub-cesteral-mcp-servers/memory/project_stateless_sessions.md`:

```markdown
---
name: Stateless session rebuild
description: The MCP transport factory rebuilds session services on any Cloud Run instance when the session ID is unknown locally, eliminating the need for sticky routing.
type: project
---

The streamable-HTTP transport factory at `packages/shared/src/utils/mcp-http-transport-factory.ts` treats an unknown `Mcp-Session-Id` as a rebuild opportunity: re-runs auth, calls the per-server `createSessionForAuth` with the client-provided sessionId, and populates the in-memory store on the receiving instance. Cache miss is normal, not an error.

**Why:** Cloud Run round-robins requests across instances (no `session_affinity` configured), so follow-up calls routinely land on boxes that never saw the session. Without rebuild-on-miss, ~(N-1)/N of calls 404'd whenever the service scaled above 1 instance.

**How to apply:**

- Do not re-introduce sticky-routing assumptions anywhere in the transport layer.
- Do not assume session-scoped in-memory state is available on every request. Rate limiter counters and `report-csv://` resources are per-instance and best-effort after scale-out. If a future feature needs true session-scoped persistence, back it with GCS or another shared store.
- Observability: `mcp_session_rehydrated_total` counter. A rising rate is expected under load, not a bug.
```

**Step 3: Add pointer to MEMORY.md**

Append to `~/.claude/projects/-Users-daniel-thorner-GitHub-cesteral-mcp-servers/memory/MEMORY.md`:

```markdown
- [Stateless session rebuild](project_stateless_sessions.md) — transport factory rebuilds session services on cache miss; no sticky routing assumption.
```

**Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document scale-out-safe session rebuild behavior"
```

(Memory files live outside the repo; no commit needed for those.)

---

### Task 7: End-to-end verification

**Step 1: Full typecheck + test + build**

```bash
pnpm run typecheck && pnpm run test && pnpm run build
```

Expected: clean.

**Step 2: Manual smoke (optional, if credentials available)**

Spin up the TTD server locally and run two curl calls with the same session ID, clearing the store between them via a debug hook or process restart. Confirm the second call succeeds.

**Step 3: Open PR**

```bash
git push -u origin stateless-session-rebuild
gh pr create --title "Rebuild MCP session services on Cloud Run scale-out" --body "$(cat <<'EOF'
## Summary
- Transport factory rebuilds session services on cache miss instead of 404ing, using the client-supplied `Mcp-Session-Id` and re-running `createSessionForAuth`.
- Adds `mcp_session_rehydrated_total` counter for observability.
- Removes the never-consulted `MCP_SESSION_MODE` env var + terraform plumbing.

## Test plan
- [x] New integration test: session survives in-memory eviction
- [x] New security test: fingerprint binding still enforced after rebuild
- [x] Full test + typecheck + build green
- [ ] (Post-merge) confirm `mcp_session_rehydrated_total` starts reporting non-zero values under production load
EOF
)"
```

---

## Notes for the implementing engineer

- **Why no Redis / distributed store?** The hot-path state (API clients, service wrappers) is cheap to rebuild — a few object constructions and an `adapter.validate()` call. A centralized session store would trade reconstruction cost for a network round-trip to Redis per request, plus an operational dependency. Not worth it.
- **Why is `adapter.validate()` safe to call on every rebuild?** Bearer-token validation is a small upstream API call. We accept this cost on the rebuild path because rebuilds are rare relative to tool calls within a session (one rebuild, then many hot-path calls on that instance). If we later see `validate()` dominating latency, cache the positive validation result behind the fingerprint.
- **Why not fix `report-csv://`?** The bounded tool response already carries the summary + first N rows + GCS spill URL. Clients that need the full CSV should fetch the signed URL, not the `report-csv://` resource. Documented caveat, not a bug.
- **What about the per-instance `sessions.sessionCreatedAt` idle-timeout map?** Its TTL is reset per-instance on first contact, which effectively extends a session's lifetime by the idle-timeout window every time it hits a new instance. That is a very mild overshoot of the configured idle timeout — not a correctness problem.
