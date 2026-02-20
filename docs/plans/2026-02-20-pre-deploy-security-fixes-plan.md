# Pre-Deploy Security Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix three deploy-blocking security gaps: session fingerprint validation, per-advertiser JWT authorization, and structured audit logging.

**Architecture:** Store `SessionAuthContext` in `SessionServiceStore` alongside platform services. Enforce fingerprint validation in transport layer, authorization + audit logging in `registerToolsFromDefinitions()` factory. One enforcement point covers all tools across all 4 servers.

**Tech Stack:** TypeScript, Pino (logging), jose (JWT), Vitest (testing), Zod (validation)

---

### Task 1: Add SessionAuthContext type and extend SessionServiceStore

**Files:**
- Modify: `packages/shared/src/auth/auth-strategy.ts:44` (after AuthResult interface)
- Modify: `packages/shared/src/utils/session-store.ts:13-55` (add authContexts map)
- Test: `packages/shared/tests/utils/session-store.test.ts`

**Step 1: Write the failing tests**

Add to `packages/shared/tests/utils/session-store.test.ts`:

```typescript
describe("auth context", () => {
  it("should set and get auth context", () => {
    store.set("s1", { serviceA: "a", serviceB: 1 });
    const ctx = { authInfo: { clientId: "user@test.com", authType: "jwt" } };
    store.setAuthContext("s1", ctx);
    expect(store.getAuthContext("s1")).toEqual(ctx);
  });

  it("should return undefined for missing auth context", () => {
    expect(store.getAuthContext("nonexistent")).toBeUndefined();
  });

  it("should clean up auth context on delete", () => {
    store.set("s1", { serviceA: "a", serviceB: 1 });
    store.setAuthContext("s1", { authInfo: { clientId: "u", authType: "jwt" } });
    store.delete("s1");
    expect(store.getAuthContext("s1")).toBeUndefined();
  });

  it("should store allowedAdvertisers from auth context", () => {
    store.set("s1", { serviceA: "a", serviceB: 1 });
    const ctx = {
      authInfo: { clientId: "user@test.com", authType: "jwt" },
      allowedAdvertisers: ["adv123", "adv456"],
    };
    store.setAuthContext("s1", ctx);
    expect(store.getAuthContext("s1")?.allowedAdvertisers).toEqual(["adv123", "adv456"]);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/shared && pnpm run test -- --run tests/utils/session-store.test.ts`
Expected: FAIL — `setAuthContext` and `getAuthContext` do not exist.

**Step 3: Add SessionAuthContext type**

In `packages/shared/src/auth/auth-strategy.ts`, add after the `AuthResult` interface (after line 44):

```typescript
/**
 * Authentication context persisted for the session lifetime.
 * Used for fingerprint validation, authorization, and audit logging.
 */
export interface SessionAuthContext {
  authInfo: AuthInfo;
  credentialFingerprint?: string;
  allowedAdvertisers?: string[];
}
```

**Step 4: Extend SessionServiceStore**

In `packages/shared/src/utils/session-store.ts`, add:

1. Import at top:
```typescript
import type { SessionAuthContext } from "../auth/auth-strategy.js";
```

2. New private map in the class (after line 15):
```typescript
private authContexts = new Map<string, SessionAuthContext>();
```

3. New methods (after `validateFingerprint`, before `delete`):
```typescript
setAuthContext(sessionId: string, ctx: SessionAuthContext): void {
  this.authContexts.set(sessionId, ctx);
}

getAuthContext(sessionId: string): SessionAuthContext | undefined {
  return this.authContexts.get(sessionId);
}
```

4. In `delete()` method, add:
```typescript
this.authContexts.delete(sessionId);
```

**Step 5: Run tests to verify they pass**

