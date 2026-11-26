// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * B6, "a governance approval is the confirmation"
 * (docs/plans/2026-11-25-url-elicitation-governance-approval.md).
 *
 * The Intelligence gateway calls connectors through an MCP client with no
 * elicitation capability, also when it executes a write a person approved in
 * governance. `confirmDestructive` refused every irreversible operation there.
 * Now a decision token that verified on this call and names an `approvalId` is
 * the confirmation: its `actionHash` binds the exact executable args and
 * contract, and its `jti` is consumed once.
 *
 * Driven through the real factory on both eras: the SDK's `createMcpHandler`
 * for 2026-07-28 (as `confirmation-rounds.test.ts`) and the real streamable-HTTP
 * transport on a socket for 2025-06-18 (as `related-request-wire.test.ts`),
 * where the token rides the `X-Cesteral-Decision-Token` header.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import type { AddressInfo } from "node:net";
import pino from "pino";
import { z } from "zod";
import * as jose from "jose";
import { hashActionInput, canonicalizeExecutableArgs } from "@cesteral/contract-hash";
import {
  McpServer,
  createMcpHandler,
  PROTOCOL_VERSION_META_KEY,
  CLIENT_INFO_META_KEY,
  CLIENT_CAPABILITIES_META_KEY,
} from "@modelcontextprotocol/server";
import {
  registerToolsFromDefinitions,
  type ToolDefinitionForFactory,
  type ToolSdkContext,
} from "../../src/utils/mcp/tool-handler-factory.js";
import { extractZodShape } from "../../src/utils/mcp/zod-helpers.js";
import {
  elicitDeleteConfirmation,
  elicitBulkStatusChangeConfirmation,
} from "../../src/utils/mcp/elicitation-helpers.js";
import { NO_UNTRUSTED_CONTENT } from "../../src/utils/mcp/untrusted-content.js";
import {
  runWithRequestContext,
  createRequestContext,
} from "../../src/utils/observability/request-context.js";
import { InMemoryJtiStore } from "../../src/index.js";
import {
  startMcpHttpServer,
  type McpHttpServer,
  type TransportFactoryConfig,
  type TransportFactoryAppConfig,
} from "../../src/utils/transport/mcp-http-transport-factory.js";
import { SessionServiceStore } from "../../src/utils/transport/session-store.js";
import { NoAuthStrategy } from "../../src/auth/auth-strategy.js";

const SECRET = "decision-secret-for-approval-tests-aaaaaaa";
const WRONG_SECRET = "some-other-secret-entirely-aaaaaaaaaaaaaa";
const STATE_ENV = { MCP_REQUEST_STATE_SECRET: "request-state-secret-for-tests-0123456789" };
const FORM = { elicitation: { form: {} } };
const CONTRACT = "meta.update_entity.v1";
const DEFINITION_HASH = "a".repeat(64);

const ENFORCE = { GOVERNANCE_TOKEN_MODE: "enforce", GOVERNANCE_DECISION_TOKEN_SECRET: SECRET };
const WARN = { GOVERNANCE_TOKEN_MODE: "warn", GOVERNANCE_DECISION_TOKEN_SECRET: SECRET };
const OFF = { GOVERNANCE_TOKEN_MODE: "off", GOVERNANCE_DECISION_TOKEN_SECRET: SECRET };

/** The platform writes the tools made, in order. */
let writes: string[] = [];

const cesteral = {
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
  contractId: CONTRACT,
  supportsBeforeAfterSnapshot: true,
  requiresValidation: true,
  requiresSimulation: true,
};

const inputSchema = z.object({ entityId: z.string(), dry_run: z.boolean().optional() });

