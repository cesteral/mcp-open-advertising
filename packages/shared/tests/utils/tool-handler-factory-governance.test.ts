// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import * as jose from "jose";
import { hashActionInput, canonicalizeExecutableArgs } from "@cesteral/contract-hash";

vi.mock("../../src/utils/telemetry.js", () => ({
  withToolSpan: vi.fn().mockImplementation((_name, _input, fn) => fn({})),
  withSpan: vi.fn().mockImplementation((_name, fn) => fn()),
  setSpanAttribute: vi.fn(),
  recordSpanError: vi.fn(),
}));

import {
  registerToolsFromDefinitions,
  evaluateJtiStoreEnforcementSafety,
} from "../../src/utils/tool-handler-factory.js";
import { runWithRequestContext, createRequestContext } from "../../src/utils/request-context.js";
import { InMemoryJtiStore } from "../../src/index.js";
import type { JtiStore } from "../../src/index.js";
import type { SessionAuthContext } from "../../src/auth/auth-strategy.js";
import type { Logger } from "pino";

const SECRET = "test-secret-cluster3-aaaaaaaaaaaaaaaaa";
const DEF_HASH = "a".repeat(64);
const CONTRACT_ID = "meta.update_entity.v1";
const EFFECT_CONTRACT_ID = "ttd.submit_report.v1";
const enc = new TextEncoder();

function createMockServer() {
  const handlers = new Map<string, (args: unknown) => Promise<unknown>>();
  return {
    server: { elicitInput: vi.fn(), getClientCapabilities: () => ({}) },
    sendLoggingMessage: vi.fn().mockResolvedValue(undefined),
    registerTool: vi.fn(
      (name: string, _config: unknown, handler: (args: unknown) => Promise<unknown>) => {
        handlers.set(name, handler);
      }
    ),
    callTool: async (name: string, args: unknown) => {
      const handler = handlers.get(name);
      if (!handler) throw new Error(`Tool ${name} not registered`);
      return handler(args);
    },
  };
}

function createMockLogger(): Logger {
  const make = (): unknown => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockImplementation(make),
  });
  return make() as Logger;
}

const writeTool = {
  name: "meta_update_entity",
  description: "Update a Meta entity",
  inputSchema: z.object({
    entityId: z.string(),
    advertiserId: z.string().optional(),
    dry_run: z.boolean().optional(),
  }),
  annotations: {
    readOnlyHint: false,
    cesteral: {
      kind: "write",
      writeClass: "entity",
      platform: "meta_ads",
      contractPlatformSlug: "meta",
      contractToolSlug: "update_entity",
      operation: ["update"],
      entityKinds: ["campaign"],
      entityIdArgs: ["entityId"],
      executableArgsExclude: ["dry_run"],
      readPartner: { toolName: "meta_get_entity", argMap: { entityId: "entityId" } },
      schemaVersion: 1,
      contractId: CONTRACT_ID,
      supportsBeforeAfterSnapshot: true,
      requiresValidation: true,
      requiresSimulation: true,
    },
  },
  logic: vi.fn(),
};

const effectWriteTool = {
  name: "ttd_submit_report",
  description: "Submit a TTD report (effect-class write — no canonical snapshot)",
  inputSchema: z.object({
    reportId: z.string(),
    dry_run: z.boolean().optional(),
  }),
  annotations: {
    readOnlyHint: false,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      platform: "ttd",
      contractPlatformSlug: "ttd",
      contractToolSlug: "submit_report",
      operation: ["submit_report"],
      entityKinds: [],
      entityIdArgs: [],
      executableArgsExclude: ["dry_run"],
      schemaVersion: 1,
      contractId: "ttd.submit_report.v1",
      supportsBeforeAfterSnapshot: false,
      requiresValidation: false,
      requiresSimulation: false,
    },
  },
  logic: vi.fn(),
};

async function mintToken(args: Record<string, unknown>, over: Record<string, unknown> = {}) {
  const executable = canonicalizeExecutableArgs({ rawArgs: args, exclude: ["dry_run"] });
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: "cesteral-intelligence",
    aud: "mcp-open-advertising",
    sub: "tenant-1",
    contractId: CONTRACT_ID,
    definitionHash: DEF_HASH,
    actionHash: hashActionInput(executable),
    jti: `jti-${now}-${JSON.stringify(args)}`,
    iat: now - 5,
    exp: now + 3600,
    ...over,
  };
  return new jose.SignJWT(payload).setProtectedHeader({ alg: "HS256" }).sign(enc.encode(SECRET));
}