Run: `cd packages/shared && pnpm run test -- --run tests/utils/session-store.test.ts`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add packages/shared/src/auth/auth-strategy.ts packages/shared/src/utils/session-store.ts packages/shared/tests/utils/session-store.test.ts
git commit -m "feat(shared): add SessionAuthContext type and extend SessionServiceStore"
```

---

### Task 2: Add allowed_advertisers to JWT payload and extraction

**Files:**
- Modify: `packages/shared/src/auth/jwt.ts:4-11` (JwtPayload interface)
- Modify: `packages/shared/src/auth/auth-strategy.ts:139-146` (JwtBearerAuthStrategy.verify)
- Test: `packages/shared/tests/auth/jwt-auth.test.ts` (new file)

**Step 1: Write the failing tests**

Create `packages/shared/tests/auth/jwt-auth.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createJwt, verifyJwt } from "../../src/auth/jwt.js";
import { JwtBearerAuthStrategy } from "../../src/auth/auth-strategy.js";
import * as jose from "jose";

const TEST_SECRET = "test-secret-key-at-least-32-chars-long!!";

describe("JWT allowed_advertisers claim", () => {
  it("should extract allowed_advertisers from JWT payload", async () => {
    const secretKey = new TextEncoder().encode(TEST_SECRET);
    const token = await new jose.SignJWT({
      sub: "user@test.com",
      allowed_advertisers: ["adv123", "adv456"],
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setIssuer("cesteral-mcp")
      .setAudience("cesteral-services")
      .setExpirationTime("1h")
      .sign(secretKey);

    const payload = await verifyJwt(token, TEST_SECRET);
    expect(payload.allowed_advertisers).toEqual(["adv123", "adv456"]);
  });

  it("should return undefined allowed_advertisers when claim is absent", async () => {
    const token = await createJwt("user@test.com", TEST_SECRET, "1h");
    const payload = await verifyJwt(token, TEST_SECRET);
    expect(payload.allowed_advertisers).toBeUndefined();
  });

  it("should include allowedAdvertisers in AuthResult from JwtBearerAuthStrategy", async () => {
    const secretKey = new TextEncoder().encode(TEST_SECRET);
    const token = await new jose.SignJWT({
      sub: "user@test.com",
      allowed_advertisers: ["adv789"],
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setIssuer("cesteral-mcp")
      .setAudience("cesteral-services")
      .setExpirationTime("1h")
      .sign(secretKey);

    const strategy = new JwtBearerAuthStrategy(TEST_SECRET);
    const result = await strategy.verify({
      authorization: `Bearer ${token}`,
    });

    expect(result.authInfo.clientId).toBe("user@test.com");
    expect(result.allowedAdvertisers).toEqual(["adv789"]);
  });

  it("should return undefined allowedAdvertisers when JWT has no claim", async () => {
    const token = await createJwt("user@test.com", TEST_SECRET, "1h");
    const strategy = new JwtBearerAuthStrategy(TEST_SECRET);
    const result = await strategy.verify({
      authorization: `Bearer ${token}`,
    });

    expect(result.allowedAdvertisers).toBeUndefined();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/shared && pnpm run test -- --run tests/auth/jwt-auth.test.ts`
Expected: FAIL — `allowed_advertisers` not in JwtPayload, `allowedAdvertisers` not in AuthResult.

**Step 3: Add allowed_advertisers to JwtPayload**

In `packages/shared/src/auth/jwt.ts`, update the `JwtPayload` interface (lines 4-11):

```typescript
export interface JwtPayload {
  sub: string;
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  scope?: string;
  allowed_advertisers?: string[];
}
```

**Step 4: Add allowedAdvertisers to AuthResult**

In `packages/shared/src/auth/auth-strategy.ts`, add to the `AuthResult` interface (after line 43):

```typescript
/**
 * Allowed advertiser/customer IDs from JWT claims.
 * Undefined means unrestricted (header-based auth or JWT without claim).
 */
allowedAdvertisers?: string[];
```

**Step 5: Extract allowed_advertisers in JwtBearerAuthStrategy**

In `packages/shared/src/auth/auth-strategy.ts`, update the `verify` method return (lines 139-147):

```typescript
    return {
      authInfo: {
        clientId: payload.sub,
        subject: payload.sub,
        authType: "jwt",
        scopes: payload.scope ? payload.scope.split(" ") : [],
      },
      allowedAdvertisers: payload.allowed_advertisers,
    };
```

**Step 6: Run tests to verify they pass**

Run: `cd packages/shared && pnpm run test -- --run tests/auth/jwt-auth.test.ts`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add packages/shared/src/auth/jwt.ts packages/shared/src/auth/auth-strategy.ts packages/shared/tests/auth/jwt-auth.test.ts
git commit -m "feat(shared): add allowed_advertisers JWT claim extraction"
```

---

### Task 3: Add validateSessionReuse helper to shared transport helpers

**Files:**
- Modify: `packages/shared/src/utils/mcp-transport-helpers.ts` (add helper function)
- Test: `packages/shared/tests/utils/mcp-transport-helpers.test.ts` (new file)

**Step 1: Write the failing tests**

Create `packages/shared/tests/utils/mcp-transport-helpers.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { validateSessionReuse } from "../../src/utils/mcp-transport-helpers.js";
import { SessionServiceStore } from "../../src/utils/session-store.js";
import type { AuthStrategy } from "../../src/auth/auth-strategy.js";

interface MockServices {
  svc: string;
}

function createMockAuthStrategy(fingerprint?: string, shouldThrow = false): AuthStrategy {
  return {
    verify: vi.fn().mockImplementation(async () => {
      if (shouldThrow) throw new Error("Auth failed");
      return {
        authInfo: { clientId: "user@test.com", authType: "jwt" },
        credentialFingerprint: fingerprint,
      };
    }),
  };
}

describe("validateSessionReuse", () => {
  it("should return valid when fingerprints match", async () => {
    const store = new SessionServiceStore<MockServices>();
    store.set("s1", { svc: "a" }, "fp-abc");
    const strategy = createMockAuthStrategy("fp-abc");

    const result = await validateSessionReuse(strategy, store, {}, "s1");
    expect(result.valid).toBe(true);
  });

  it("should return invalid when fingerprints mismatch", async () => {
    const store = new SessionServiceStore<MockServices>();
    store.set("s1", { svc: "a" }, "fp-abc");
    const strategy = createMockAuthStrategy("fp-xyz");

    const result = await validateSessionReuse(strategy, store, {}, "s1");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("fingerprint");
  });

  it("should return valid when no stored fingerprint (stdio mode)", async () => {
    const store = new SessionServiceStore<MockServices>();
    store.set("s1", { svc: "a" }); // no fingerprint
    const strategy = createMockAuthStrategy("fp-any");

    const result = await validateSessionReuse(strategy, store, {}, "s1");
    expect(result.valid).toBe(true);
  });

  it("should return invalid when auth strategy throws", async () => {
    const store = new SessionServiceStore<MockServices>();
    store.set("s1", { svc: "a" }, "fp-abc");
    const strategy = createMockAuthStrategy(undefined, true);

    const result = await validateSessionReuse(strategy, store, {}, "s1");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Authentication failed");
  });

  it("should return authResult on success for auth context storage", async () => {
    const store = new SessionServiceStore<MockServices>();
    store.set("s1", { svc: "a" }, "fp-abc");
    const strategy = createMockAuthStrategy("fp-abc");

    const result = await validateSessionReuse(strategy, store, {}, "s1");
    expect(result.valid).toBe(true);
    expect(result.authResult?.authInfo.clientId).toBe("user@test.com");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/shared && pnpm run test -- --run tests/utils/mcp-transport-helpers.test.ts`
Expected: FAIL — `validateSessionReuse` does not exist.

**Step 3: Implement validateSessionReuse**

In `packages/shared/src/utils/mcp-transport-helpers.ts`, add after the imports:

```typescript
import type { AuthStrategy, AuthResult } from "../auth/auth-strategy.js";
```

Then add the function before the `SessionManager` class:

```typescript
// ---------------------------------------------------------------------------
// Session reuse validation
// ---------------------------------------------------------------------------

export interface SessionReuseResult {
  valid: boolean;
  reason?: string;
  authResult?: AuthResult;
}

/**
 * Validate that a reused session belongs to the same credential holder.
 * Re-runs auth to extract the current request's fingerprint and compares
 * it against the stored fingerprint from session creation.
 */
export async function validateSessionReuse(
  authStrategy: AuthStrategy,
  sessionServiceStore: { validateFingerprint(sessionId: string, fp: string): boolean },
  headers: Record<string, string>,
  sessionId: string
): Promise<SessionReuseResult> {
  let authResult: AuthResult;
  try {
    authResult = await authStrategy.verify(headers);
  } catch (error: any) {
    return { valid: false, reason: `Authentication failed on session reuse: ${error.message}` };
  }

  const fingerprint = authResult.credentialFingerprint;
  if (fingerprint && !sessionServiceStore.validateFingerprint(sessionId, fingerprint)) {
    return {
      valid: false,
      reason: "Credential fingerprint mismatch — possible session hijacking attempt",
    };
  }

  return { valid: true, authResult };
}
```

**Step 4: Export from shared**

Ensure `validateSessionReuse` is exported. It's already exported via `mcp-transport-helpers.ts` → `utils/index.ts` → `src/index.ts`.

**Step 5: Run tests to verify they pass**

Run: `cd packages/shared && pnpm run test -- --run tests/utils/mcp-transport-helpers.test.ts`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add packages/shared/src/utils/mcp-transport-helpers.ts packages/shared/tests/utils/mcp-transport-helpers.test.ts
git commit -m "feat(shared): add validateSessionReuse helper for session fingerprint enforcement"
```

---

### Task 4: Add authorization check and audit logging to tool-handler-factory

**Files:**
- Modify: `packages/shared/src/utils/tool-handler-factory.ts:151-213,396-431` (add authContextResolver option, authorization check, audit logger)
- Test: `packages/shared/tests/utils/tool-handler-factory-authz.test.ts` (new file)

**Step 1: Write the failing tests**

Create `packages/shared/tests/utils/tool-handler-factory-authz.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { registerToolsFromDefinitions } from "../../src/utils/tool-handler-factory.js";
import type { SessionAuthContext } from "../../src/auth/auth-strategy.js";
import type { Logger } from "pino";

// Mock MCP server
function createMockServer() {
  const handlers = new Map<string, (args: unknown) => Promise<unknown>>();
  return {
    server: { elicitInput: vi.fn() },
    registerTool: vi.fn((name: string, _config: unknown, handler: (args: unknown) => Promise<unknown>) => {
      handlers.set(name, handler);
    }),
    callTool: async (name: string, args: unknown) => {
      const handler = handlers.get(name);
      if (!handler) throw new Error(`Tool ${name} not registered`);
      return handler(args);
    },
  };
}

function createMockLogger(): Logger {
  const childLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnValue(childLogger),
  } as unknown as Logger;
}

describe("tool-handler-factory authorization", () => {
  let server: ReturnType<typeof createMockServer>;
  let logger: ReturnType<typeof createMockLogger>;

  const testTool = {
    name: "test_tool",
    description: "Test tool",
    inputSchema: z.object({
      advertiserId: z.string(),
      value: z.string(),
    }),
    logic: vi.fn().mockResolvedValue({ ok: true }),
  };

  beforeEach(() => {
    server = createMockServer();
    logger = createMockLogger();
    testTool.logic.mockClear();
  });

  it("should block tool call when advertiserId not in allowedAdvertisers", async () => {
    const authContext: SessionAuthContext = {
      authInfo: { clientId: "user@test.com", authType: "jwt" },
      allowedAdvertisers: ["adv123", "adv456"],
    };

    registerToolsFromDefinitions({
      server,
      tools: [testTool],
      logger,
      sessionId: "s1",
      transformSchema: (s) => s,
      createRequestContext: ({ operation }) => ({
        requestId: "req-1",
        timestamp: new Date().toISOString(),
        operation,
      }),
      authContextResolver: () => authContext,
    });

    const result = await server.callTool("test_tool", {
      advertiserId: "adv999",
      value: "hello",
    });

    expect((result as any).isError).toBe(true);
    expect((result as any).content[0].text).toContain("Access denied");
    expect(testTool.logic).not.toHaveBeenCalled();
  });

  it("should allow tool call when advertiserId is in allowedAdvertisers", async () => {
    const authContext: SessionAuthContext = {
      authInfo: { clientId: "user@test.com", authType: "jwt" },
      allowedAdvertisers: ["adv123", "adv456"],
    };

    registerToolsFromDefinitions({
      server,
      tools: [testTool],
      logger,
      sessionId: "s1",
      transformSchema: (s) => s,
      createRequestContext: ({ operation }) => ({
        requestId: "req-1",
        timestamp: new Date().toISOString(),
        operation,
      }),
      authContextResolver: () => authContext,
    });

    const result = await server.callTool("test_tool", {
      advertiserId: "adv123",
      value: "hello",
    });

    expect((result as any).isError).toBeUndefined();
    expect(testTool.logic).toHaveBeenCalled();
  });

  it("should skip authorization when allowedAdvertisers is undefined", async () => {
    const authContext: SessionAuthContext = {
      authInfo: { clientId: "user@test.com", authType: "google-service_account" },
    };

    registerToolsFromDefinitions({
      server,
      tools: [testTool],
      logger,
      sessionId: "s1",
      transformSchema: (s) => s,
      createRequestContext: ({ operation }) => ({
        requestId: "req-1",
        timestamp: new Date().toISOString(),
        operation,
      }),
      authContextResolver: () => authContext,
    });

    const result = await server.callTool("test_tool", {
      advertiserId: "any-id",
      value: "hello",
    });

    expect((result as any).isError).toBeUndefined();
    expect(testTool.logic).toHaveBeenCalled();
  });

  it("should skip authorization when no authContextResolver provided", async () => {
    registerToolsFromDefinitions({
      server,
      tools: [testTool],
      logger,
      sessionId: "s1",
      transformSchema: (s) => s,
      createRequestContext: ({ operation }) => ({
        requestId: "req-1",
        timestamp: new Date().toISOString(),
        operation,
      }),
    });

    const result = await server.callTool("test_tool", {
      advertiserId: "any-id",
      value: "hello",
    });

    expect((result as any).isError).toBeUndefined();
    expect(testTool.logic).toHaveBeenCalled();
  });

  it("should allow tool with no advertiser params even when allowedAdvertisers set", async () => {
    const noAdvTool = {
      name: "no_adv_tool",
      description: "Tool without advertiser params",
      inputSchema: z.object({ query: z.string() }),
      logic: vi.fn().mockResolvedValue({ ok: true }),
    };

    const authContext: SessionAuthContext = {
      authInfo: { clientId: "user@test.com", authType: "jwt" },
      allowedAdvertisers: ["adv123"],
    };

    registerToolsFromDefinitions({
      server,
      tools: [noAdvTool],
      logger,
      sessionId: "s1",
      transformSchema: (s) => s,
      createRequestContext: ({ operation }) => ({
        requestId: "req-1",
        timestamp: new Date().toISOString(),
        operation,
      }),
      authContextResolver: () => authContext,
    });

    const result = await server.callTool("no_adv_tool", { query: "test" });
    expect((result as any).isError).toBeUndefined();
    expect(noAdvTool.logic).toHaveBeenCalled();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/shared && pnpm run test -- --run tests/utils/tool-handler-factory-authz.test.ts`
Expected: FAIL — `authContextResolver` not in RegisterToolsOptions.

**Step 3: Add authContextResolver option to RegisterToolsOptions**

In `packages/shared/src/utils/tool-handler-factory.ts`, add the import at the top (after existing imports):

```typescript
import type { SessionAuthContext } from "../auth/auth-strategy.js";
```

Add to `RegisterToolsOptions` interface (after `workflowTracker`, around line 212):

```typescript
/**
 * Optional resolver to get the session's auth context for authorization checks.
 * When provided, tools with advertiser-like params are checked against allowedAdvertisers.
 */
authContextResolver?: () => SessionAuthContext | undefined;
```

**Step 4: Add authorization constants and logic**

At the top of the file (after imports, before interfaces), add:

```typescript
const ADVERTISER_PARAM_KEYS = ["advertiserId", "customerId", "partnerId"];
```

In the `registerToolsFromDefinitions` function, destructure the new option (around line 305):

```typescript
const {
  // ... existing destructuring
  workflowTracker,
  authContextResolver,
} = opts;
```

Create the audit logger (after destructuring, before the `for` loop):

```typescript
const auditLogger = logger.child({ component: "audit" });
```

**Step 5: Add authorization check in the tool handler**

In the tool handler, after input validation (`tool.inputSchema.parse`) at line 396, and before the sdkContext creation at line 399, add the authorization check:

```typescript
// ── Authorization check ──────────────────────────────────────
if (authContextResolver) {
  const authContext = authContextResolver();
  if (authContext?.allowedAdvertisers) {
    const input = validatedInput as Record<string, unknown>;
    for (const key of ADVERTISER_PARAM_KEYS) {
      const value = input[key];
      if (typeof value === "string" && !authContext.allowedAdvertisers.includes(value)) {
        auditLogger.warn({
          event: "tool_access_denied",
          sessionId,
          clientId: authContext.authInfo.clientId,
          authType: authContext.authInfo.authType,
          tool: tool.name,
          [key]: value,
          authorized: false,
          reason: "advertiser not in allowed scope",
        }, "Authorization denied");

        recordToolExecution(tool.name, "error", Date.now() - startTime);

        return {
          content: [
            {
              type: "text" as const,
              text: `Access denied: ${key} "${value}" is not in your authorized scope.`,
            },
          ],
          isError: true,
        };
      }
    }
  }
}
```

**Step 6: Add audit logging on successful tool execution**

After the existing `logger.info("Tool executed successfully")` line (around line 648-651), add:

```typescript
// ── Audit logging ──────────────────────────────────────────
if (authContextResolver) {
  const authContext = authContextResolver();
  if (authContext) {
    const input = validatedInput as Record<string, unknown>;
    const auditEntry: Record<string, unknown> = {
      event: "tool_access",
      sessionId,
      clientId: authContext.authInfo.clientId,
      authType: authContext.authInfo.authType,
      tool: tool.name,
      authorized: true,
      durationMs: Date.now() - startTime,
      success: true,
    };
    for (const key of ADVERTISER_PARAM_KEYS) {
      if (typeof input[key] === "string") {
        auditEntry[key] = input[key];
      }
    }
    auditLogger.info(auditEntry, "Tool access");
  }
}
```

Also add audit logging in the catch block (after the existing error interaction logging, around line 703):

```typescript
if (authContextResolver) {
  const authContext = authContextResolver();
  if (authContext) {
    const auditEntry: Record<string, unknown> = {
      event: "tool_access",
      sessionId,
      clientId: authContext.authInfo.clientId,
      authType: authContext.authInfo.authType,
      tool: tool.name,
      authorized: true,
      durationMs: Date.now() - startTime,
      success: false,
    };
    auditLogger.info(auditEntry, "Tool access (error)");
  }
}
```

**Step 7: Run tests to verify they pass**

Run: `cd packages/shared && pnpm run test -- --run tests/utils/tool-handler-factory-authz.test.ts`
Expected: ALL PASS

**Step 8: Run full shared test suite**

Run: `cd packages/shared && pnpm run test`
Expected: ALL PASS (no regressions)

**Step 9: Commit**

```bash
git add packages/shared/src/utils/tool-handler-factory.ts packages/shared/tests/utils/tool-handler-factory-authz.test.ts
git commit -m "feat(shared): add per-advertiser authorization and audit logging to tool factory"
```

---

### Task 5: Wire fingerprint validation and auth context in all 4 transports

**Files:**
- Modify: `packages/dbm-mcp/src/mcp-server/transports/streamable-http-transport.ts`
- Modify: `packages/dv360-mcp/src/mcp-server/transports/streamable-http-transport.ts`
- Modify: `packages/ttd-mcp/src/mcp-server/transports/streamable-http-transport.ts`
- Modify: `packages/gads-mcp/src/mcp-server/transports/streamable-http-transport.ts`

All 4 transports get the same two changes:

**Change A: Fingerprint validation on session reuse**

Find the session reuse block (present in all 4 servers):

```typescript
if (providedSessionId && !sessionServiceStore.get(providedSessionId)) {
  return c.json({ error: "Session not found or expired" }, 404);
}
```

Replace with:

```typescript
if (providedSessionId && !sessionServiceStore.get(providedSessionId)) {
  return c.json({ error: "Session not found or expired" }, 404);
}

// Validate credential fingerprint on session reuse
if (providedSessionId) {
  const headers = extractHeadersMap(c.req.raw.headers);
  const reuseResult = await validateSessionReuse(
    authStrategy, sessionServiceStore, headers, providedSessionId
  );
  if (!reuseResult.valid) {
    const auditLogger = logger.child({ component: "audit" });
    auditLogger.warn({
      event: "session_fingerprint_mismatch",
      sessionId: providedSessionId,
    }, reuseResult.reason);
    return c.json({ error: "Session credential mismatch" }, 401);
  }
}
```

Add `validateSessionReuse` to the import from `@cesteral/shared`.

**Change B: Store auth context on new session creation**

In the new session creation block, after `sessionServiceStore.set(sessionId, services, authResult.credentialFingerprint)`, add:

```typescript
sessionServiceStore.setAuthContext(sessionId, {
  authInfo: authResult.authInfo,
  credentialFingerprint: authResult.credentialFingerprint,
  allowedAdvertisers: authResult.allowedAdvertisers,
});
```

This line is added in each server's session creation path:
- **dbm-mcp**: After the `sessionServiceStore.set()` in the `if (adapter)` block
- **dv360-mcp**: Same pattern
- **ttd-mcp**: After both the `if (adapter)` and `else if (config.mcpAuthMode === "none" || ...)` blocks
- **gads-mcp**: After both the `if (adapter)` and `else if` blocks

**Step 1: Apply changes to all 4 transports**

Apply Change A and Change B to each server's transport file.

**Step 2: Build to verify no TypeScript errors**

Run: `pnpm run build`
Expected: BUILD SUCCESS

**Step 3: Commit**

```bash
git add packages/dbm-mcp/src/mcp-server/transports/streamable-http-transport.ts \
  packages/dv360-mcp/src/mcp-server/transports/streamable-http-transport.ts \
  packages/ttd-mcp/src/mcp-server/transports/streamable-http-transport.ts \
  packages/gads-mcp/src/mcp-server/transports/streamable-http-transport.ts
git commit -m "feat: wire fingerprint validation and auth context storage in all 4 transports"
```

---

### Task 6: Wire authContextResolver in each server's MCP server setup

**Files:**
- Modify: `packages/dbm-mcp/src/mcp-server/server.ts` (or wherever `registerToolsFromDefinitions` is called)
- Modify: `packages/dv360-mcp/src/mcp-server/server.ts`
- Modify: `packages/ttd-mcp/src/mcp-server/server.ts`
- Modify: `packages/gads-mcp/src/mcp-server/server.ts`

Each server calls `registerToolsFromDefinitions()` with a `sessionId`. Add the `authContextResolver` option:

```typescript
registerToolsFromDefinitions({
  // ... existing options
  sessionId,
  authContextResolver: () => sessionServiceStore.getAuthContext(sessionId),
});
```

The `sessionServiceStore` is already imported in each server file. The `sessionId` is already in scope.

**Step 1: Find and update each server's registerToolsFromDefinitions call**

Search for `registerToolsFromDefinitions` in each server's `server.ts` file and add the `authContextResolver` option.

**Step 2: Build to verify no TypeScript errors**

Run: `pnpm run build`
Expected: BUILD SUCCESS

**Step 3: Commit**

```bash
git add packages/dbm-mcp/src/mcp-server/server.ts \
  packages/dv360-mcp/src/mcp-server/server.ts \
  packages/ttd-mcp/src/mcp-server/server.ts \
  packages/gads-mcp/src/mcp-server/server.ts
git commit -m "feat: wire authContextResolver in all 4 MCP server setups"
```

---

### Task 7: Full build + test verification

**Step 1: Build all packages**

Run: `pnpm run build`
Expected: BUILD SUCCESS

**Step 2: Run all tests**

Run: `pnpm run test`
Expected: ALL PASS

**Step 3: Type check**

Run: `pnpm run typecheck`
Expected: NO ERRORS

**Step 4: Commit any remaining changes**

If any files were adjusted during verification, commit them.

---

### Task 8: Final integration smoke test

**Step 1: Verify the security fix works end-to-end**

Create a manual test script or use curl to verify:

1. **Fingerprint validation**: Start a session with one credential, try to reuse session ID with different credential → should get 401
2. **Authorization**: Create JWT with `allowed_advertisers: ["adv123"]`, call tool with `advertiserId: "adv999"` → should get MCP error "Access denied"
3. **Audit logging**: Check Pino output for `component: "audit"` entries on both allowed and denied calls

**Step 2: Commit any test utilities created**

```bash
git add -A
git commit -m "test: add integration smoke test for security fixes"
```