/** An irreversible governed write. Confirms even on a dry run, to pin that a dry run never skips. */
const deleteTool: ToolDefinitionForFactory = {
  name: "gov_delete",
  description: "Governed hard delete, confirmed before it writes.",
  untrustedContent: NO_UNTRUSTED_CONTENT,
  inputSchema,
  annotations: { readOnlyHint: false, destructiveHint: true, cesteral },
  logic: async (input: { entityId: string }, _ctx: unknown, sdk?: ToolSdkContext) => {
    const confirmed = await elicitDeleteConfirmation({
      entityLabel: "campaign",
      entityId: input.entityId,
      sdkContext: sdk,
    });
    if (confirmed) writes.push(`delete:${input.entityId}`);
    return { confirmed };
  },
  responseFormatter: (r: { confirmed: boolean }) => [
    { type: "text" as const, text: `confirmed=${r.confirmed}` },
  ],
};

/** A reversible governed write (bulk status change). */
const statusTool: ToolDefinitionForFactory = {
  ...deleteTool,
  name: "gov_status",
  logic: async (input: { entityId: string }, _ctx: unknown, sdk?: ToolSdkContext) => {
    const confirmed = await elicitBulkStatusChangeConfirmation({
      count: 3,
      entityLabel: "ad",
      targetStatus: "PAUSED",
      irreversible: false,
      sdkContext: sdk,
    });
    if (confirmed) writes.push(`status:${input.entityId}`);
    return { confirmed };
  },
};

/**
 * Asks for a missing value the way `ensureRequiredFieldValue` (dv360-mcp) does:
 * straight through `sdkContext.elicitInput`. A governance approval is not a value.
 */
const fieldTool: ToolDefinitionForFactory = {
  ...deleteTool,
  name: "gov_field",
  logic: async (input: { entityId: string }, _ctx: unknown, sdk?: ToolSdkContext) => {
    if (!sdk?.elicitInput) return { confirmed: false };
    const answer = (await sdk.elicitInput({
      message: "Display name is required.",
      requestedSchema: {
        type: "object",
        properties: { displayName: { type: "string", title: "Display name" } },
        required: ["displayName"],
      },
    })) as { action: string };
    writes.push(`field:${input.entityId}`);
    return { confirmed: answer.action === "accept" };
  },
};

const TOOLS = [deleteTool, statusTool, fieldTool];

async function mint(
  args: Record<string, unknown>,
  opts: { jti: string; approvalId?: string; secret?: string }
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new jose.SignJWT({
    iss: "cesteral-intelligence",
    aud: "mcp-open-advertising",
    sub: "tenant-1",
    contractId: CONTRACT,
    definitionHash: DEFINITION_HASH,
    actionHash: hashActionInput(
      canonicalizeExecutableArgs({ rawArgs: args, exclude: ["dry_run"] })
    ),
    jti: opts.jti,
    ...(opts.approvalId !== undefined && { approvalId: opts.approvalId }),
    iat: now - 5,
    exp: now + 3600,
  })
    .setProtectedHeader({ alg: "HS256" })
    .sign(new TextEncoder().encode(opts.secret ?? SECRET));
}

interface Fixture {
  jtiStore: InMemoryJtiStore;
  logger: pino.Logger;
  lines: Array<Record<string, any>>;
  governance: Record<string, string>;
}

function fixture(governance: Record<string, string>): Fixture {
  const lines: Array<Record<string, any>> = [];
  const logger = pino(
    { level: "info" },
    { write: (s: string) => void lines.push(JSON.parse(s) as Record<string, any>) }
  );
  return { jtiStore: new InMemoryJtiStore(), logger, lines, governance };
}

const audits = (f: Fixture) => f.lines.filter((l) => l.event === "destructive_confirmation");

function register(server: McpServer, f: Fixture, sessionId: string): void {
  registerToolsFromDefinitions({
    server: server as never,
    tools: TOOLS,
    logger: f.logger,
    sessionId,
    transformSchema: (s) => extractZodShape(s),
    createRequestContext: ({ operation }) => ({
      requestId: `req-${Math.random().toString(16).slice(2)}`,
      timestamp: new Date().toISOString(),
      operation,
    }),
    jtiStore: f.jtiStore,
    governanceEnv: f.governance,
    resolveManifestEntry: () => ({ definitionHash: DEFINITION_HASH }),
    requestStateEnv: STATE_ENV,
  });
}

