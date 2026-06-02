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

import { registerToolsFromDefinitions } from "../../src/utils/tool-handler-factory.js";
import { runWithRequestContext, createRequestContext } from "../../src/utils/request-context.js";
import { InMemoryJtiStore } from "../../src/index.js";
import type { JtiStore } from "../../src/index.js";
import type { SessionAuthContext } from "../../src/auth/auth-strategy.js";
import type { Logger } from "pino";

const SECRET = "test-secret-cluster3-aaaaaaaaaaaaaaaaa";
const DEF_HASH = "a".repeat(64);
const CONTRACT_ID = "meta.update_entity.v1";
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

describe("tool-handler-factory governance verification", () => {
  let server: ReturnType<typeof createMockServer>;
  let logger: Logger;

  beforeEach(() => {
    server = createMockServer();
    logger = createMockLogger();
    writeTool.logic.mockReset();
    writeTool.logic.mockImplementation(async (_input, _ctx, _sdk) => ({ ok: true }));
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