function register(opts: {
  env: Record<string, string | undefined>;
  jtiStore?: JtiStore;
  resolveDefinitionHash?: (n: string) => string | undefined;
  authContextResolver?: () => SessionAuthContext | undefined;
  server: ReturnType<typeof createMockServer>;
  logger: Logger;
}) {
  registerToolsFromDefinitions({
    server: opts.server,
    tools: [writeTool],
    logger: opts.logger,
    sessionId: "s1",
    transformSchema: (s) => s,
    createRequestContext: ({ operation }) => ({
      requestId: "req-1",
      timestamp: new Date().toISOString(),
      operation,
    }),
    governanceEnv: opts.env,
    jtiStore: opts.jtiStore,
    resolveDefinitionHash: opts.resolveDefinitionHash ?? (() => DEF_HASH),
    authContextResolver: opts.authContextResolver,
  });
}

function callWithToken(server: ReturnType<typeof createMockServer>, args: unknown, token?: string) {
  const ctx = createRequestContext("test");
  if (token) ctx.decisionToken = token;
  return runWithRequestContext(ctx, () => server.callTool("meta_update_entity", args));
}

// Effect-class parity helpers. Effect writes flow through the identical verify
// path as entity writes (Phase 3), so the token is constructed the same way —
// only the contractId and the effect fixture's executableArgsExclude differ.
async function mintEffectToken(args: Record<string, unknown>, over: Record<string, unknown> = {}) {
  const executable = canonicalizeExecutableArgs({
    rawArgs: args,
    exclude: effectWriteTool.annotations.cesteral.executableArgsExclude,
  });
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: "cesteral-intelligence",
    aud: "mcp-open-advertising",
    sub: "tenant-1",
    contractId: EFFECT_CONTRACT_ID,
    definitionHash: DEF_HASH,
    actionHash: hashActionInput(executable),
    jti: `jti-effect-${now}-${JSON.stringify(args)}`,
    iat: now - 5,
    exp: now + 3600,
    ...over,
  };
  return new jose.SignJWT(payload).setProtectedHeader({ alg: "HS256" }).sign(enc.encode(SECRET));
}

function registerEffect(opts: {
  env: Record<string, string | undefined>;
  jtiStore?: JtiStore;
  resolveDefinitionHash?: (n: string) => string | undefined;
  server: ReturnType<typeof createMockServer>;
  logger: Logger;
}) {
  registerToolsFromDefinitions({
    server: opts.server,
    tools: [effectWriteTool],
    logger: opts.logger,
    sessionId: "s1",
    transformSchema: (s) => s,
    createRequestContext: ({ operation }) => ({
      requestId: "req-1",
      timestamp: new Date().toISOString(),
      operation,
    }),
    governanceEnv: opts.env,
    jtiStore: opts.jtiStore,
    resolveDefinitionHash: opts.resolveDefinitionHash ?? (() => DEF_HASH),
  });
}

function callEffect(server: ReturnType<typeof createMockServer>, args: unknown, token?: string) {
  const ctx = createRequestContext("test");
  if (token) ctx.decisionToken = token;
  return runWithRequestContext(ctx, () => server.callTool("ttd_submit_report", args));
}