let savedElicitEnv: string | undefined;
beforeEach(() => {
  writes = [];
  savedElicitEnv = process.env.MCP_ELICIT_DESTRUCTIVE;
  delete process.env.MCP_ELICIT_DESTRUCTIVE;
});
afterEach(() => {
  if (savedElicitEnv === undefined) delete process.env.MCP_ELICIT_DESTRUCTIVE;
  else process.env.MCP_ELICIT_DESTRUCTIVE = savedElicitEnv;
});

// ── 2026-07-28: the SDK's stateless handler ─────────────────────────────────

const PROTOCOL = "2026-07-28";
let nextId = 1;

async function call(
  f: Fixture,
  name: string,
  args: Record<string, unknown>,
  opts: { capabilities?: Record<string, unknown>; decisionToken?: string } = {}
): Promise<Record<string, any>> {
  const handler = createMcpHandler(() => {
    const server = new McpServer(
      { name: "approval-probe", version: "0.0.0" },
      { capabilities: { logging: {} } }
    );
    register(server, f, "principal-a");
    return server;
  });
  const ctx = createRequestContext("test");
  if (opts.decisionToken) ctx.decisionToken = opts.decisionToken;
  const id = nextId++;
  const res = await runWithRequestContext(ctx, () =>
    handler.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-method": "tools/call",
          "mcp-name": name,
          "mcp-protocol-version": PROTOCOL,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id,
          method: "tools/call",
          params: {
            name,
            arguments: args,
            _meta: {
              [PROTOCOL_VERSION_META_KEY]: PROTOCOL,
              [CLIENT_INFO_META_KEY]: { name: "gateway", version: "0.0.0" },
              // The gateway's client declares no elicitation capability.
              [CLIENT_CAPABILITIES_META_KEY]: opts.capabilities ?? {},
            },
          },
        }),
      })
    )
  );
  const text = await res.text();
  const payloads = res.headers.get("content-type")?.includes("text/event-stream")
    ? text
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
    : [text];
  const reply = payloads
    .filter(Boolean)
    .map((p) => JSON.parse(p) as Record<string, any>)
    .find((m) => m.id === id);
  if (!reply) throw new Error(`no reply to ${id}: ${text}`);
  return reply;
}

const resultText = (reply: Record<string, any>): string =>
  (reply.result?.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");

describe("B6 on a 2026-07-28 request: a verified governance approval is the confirmation", () => {
  it("no elicitation capability: an approved irreversible write runs, with one approved_by_governance record", async () => {
    const f = fixture(ENFORCE);
    const args = { entityId: "1" };
    const token = await mint(args, { jti: "jti-a1", approvalId: "appr-a1" });

    const reply = await call(f, "gov_delete", args, { decisionToken: token });
    expect(reply.error).toBeUndefined();
    expect(resultText(reply)).toContain("confirmed=true");
    expect(writes).toEqual(["delete:1"]);

    const recs = audits(f);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({
      component: "governance-audit",
      outcome: "approved_by_governance",
      irreversible: true,
      toolName: "gov_delete",
      jti: "jti-a1",
      approvalId: "appr-a1",
    });
    expect(JSON.stringify(f.lines)).not.toContain(token);

    // The approval runs once: the same token again is a replay, and writes nothing.
    const replay = await call(f, "gov_delete", args, { decisionToken: token });
    expect(resultText(replay)).toContain("REPLAYED_JTI");
    expect(writes).toEqual(["delete:1"]);
    expect(audits(f)).toHaveLength(1);
  });

  it("an elicitation-capable client gets no prompt for the same approval", async () => {
    const f = fixture(ENFORCE);
    const args = { entityId: "2" };
    const token = await mint(args, { jti: "jti-a2", approvalId: "appr-a2" });

    const reply = await call(f, "gov_delete", args, { decisionToken: token, capabilities: FORM });
    expect(reply.result.resultType).not.toBe("input_required");
    expect(reply.result.inputRequests).toBeUndefined();
    expect(resultText(reply)).toContain("confirmed=true");
    expect(writes).toEqual(["delete:2"]);
    expect(audits(f).map((r) => r.outcome)).toEqual(["approved_by_governance"]);
  });

  it("a reversible write is approved the same way", async () => {
    const f = fixture(ENFORCE);
    const args = { entityId: "3" };
    const token = await mint(args, { jti: "jti-a3", approvalId: "appr-a3" });
    const reply = await call(f, "gov_status", args, { decisionToken: token, capabilities: FORM });
    expect(resultText(reply)).toContain("confirmed=true");
    expect(writes).toEqual(["status:3"]);
    expect(audits(f)).toMatchObject([{ outcome: "approved_by_governance", irreversible: false }]);
  });

  it("warn mode: a token that verifies with an approvalId is honoured too", async () => {
    const f = fixture(WARN);
    const args = { entityId: "4" };
    const token = await mint(args, { jti: "jti-a4", approvalId: "appr-a4" });
    const reply = await call(f, "gov_delete", args, { decisionToken: token });
    expect(resultText(reply)).toContain("confirmed=true");
    expect(writes).toEqual(["delete:4"]);
    expect(audits(f).map((r) => r.outcome)).toEqual(["approved_by_governance"]);
  });

  it("MCP_ELICIT_DESTRUCTIVE=skip is still evaluated first", async () => {
    process.env.MCP_ELICIT_DESTRUCTIVE = "skip";
    const f = fixture(ENFORCE);
    const args = { entityId: "5" };
    const token = await mint(args, { jti: "jti-a5", approvalId: "appr-a5" });
    await call(f, "gov_delete", args, { decisionToken: token });
    expect(audits(f).map((r) => r.outcome)).toEqual(["skipped_by_env"]);
  });
});

describe("B6 on a 2026-07-28 request: what does NOT count as an approval", () => {
  /** Refused with no channel, asked with one: today's behaviour, no skip. */
  async function expectNoSkip(
    governance: Record<string, string>,
    args: Record<string, unknown>,
    tokenFor: () => Promise<string | undefined>
  ): Promise<void> {
    const none = fixture(governance);
    const refused = await call(none, "gov_delete", args, { decisionToken: await tokenFor() });
    expect(resultText(refused)).toContain("confirmed=false");
    expect(audits(none).map((r) => r.outcome)).toEqual(["refused_no_channel"]);

    const form = fixture(governance);
    const asked = await call(form, "gov_delete", args, {
      decisionToken: await tokenFor(),
      capabilities: FORM,
    });
    expect(asked.result.resultType).toBe("input_required");
    expect(audits(form)).toHaveLength(0);
    expect(writes).toEqual([]);
  }

  it("no token (warn mode)", async () => {
    await expectNoSkip(WARN, { entityId: "10" }, async () => undefined);
  });

  it("no token (enforce mode) is rejected before any confirmation", async () => {
    const f = fixture(ENFORCE);
    const reply = await call(f, "gov_delete", { entityId: "11" });
    expect(resultText(reply)).toContain("MISSING_TOKEN");
    expect(writes).toEqual([]);
    expect(audits(f)).toHaveLength(0);
  });

  it("a verified token without approvalId (a machine caller admitted by policy)", async () => {
    const args = { entityId: "12" };
    let n = 0;
    await expectNoSkip(ENFORCE, args, () => mint(args, { jti: `jti-machine-${n++}` }));
  });

  it("a verified token with an empty approvalId", async () => {
    const args = { entityId: "13" };
    let n = 0;
    await expectNoSkip(ENFORCE, args, () =>
      mint(args, { jti: `jti-empty-${n++}`, approvalId: "" })
    );
  });

  it("warn mode, an approved token that fails verification (bad signature)", async () => {
    const args = { entityId: "14" };
    let n = 0;
    await expectNoSkip(WARN, args, () =>
      mint(args, { jti: `jti-badsig-${n++}`, approvalId: "appr-bad", secret: WRONG_SECRET })
    );
  });

  it("enforce mode, an approved token that fails verification is rejected and writes nothing", async () => {
    const f = fixture(ENFORCE);
    const args = { entityId: "15" };
    const token = await mint(args, {
      jti: "jti-badsig-enf",
      approvalId: "appr-bad",
      secret: WRONG_SECRET,
    });
    const reply = await call(f, "gov_delete", args, { decisionToken: token });
    expect(resultText(reply)).toMatch(/decision token rejected/i);
    expect(writes).toEqual([]);
    expect(audits(f)).toHaveLength(0);
  });

  it("warn mode, a token approved for different args does not verify: asked or refused", async () => {
    let n = 0;
    await expectNoSkip(WARN, { entityId: "16" }, () =>
      mint({ entityId: "OTHER" }, { jti: `jti-other-${n++}`, approvalId: "appr-other" })
    );
  });

  it("enforce mode, a token approved for different args is rejected", async () => {
    const f = fixture(ENFORCE);
    const token = await mint({ entityId: "OTHER" }, { jti: "jti-other-enf", approvalId: "appr-o" });
    const reply = await call(f, "gov_delete", { entityId: "17" }, { decisionToken: token });
    expect(resultText(reply)).toMatch(/decision token rejected/i);
    expect(writes).toEqual([]);
  });

  it("token mode off: nothing is verified, so nothing is approved", async () => {
    const args = { entityId: "18" };
    let n = 0;
    await expectNoSkip(OFF, args, () =>
      mint(args, { jti: `jti-off-${n++}`, approvalId: "appr-off" })
    );
  });

  it("a dry run never counts as approved: with a channel it is a hard error, not a skip", async () => {
    const f = fixture(ENFORCE);
    // `dry_run` is excluded from the executable args, so this token verifies.
    const token = await mint({ entityId: "19" }, { jti: "jti-dry-1", approvalId: "appr-dry" });
    const reply = await call(
      f,
      "gov_delete",
      { entityId: "19", dry_run: true },
      { decisionToken: token, capabilities: FORM }
    );
    expect(reply.result.isError).toBe(true);
    expect(resultText(reply)).toContain("dry run must not ask");
    expect(writes).toEqual([]);
    expect(audits(f).some((r) => r.outcome === "approved_by_governance")).toBe(false);
  });

  it("a dry run never counts as approved: with no channel it is refused", async () => {
    const f = fixture(ENFORCE);
    const token = await mint({ entityId: "20" }, { jti: "jti-dry-2", approvalId: "appr-dry" });
    const reply = await call(
      f,
      "gov_delete",
      { entityId: "20", dry_run: true },
      { decisionToken: token }
    );
    expect(resultText(reply)).toContain("confirmed=false");
    expect(writes).toEqual([]);
    expect(audits(f).map((r) => r.outcome)).toEqual(["refused_no_channel"]);
  });

  it("field elicitation still asks: a missing value is not a confirmation", async () => {
    const f = fixture(ENFORCE);
    const args = { entityId: "21" };
    const token = await mint(args, { jti: "jti-field", approvalId: "appr-field" });
    const reply = await call(f, "gov_field", args, { decisionToken: token, capabilities: FORM });
    expect(reply.result.resultType).toBe("input_required");
    expect(JSON.stringify(reply.result.inputRequests)).toContain("Display name is required.");
    expect(writes).toEqual([]);
  });
});

// ── 2025-06-18: the real streamable-HTTP transport, token in the header ──────

const PROTO_2025 = "2025-06-18";
const READ_TIMEOUT_MS = 3_000;

type JsonRpc = {
  jsonrpc: "2.0";
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: unknown;
};

/** Incremental SSE reader over one POST response body. */
class SseReader {
  private buffer = "";
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private readonly decoder = new TextDecoder();
  readonly received: JsonRpc[] = [];
  private pending: JsonRpc[] = [];

  constructor(res: Response) {
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
    this.reader = res.body!.getReader();
  }

  async until(match: (m: JsonRpc) => boolean): Promise<JsonRpc> {
    const deadline = Date.now() + READ_TIMEOUT_MS;
    for (;;) {
      const found = this.drain(match);
      if (found) return found;
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(
          `timed out; received ${JSON.stringify(this.received.map((m) => m.method ?? m.id))}`
        );
      }
      let timer: NodeJS.Timeout | undefined;
      const chunk = await Promise.race([
        this.reader.read(),
        new Promise<"timeout">((resolve) => {
          timer = setTimeout(() => resolve("timeout"), remaining);
        }),
      ]);
      clearTimeout(timer);
      if (chunk === "timeout") continue;
      if (chunk.done) {
        const last = this.drain(match);
        if (last) return last;
        throw new Error("stream ended");
      }
      this.buffer += this.decoder.decode(chunk.value, { stream: true });
    }
  }

  private drain(match: (m: JsonRpc) => boolean): JsonRpc | undefined {
    let idx: number;
    while ((idx = this.buffer.indexOf("\n\n")) !== -1) {
      const data = this.buffer
        .slice(0, idx)
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      this.buffer = this.buffer.slice(idx + 2);
      if (!data) continue;
      const msg = JSON.parse(data) as JsonRpc;
      this.received.push(msg);
      this.pending.push(msg);
    }
    const i = this.pending.findIndex(match);
    if (i === -1) return undefined;
    const [hit] = this.pending.splice(i, 1);
    return hit;
  }

  async cancel(): Promise<void> {
    await this.reader.cancel().catch(() => {});
  }
}