describe("tool-handler-factory governance verification", () => {
  let server: ReturnType<typeof createMockServer>;
  let logger: Logger;

  beforeEach(() => {
    server = createMockServer();
    logger = createMockLogger();
    writeTool.logic.mockReset();
    writeTool.logic.mockImplementation(async (_input, _ctx, _sdk) => ({ ok: true }));
    effectWriteTool.logic.mockReset();
    effectWriteTool.logic.mockImplementation(async (_input, _ctx, _sdk) => ({ ok: true }));
  });

  it("off mode: runs the write without any token", async () => {
    register({ env: {}, server, logger });
    const res = (await callWithToken(server, { entityId: "1" })) as { isError?: boolean };
    expect(res.isError).toBeUndefined();
    expect(writeTool.logic).toHaveBeenCalledOnce();
  });

  it("warn mode: missing token does NOT block the write", async () => {
    register({ env: { GOVERNANCE_TOKEN_MODE: "warn" }, server, logger });
    const res = (await callWithToken(server, { entityId: "1" })) as { isError?: boolean };
    expect(res.isError).toBeUndefined();
    expect(writeTool.logic).toHaveBeenCalledOnce();
  });

  it("enforce mode: missing token blocks the write (logic not called)", async () => {
    register({
      env: { GOVERNANCE_TOKEN_MODE: "enforce", GOVERNANCE_DECISION_TOKEN_SECRET: SECRET },
      server,
      logger,
    });
    const res = (await callWithToken(server, { entityId: "1" })) as {
      isError?: boolean;
      content: Array<{ text: string }>;
    };
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("MISSING_TOKEN");
    expect(writeTool.logic).not.toHaveBeenCalled();
  });

  it("enforce mode: valid token runs once, exposes jti as idempotencyKey, then replay is blocked", async () => {
    const jtiStore = new InMemoryJtiStore();
    register({
      env: { GOVERNANCE_TOKEN_MODE: "enforce", GOVERNANCE_DECISION_TOKEN_SECRET: SECRET },
      jtiStore,
      server,
      logger,
    });
    const args = { entityId: "1", dry_run: false };
    const token = await mintToken(args);

    let seenIdem: unknown;
    writeTool.logic.mockImplementation(async (_i, _c, sdk: { idempotencyKey?: string }) => {
      seenIdem = sdk.idempotencyKey;
      return { ok: true };
    });

    const res = (await callWithToken(server, args, token)) as { isError?: boolean };
    expect(res.isError).toBeUndefined();
    expect(writeTool.logic).toHaveBeenCalledOnce();
    expect(typeof seenIdem).toBe("string");

    // Replay the exact same token → blocked.
    const replay = (await callWithToken(server, args, token)) as {
      isError?: boolean;
      content: Array<{ text: string }>;
    };
    expect(replay.isError).toBe(true);
    expect(replay.content[0].text).toContain("REPLAYED_JTI");
    expect(writeTool.logic).toHaveBeenCalledOnce();
  });

  it("enforce mode: missing definition-hash resolver fails closed", async () => {
    register({
      env: { GOVERNANCE_TOKEN_MODE: "enforce", GOVERNANCE_DECISION_TOKEN_SECRET: SECRET },
      resolveDefinitionHash: () => undefined,
      server,
      logger,
    });
    const token = await mintToken({ entityId: "1" });
    const res = (await callWithToken(server, { entityId: "1" }, token)) as {
      isError?: boolean;
      content: Array<{ text: string }>;
    };
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/definition hash unavailable/i);
    expect(writeTool.logic).not.toHaveBeenCalled();
  });

  it("warn mode: a throwing jti store does NOT block the write (JTI_STORE_ERROR surfaced, not thrown)", async () => {
    // Regression: verifyDecisionToken must never let a jti-store outage escape.
    // Under warn, the write proceeds; a bad verdict is logged, not enforced.
    const jtiStore = {
      consumeOnce: vi.fn(async () => {
        const err = new Error("UNAVAILABLE") as Error & { code: number };
        err.code = 14;
        throw err;
      }),
    };
    register({
      env: { GOVERNANCE_TOKEN_MODE: "warn", GOVERNANCE_DECISION_TOKEN_SECRET: SECRET },
      jtiStore,
      server,
      logger,
    });
    const args = { entityId: "1", dry_run: false };
    const token = await mintToken(args);
    const res = (await callWithToken(server, args, token)) as { isError?: boolean };
    expect(res.isError).toBeUndefined();
    expect(writeTool.logic).toHaveBeenCalledOnce();
    expect(jtiStore.consumeOnce).toHaveBeenCalledOnce();
  });

  it("enforce mode: a throwing jti store fails closed (JTI_STORE_ERROR blocks the write)", async () => {
    const jtiStore = {
      consumeOnce: vi.fn(async () => {
        const err = new Error("UNAVAILABLE") as Error & { code: number };
        err.code = 14;
        throw err;
      }),
    };
    register({
      env: { GOVERNANCE_TOKEN_MODE: "enforce", GOVERNANCE_DECISION_TOKEN_SECRET: SECRET },
      jtiStore,
      server,
      logger,
    });
    const args = { entityId: "1", dry_run: false };
    const token = await mintToken(args);
    const res = (await callWithToken(server, args, token)) as {
      isError?: boolean;
      content: Array<{ text: string }>;
    };
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("JTI_STORE_ERROR");
    expect(writeTool.logic).not.toHaveBeenCalled();
  });

  it("enforce mode: missing secret fails closed (SECRET_UNCONFIGURED)", async () => {
    // resolver present (default), but GOVERNANCE_DECISION_TOKEN_SECRET unset.
    register({ env: { GOVERNANCE_TOKEN_MODE: "enforce" }, server, logger });
    const token = await mintToken({ entityId: "1" });
    const res = (await callWithToken(server, { entityId: "1" }, token)) as {
      isError?: boolean;
      content: Array<{ text: string }>;
    };
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("SECRET_UNCONFIGURED");
    expect(writeTool.logic).not.toHaveBeenCalled();
  });

  it("warns at registration when enforce resolves with no injected jti store", () => {
    register({
      env: { GOVERNANCE_TOKEN_MODE: "enforce", GOVERNANCE_DECISION_TOKEN_SECRET: SECRET },
      server,
      logger,
    });
    const warn = (logger.warn as unknown as { mock: { calls: unknown[][] } }).mock;
    const hit = warn.calls.some(
      ([obj]) => (obj as { jtiStore?: string })?.jtiStore === "in-memory"
    );
    expect(hit).toBe(true);
  });

  it("does NOT warn at registration when a jti store is injected", () => {
    register({
      env: { GOVERNANCE_TOKEN_MODE: "enforce", GOVERNANCE_DECISION_TOKEN_SECRET: SECRET },
      jtiStore: new InMemoryJtiStore(),
      server,
      logger,
    });
    const warn = (logger.warn as unknown as { mock: { calls: unknown[][] } }).mock;
    const hit = warn.calls.some(
      ([obj]) => (obj as { jtiStore?: string })?.jtiStore === "in-memory"
    );
    expect(hit).toBe(false);
  });

  // P3: enforce + in-memory fallback fails closed on a hosted deployment.
  it("P3: THROWS at registration on a hosted (K_SERVICE) deployment with enforce + in-memory store", () => {
    expect(() =>
      register({
        env: {
          GOVERNANCE_TOKEN_MODE: "enforce",
          GOVERNANCE_DECISION_TOKEN_SECRET: SECRET,
          K_SERVICE: "meta-mcp",
        },
        server,
        logger,
      })
    ).toThrow(/jti-store misconfiguration/i);
  });

  it("P3: THROWS when GOVERNANCE_JTI_STORE=firestore is declared but never wired into the factory", () => {
    expect(() =>
      register({
        env: {
          GOVERNANCE_TOKEN_MODE: "enforce",
          GOVERNANCE_DECISION_TOKEN_SECRET: SECRET,
          GOVERNANCE_JTI_STORE: "firestore",
        },
        server,
        logger,
      })
    ).toThrow(/never wired/i);
  });

  it("P3: the opt-out downgrades the hosted throw to a warn (deliberate single instance)", () => {
    expect(() =>
      register({
        env: {
          GOVERNANCE_TOKEN_MODE: "enforce",
          GOVERNANCE_DECISION_TOKEN_SECRET: SECRET,
          K_SERVICE: "meta-mcp",
          GOVERNANCE_ALLOW_INMEMORY_JTI_UNDER_ENFORCE: "true",
        },
        server,
        logger,
      })
    ).not.toThrow();
    const warn = (logger.warn as unknown as { mock: { calls: unknown[][] } }).mock;
    expect(
      warn.calls.some(([obj]) => (obj as { jtiStore?: string })?.jtiStore === "in-memory")
    ).toBe(true);
  });

  it("P3: hosted + injected distributed store is OK (no throw, no in-memory warn)", () => {
    expect(() =>
      register({
        env: {
          GOVERNANCE_TOKEN_MODE: "enforce",
          GOVERNANCE_DECISION_TOKEN_SECRET: SECRET,
          K_SERVICE: "meta-mcp",
        },
        jtiStore: new InMemoryJtiStore(),
        server,
        logger,
      })
    ).not.toThrow();
    const warn = (logger.warn as unknown as { mock: { calls: unknown[][] } }).mock;
    expect(
      warn.calls.some(([obj]) => (obj as { jtiStore?: string })?.jtiStore === "in-memory")
    ).toBe(false);
  });

  describe("evaluateJtiStoreEnforcementSafety (pure)", () => {
    it("ok when not enforcing", () => {
      expect(
        evaluateJtiStoreEnforcementSafety({ anyEnforce: false, storeInjected: false, env: {} })
      ).toEqual({
        action: "ok",
      });
    });
    it("ok when a store was injected", () => {
      expect(
        evaluateJtiStoreEnforcementSafety({
          anyEnforce: true,
          storeInjected: true,
          env: { K_SERVICE: "x" },
        })
      ).toEqual({ action: "ok" });
    });
    it("warn for stdio / self-host (no hosted signal, no firestore declared)", () => {
      const r = evaluateJtiStoreEnforcementSafety({
        anyEnforce: true,
        storeInjected: false,
        env: {},
      });
      expect(r.action).toBe("warn");
    });
    it("throw on hosted", () => {
      const r = evaluateJtiStoreEnforcementSafety({
        anyEnforce: true,
        storeInjected: false,
        env: { K_SERVICE: "svc" },
      });
      expect(r.action).toBe("throw");
    });
    it("throw when firestore declared but unwired", () => {
      const r = evaluateJtiStoreEnforcementSafety({
        anyEnforce: true,
        storeInjected: false,
        env: { GOVERNANCE_JTI_STORE: "firestore" },
      });
      expect(r.action).toBe("throw");
    });
    it("opt-out downgrades throw to warn", () => {
      const r = evaluateJtiStoreEnforcementSafety({
        anyEnforce: true,
        storeInjected: false,
        env: { K_SERVICE: "svc", GOVERNANCE_ALLOW_INMEMORY_JTI_UNDER_ENFORCE: "true" },
      });
      expect(r.action).toBe("warn");
    });
  });

  it("warns at registration when every governed write resolves to token mode 'off' (issue #102)", () => {
    // Default deploy sets no GOVERNANCE_TOKEN_MODE* tier, so the lone governed
    // write resolves to `off` and ships ungoverned. The fail-open must not be
    // silent — a single `token_mode_summary` warn surfaces it at boot.
    register({ env: {}, server, logger });
    const warn = (logger.warn as unknown as { mock: { calls: unknown[][] } }).mock;
    const summary = warn.calls
      .map(([obj]) => obj as { event?: string; ungoverned?: number; gated?: number })
      .find((o) => o?.event === "token_mode_summary");
    expect(summary).toBeDefined();
    expect(summary?.gated).toBe(0);
    expect(summary?.ungoverned).toBe(1);
  });

  it("does NOT fail-open warn when a governed write is gated — logs an info summary instead (issue #102)", () => {
    register({
      env: { GOVERNANCE_TOKEN_MODE: "enforce", GOVERNANCE_DECISION_TOKEN_SECRET: SECRET },
      jtiStore: new InMemoryJtiStore(),
      server,
      logger,
    });
    const warn = (logger.warn as unknown as { mock: { calls: unknown[][] } }).mock;
    const warnedSummary = warn.calls.some(
      ([obj]) => (obj as { event?: string })?.event === "token_mode_summary"
    );
    expect(warnedSummary).toBe(false);
    const info = (logger.info as unknown as { mock: { calls: unknown[][] } }).mock;
    const infoSummary = info.calls
      .map(([obj]) => obj as { event?: string; gated?: number })
      .find((o) => o?.event === "token_mode_summary");
    expect(infoSummary).toBeDefined();
    expect(infoSummary?.gated).toBe(1);
  });

  // ── Effect-class parity (Phase 3) ──
  // Effect writes are now token-governed identically to entity writes. The
  // forced-`off` override is gone, so effect contracts flow through the same
  // verify path: off=no-op, warn=verify-but-never-block, enforce=block on a
  // bad verdict. These mirror the entity tests above.

  it("enforce mode (effect): valid token runs once, exposes jti as idempotencyKey, replay blocked", async () => {
    const jtiStore = new InMemoryJtiStore();
    registerEffect({
      env: { GOVERNANCE_TOKEN_MODE: "enforce", GOVERNANCE_DECISION_TOKEN_SECRET: SECRET },
      jtiStore,
      server,
      logger,
    });
    const args = { reportId: "r1", dry_run: false };
    const token = await mintEffectToken(args);

    let seenIdem: unknown;
    effectWriteTool.logic.mockImplementation(async (_i, _c, sdk: { idempotencyKey?: string }) => {
      seenIdem = sdk.idempotencyKey;
      return { ok: true };
    });

    const res = (await callEffect(server, args, token)) as { isError?: boolean };
    expect(res.isError).toBeUndefined();
    expect(effectWriteTool.logic).toHaveBeenCalledOnce();
    expect(typeof seenIdem).toBe("string");

    // Replay the exact same token → blocked.
    const replay = (await callEffect(server, args, token)) as {
      isError?: boolean;
      content: Array<{ text: string }>;
    };
    expect(replay.isError).toBe(true);
    expect(replay.content[0].text).toContain("REPLAYED_JTI");
    expect(effectWriteTool.logic).toHaveBeenCalledOnce();
  });

  it("enforce mode (effect): missing token blocks the write (logic not called)", async () => {
    registerEffect({
      env: { GOVERNANCE_TOKEN_MODE: "enforce", GOVERNANCE_DECISION_TOKEN_SECRET: SECRET },
      server,
      logger,
    });
    const res = (await callEffect(server, { reportId: "r1" })) as {
      isError?: boolean;
      content: Array<{ text: string }>;
    };
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("MISSING_TOKEN");
    expect(effectWriteTool.logic).not.toHaveBeenCalled();
  });

  it("enforce mode (effect): invalid token (action-hash mismatch) blocks the write", async () => {
    registerEffect({
      env: { GOVERNANCE_TOKEN_MODE: "enforce", GOVERNANCE_DECISION_TOKEN_SECRET: SECRET },
      server,
      logger,
    });
    // Token minted for a different reportId → actionHash will not match.
    const token = await mintEffectToken({ reportId: "OTHER", dry_run: false });
    const res = (await callEffect(server, { reportId: "r1", dry_run: false }, token)) as {
      isError?: boolean;
      content: Array<{ text: string }>;
    };
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("ACTION_HASH_MISMATCH");
    expect(effectWriteTool.logic).not.toHaveBeenCalled();
  });

  it("warn mode (effect): missing token does NOT block the write + logs verdict", async () => {
    registerEffect({
      env: { GOVERNANCE_TOKEN_MODE: "warn", GOVERNANCE_DECISION_TOKEN_SECRET: SECRET },
      server,
      logger,
    });
    const res = (await callEffect(server, { reportId: "r1" })) as { isError?: boolean };
    expect(res.isError).toBeUndefined();
    expect(effectWriteTool.logic).toHaveBeenCalledOnce();
    // A verdict was logged (warn never blocks, but it does verify + record).
    const warn = (logger.warn as unknown as { mock: { calls: unknown[][] } }).mock;
    const logged = warn.calls.some(
      ([obj]) =>
        (obj as { event?: string })?.event === "decision_token_verification" &&
        (obj as { contractId?: string })?.contractId === EFFECT_CONTRACT_ID
    );
    expect(logged).toBe(true);
  });

  it("warn mode (effect): valid token is verified and the write runs", async () => {
    registerEffect({
      env: { GOVERNANCE_TOKEN_MODE: "warn", GOVERNANCE_DECISION_TOKEN_SECRET: SECRET },
      server,
      logger,
    });
    const args = { reportId: "r1", dry_run: false };
    const token = await mintEffectToken(args);
    const res = (await callEffect(server, args, token)) as { isError?: boolean };
    expect(res.isError).toBeUndefined();
    expect(effectWriteTool.logic).toHaveBeenCalledOnce();
  });

  it("authz denial happens before jti consume (valid token not burned)", async () => {
    const jtiStore = { consumeOnce: vi.fn(async () => "fresh" as const) };
    register({
      env: { GOVERNANCE_TOKEN_MODE: "enforce", GOVERNANCE_DECISION_TOKEN_SECRET: SECRET },
      jtiStore,
      authContextResolver: () => ({
        authInfo: { clientId: "c", authType: "test" },
        allowedAdvertisers: ["999"],
      }),
      server,
      logger,
    });
    // advertiserId "1" is not in the allowed advertiser scope → denied at authz.
    const token = await mintToken({ entityId: "1" });
    const res = (await callWithToken(server, { entityId: "1", advertiserId: "1" }, token)) as {
      isError?: boolean;
    };
    expect(res.isError).toBe(true);
    expect(jtiStore.consumeOnce).not.toHaveBeenCalled();
    expect(writeTool.logic).not.toHaveBeenCalled();
  });
});