describe("B6 on a 2025-era connection (real transport, header token)", () => {
  let http: McpHttpServer;
  let baseUrl: string;
  /** The fixture the next session's server registers its tools with. */
  let current: Fixture;

  beforeAll(async () => {
    const silent = pino({ level: "silent" });
    const store = new SessionServiceStore<Record<string, never>>(100);
    const platformConfig: TransportFactoryConfig = {
      authStrategy: new NoAuthStrategy(),
      corsAllowHeaders: ["Content-Type", "Mcp-Session-Id"],
      authErrorHint: "none",
      sessionServiceStore: store as unknown as TransportFactoryConfig["sessionServiceStore"],
      createSessionForAuth: async (_auth, sessionId) => {
        store.set(sessionId, {});
        return { services: {} };
      },
      createMcpServer: async (_logger, sessionId) => {
        const server = new McpServer(
          { name: "approval-probe", version: "0.0.0" },
          { capabilities: { logging: {} } }
        );
        register(server, current, sessionId);
        return server as never;
      },
      packageJsonPath: "nonexistent-package.json",
    };
    const config: TransportFactoryAppConfig = {
      serviceName: "approval-probe",
      nodeEnv: "test",
      port: 0,
      host: "127.0.0.1",
      mcpAuthMode: "none",
      mcpStatefulSessionTimeoutMs: 60_000,
    };
    http = await startMcpHttpServer(config, silent, platformConfig);
    await new Promise<void>((resolve) => {
      if (http.server.listening) resolve();
      else http.server.once("listening", () => resolve());
    });
    const { port } = http.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });
  afterAll(async () => {
    await http.shutdown();
    await new Promise<void>((resolve) => http.server.close(() => resolve()));
  });

  async function post(body: JsonRpc, sessionId?: string, token?: string): Promise<Response> {
    return fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": PROTO_2025,
        ...(sessionId && { "mcp-session-id": sessionId }),
        ...(token && { "x-cesteral-decision-token": token }),
      },
      body: JSON.stringify(body),
    });
  }

  async function openSession(f: Fixture, capabilities: Record<string, unknown>): Promise<string> {
    current = f;
    const init = await post({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: PROTO_2025,
        capabilities,
        clientInfo: { name: "gateway", version: "0.0.0" },
      },
    });
    expect(init.status).toBe(200);
    const sessionId = init.headers.get("mcp-session-id")!;
    expect(sessionId).toBeTruthy();
    const reader = new SseReader(init);
    await reader.until((m) => m.id === 1);
    await reader.cancel();
    const ack = await post({ jsonrpc: "2.0", method: "notifications/initialized" }, sessionId);
    expect(ack.status).toBe(202);
    return sessionId;
  }

  /** Call `gov_delete`, declining any question that arrives. */
  async function deleteCall(
    sessionId: string,
    entityId: string,
    token?: string
  ): Promise<{ result: JsonRpc; asked: boolean }> {
    const res = await post(
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "gov_delete", arguments: { entityId } },
      },
      sessionId,
      token
    );
    expect(res.status).toBe(200);
    const stream = new SseReader(res);
    let hit = await stream.until((m) => m.id === 2 || m.method === "elicitation/create");
    if (hit.method === "elicitation/create") {
      await post({ jsonrpc: "2.0", id: hit.id, result: { action: "decline" } }, sessionId);
      hit = await stream.until((m) => m.id === 2);
    }
    const asked = stream.received.some((m) => m.method === "elicitation/create");
    await stream.cancel();
    return { result: hit, asked };
  }

  it("no elicitation capability: an approved irreversible write runs, one approved_by_governance record", async () => {
    const f = fixture(ENFORCE);
    const sessionId = await openSession(f, {});
    const token = await mint({ entityId: "31" }, { jti: "jti-l1", approvalId: "appr-l1" });
    const { result, asked } = await deleteCall(sessionId, "31", token);
    expect(JSON.stringify(result.result)).toContain("confirmed=true");
    expect(asked).toBe(false);
    expect(writes).toEqual(["delete:31"]);
    expect(audits(f)).toMatchObject([
      { outcome: "approved_by_governance", jti: "jti-l1", approvalId: "appr-l1" },
    ]);
  });

  it("an elicitation-capable client is sent no elicitation/create for the approval", async () => {
    const f = fixture(ENFORCE);
    const sessionId = await openSession(f, FORM);
    const token = await mint({ entityId: "32" }, { jti: "jti-l2", approvalId: "appr-l2" });
    const { result, asked } = await deleteCall(sessionId, "32", token);
    expect(JSON.stringify(result.result)).toContain("confirmed=true");
    expect(asked).toBe(false);
    expect(writes).toEqual(["delete:32"]);
    expect(audits(f).map((r) => r.outcome)).toEqual(["approved_by_governance"]);
  });

  it("an elicitation-capable client, a verified token without approvalId: still asked", async () => {
    const f = fixture(ENFORCE);
    const sessionId = await openSession(f, FORM);
    const token = await mint({ entityId: "33" }, { jti: "jti-l3" });
    const { result, asked } = await deleteCall(sessionId, "33", token);
    expect(asked).toBe(true);
    expect(JSON.stringify(result.result)).toContain("confirmed=false");
    expect(writes).toEqual([]);
    expect(audits(f).map((r) => r.outcome)).toEqual(["declined"]);
  });

  it("no capability, a verified token without approvalId: refused as today", async () => {
    const f = fixture(ENFORCE);
    const sessionId = await openSession(f, {});
    const token = await mint({ entityId: "34" }, { jti: "jti-l4" });
    const { result } = await deleteCall(sessionId, "34", token);
    expect(JSON.stringify(result.result)).toContain("confirmed=false");
    expect(writes).toEqual([]);
    expect(audits(f).map((r) => r.outcome)).toEqual(["refused_no_channel"]);
  });

  it("warn mode, an approved token that fails verification: asked, not skipped", async () => {
    const f = fixture(WARN);
    const sessionId = await openSession(f, FORM);
    const token = await mint(
      { entityId: "35" },
      { jti: "jti-l5", approvalId: "appr-l5", secret: WRONG_SECRET }
    );
    const { asked } = await deleteCall(sessionId, "35", token);
    expect(asked).toBe(true);
    expect(writes).toEqual([]);
  });

  it("no capability, token mode off: refused as today", async () => {
    const f = fixture(OFF);
    const sessionId = await openSession(f, {});
    const token = await mint({ entityId: "36" }, { jti: "jti-l6", approvalId: "appr-l6" });
    const { result } = await deleteCall(sessionId, "36", token);
    expect(JSON.stringify(result.result)).toContain("confirmed=false");
    expect(writes).toEqual([]);
    expect(audits(f).map((r) => r.outcome)).toEqual(["refused_no_channel"]);
  });
});
