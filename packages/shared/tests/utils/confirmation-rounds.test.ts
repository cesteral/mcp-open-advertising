// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * #244: destructive-operation confirmation as a Multi Round-Trip Request.
 *
 * Drives the SDK's own `createMcpHandler` (the way the transport serves the
 * 2026-07-28 era) with real `McpServer`s whose tools are registered through
 * `registerToolsFromDefinitions`. The same flow on a 2025-era connection (the
 * SDK's legacy shim) is pinned by `related-request-wire.test.ts`.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
import { elicitDeleteConfirmation } from "../../src/utils/mcp/elicitation-helpers.js";
import { NO_UNTRUSTED_CONTENT } from "../../src/utils/mcp/untrusted-content.js";
import {
  runWithRequestContext,
  createRequestContext,
} from "../../src/utils/observability/request-context.js";
import { InMemoryJtiStore } from "../../src/index.js";
import {
  digestArguments,
  mintRequestState,
  resolveRequestStateKey,
  clientCanElicit,
  REQUEST_STATE_TTL_SECONDS,
} from "../../src/utils/mcp/confirmation-rounds.js";

const PROTOCOL = "2026-07-28";
const SECRET = "decision-secret-for-confirmation-tests-aaaa";
const STATE_ENV = { MCP_REQUEST_STATE_SECRET: "request-state-secret-for-tests-0123456789" };
const FORM = { elicitation: { form: {} } };

let executions: string[] = [];

const deleteTool: ToolDefinitionForFactory = {
  name: "mrtr_delete",
  description: "Hard delete (irreversible), confirmed before it acts.",
  untrustedContent: NO_UNTRUSTED_CONTENT,
  inputSchema: z.object({ id: z.string(), dry_run: z.boolean().optional() }),
  annotations: { destructiveHint: true },
  logic: async (input: { id: string }, _ctx: unknown, sdk?: ToolSdkContext) => {
    const confirmed = await elicitDeleteConfirmation({
      entityLabel: "campaign",
      entityId: input.id,
      sdkContext: sdk,
    });
    if (confirmed) executions.push(input.id);
    return { confirmed };
  },
  responseFormatter: (r: { confirmed: boolean }) => [
    { type: "text" as const, text: `confirmed=${r.confirmed}` },
  ],
};

const otherTool: ToolDefinitionForFactory = {
  ...deleteTool,
  name: "mrtr_other_delete",
};

/** A tool that (wrongly) asks during a dry run. */
const dryRunAsksTool: ToolDefinitionForFactory = {
  ...deleteTool,
  name: "mrtr_dry_run_asks",
  logic: async (_input: unknown, _ctx: unknown, sdk?: ToolSdkContext) => {
    const confirmed = await elicitDeleteConfirmation({
      entityLabel: "campaign",
      entityId: "1",
      sdkContext: sdk,
    });
    return { confirmed };
  },
};

const GOVERNED_CONTRACT = "meta.update_entity.v1";
const governedTool: ToolDefinitionForFactory = {
  name: "mrtr_governed_delete",
  description: "Governed write that confirms before it acts.",
  untrustedContent: NO_UNTRUSTED_CONTENT,
  inputSchema: z.object({ entityId: z.string(), dry_run: z.boolean().optional() }),
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
      contractId: GOVERNED_CONTRACT,
      supportsBeforeAfterSnapshot: true,
      requiresValidation: true,
      requiresSimulation: true,
    },
  },
  logic: async (input: { entityId: string }, _ctx: unknown, sdk?: ToolSdkContext) => {
    const confirmed = await elicitDeleteConfirmation({
      entityLabel: "campaign",
      entityId: input.entityId,
      sdkContext: sdk,
    });
    if (confirmed) executions.push(`governed:${input.entityId}`);
    return { confirmed };
  },
  responseFormatter: (r: { confirmed: boolean }) => [
    { type: "text" as const, text: `confirmed=${r.confirmed}` },
  ],
};

/** Asks two separate questions in one call: the second only after the first is accepted. */
const twoQuestionTool: ToolDefinitionForFactory = {
  ...deleteTool,
  name: "mrtr_two_deletes",
  logic: async (input: { id: string }, _ctx: unknown, sdk?: ToolSdkContext) => {
    const first = await elicitDeleteConfirmation({
      entityLabel: "campaign",
      entityId: `${input.id}-a`,
      sdkContext: sdk,
    });
    const second =
      first &&
      (await elicitDeleteConfirmation({
        entityLabel: "campaign",
        entityId: `${input.id}-b`,
        sdkContext: sdk,
      }));
    if (first && second) executions.push(input.id);
    return { confirmed: first && second };
  },
};

interface Fixture {
  jtiStore: InMemoryJtiStore;
  /** Defaults to a silent logger. */
  logger?: pino.Logger;
  governance?: Record<string, string>;
  /** Principal of the server instances; the stateless era keys it per principal. */
  sessionId?: string;
  stateEnv?: Record<string, string>;
}

function buildServer(f: Fixture): McpServer {
  const server = new McpServer(
    { name: "mrtr-probe", version: "0.0.0" },
    { capabilities: { logging: {} } }
  );
  registerToolsFromDefinitions({
    server: server as never,
    tools: [deleteTool, otherTool, dryRunAsksTool, governedTool, twoQuestionTool],
    logger: f.logger ?? pino({ level: "silent" }),
    sessionId: f.sessionId ?? "principal-a",
    transformSchema: (s) => extractZodShape(s),
    createRequestContext: ({ operation }) => ({
      requestId: "req-1",
      timestamp: new Date().toISOString(),
      operation,
    }),
    jtiStore: f.jtiStore,
    governanceEnv: f.governance ?? {},
    resolveManifestEntry: () => ({ definitionHash: "a".repeat(64) }),
    requestStateEnv: f.stateEnv ?? STATE_ENV,
  });
  return server;
}

interface CallOptions {
  capabilities?: Record<string, unknown>;
  requestState?: string;
  inputResponses?: Record<string, unknown>;
  decisionToken?: string;
}

let nextId = 1;

async function call(
  f: Fixture,
  name: string,
  args: Record<string, unknown>,
  opts: CallOptions = {}
): Promise<Record<string, any>> {
  const handler = createMcpHandler(() => buildServer(f));
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
            ...(opts.inputResponses && { inputResponses: opts.inputResponses }),
            ...(opts.requestState !== undefined && { requestState: opts.requestState }),
            _meta: {
              [PROTOCOL_VERSION_META_KEY]: PROTOCOL,
              [CLIENT_INFO_META_KEY]: { name: "c", version: "0.0.0" },
              [CLIENT_CAPABILITIES_META_KEY]: opts.capabilities ?? FORM,
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
  const messages = payloads.filter(Boolean).map((p) => JSON.parse(p) as Record<string, any>);
  const reply = messages.find((m) => m.id === id);
  if (!reply) throw new Error(`no reply to ${id}: ${text}`);
  return reply;
}

const resultText = (reply: Record<string, any>): string =>
  (reply.result?.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");

/** First round of a delete: the question and the sealed state. */
async function ask(f: Fixture, id = "123", name = "mrtr_delete") {
  const reply = await call(f, name, { id });
  expect(reply.error).toBeUndefined();
  expect(reply.result.resultType).toBe("input_required");
  const [[key, request]] = Object.entries(reply.result.inputRequests) as [[string, any]];
  return { key, request, state: reply.result.requestState as string };
}

const accept = (key: string) => ({ [key]: { action: "accept", content: { confirm: true } } });

describe("destructive confirmation as a Multi Round-Trip Request (#244)", () => {
  let f: Fixture;
  let savedEnv: string | undefined;

  beforeEach(() => {
    executions = [];
    f = { jtiStore: new InMemoryJtiStore() };
    savedEnv = process.env.MCP_ELICIT_DESTRUCTIVE;
    delete process.env.MCP_ELICIT_DESTRUCTIVE;
  });
  afterEach(() => {
    if (savedEnv === undefined) delete process.env.MCP_ELICIT_DESTRUCTIVE;
    else process.env.MCP_ELICIT_DESTRUCTIVE = savedEnv;
  });

  describe("the round trip", () => {
    it("answers input_required first, acts only on a retry with the accepted answer", async () => {
      const { key, request, state } = await ask(f);
      expect(request.method).toBe("elicitation/create");
      expect(request.params.mode).toBe("form");
      expect(request.params.message).toContain("delete campaign 123");
      expect(typeof state).toBe("string");
      expect(executions).toEqual([]);

      const done = await call(
        f,
        "mrtr_delete",
        { id: "123" },
        {
          requestState: state,
          inputResponses: accept(key),
        }
      );
      expect(done.error).toBeUndefined();
      expect(done.result.resultType).not.toBe("input_required");
      expect(resultText(done)).toContain("confirmed=true");
      expect(executions).toEqual(["123"]);
    });

    it("a declined answer refuses the operation", async () => {
      const { key, state } = await ask(f);
      const done = await call(
        f,
        "mrtr_delete",
        { id: "123" },
        {
          requestState: state,
          inputResponses: { [key]: { action: "decline" } },
        }
      );
      expect(resultText(done)).toContain("confirmed=false");
      expect(executions).toEqual([]);
    });

    it("a cancelled answer refuses the operation", async () => {
      const { key, state } = await ask(f);
      const done = await call(
        f,
        "mrtr_delete",
        { id: "123" },
        {
          requestState: state,
          inputResponses: { [key]: { action: "cancel" } },
        }
      );
      expect(resultText(done)).toContain("confirmed=false");
      expect(executions).toEqual([]);
    });

    it("accepting without ticking the box refuses", async () => {
      const { key, state } = await ask(f);
      const done = await call(
        f,
        "mrtr_delete",
        { id: "123" },
        {
          requestState: state,
          inputResponses: { [key]: { action: "accept", content: { confirm: false } } },
        }
      );
      expect(resultText(done)).toContain("confirmed=false");
      expect(executions).toEqual([]);
    });
  });

  describe("requestState is never trusted", () => {
    it("rejects a tampered state with -32602", async () => {
      const { key, state } = await ask(f);
      const [v, body, mac] = state.split(".");
      const flipped = `${v}.${body}.${mac.slice(0, -2)}${mac.endsWith("AA") ? "BB" : "AA"}`;
      const done = await call(
        f,
        "mrtr_delete",
        { id: "123" },
        {
          requestState: flipped,
          inputResponses: accept(key),
        }
      );
      expect(done.error?.code).toBe(-32602);
      expect(executions).toEqual([]);
    });

    it("rejects a state whose payload was edited (MAC no longer matches)", async () => {
      const { key, state } = await ask(f);
      const [v, body, mac] = state.split(".");
      const decoded = JSON.parse(Buffer.from(body, "base64url").toString());
      decoded.p.ans = { forged: { action: "accept", content: { confirm: true } } };
      const edited = Buffer.from(JSON.stringify(decoded)).toString("base64url");
      const done = await call(
        f,
        "mrtr_delete",
        { id: "123" },
        {
          requestState: `${v}.${edited}.${mac}`,
          inputResponses: accept(key),
        }
      );
      expect(done.error?.code).toBe(-32602);
    });

    it("rejects an expired state", async () => {
      const { key } = await ask(f);
      const stateKey = resolveRequestStateKey(STATE_ENV);
      const old = mintRequestState(
        stateKey,
        {
          t: "mrtr_delete",
          a: digestArguments({ id: "123" }),
          ans: {},
          n: "n-old",
        },
        "||principal-a",
        Date.now() - (REQUEST_STATE_TTL_SECONDS + 5) * 1000
      );
      const done = await call(
        f,
        "mrtr_delete",
        { id: "123" },
        {
          requestState: old,
          inputResponses: accept(key),
        }
      );
      expect(done.error?.code).toBe(-32602);
      expect(executions).toEqual([]);
    });

    it("rejects a state minted for another principal", async () => {
      const { key, state } = await ask(f);
      const done = await call(
        { ...f, sessionId: "principal-b" },
        "mrtr_delete",
        { id: "123" },
        {
          requestState: state,
          inputResponses: accept(key),
        }
      );
      expect(done.error?.code).toBe(-32602);
      expect(executions).toEqual([]);
    });

    it("rejects a state sealed under another key (another deployment)", async () => {
      const { key, state } = await ask(f);
      const done = await call(
        {
          ...f,
          stateEnv: { MCP_REQUEST_STATE_SECRET: "a-different-secret-for-another-deploy-99" },
        },
        "mrtr_delete",
        { id: "123" },
        { requestState: state, inputResponses: accept(key) }
      );
      expect(done.error?.code).toBe(-32602);
    });

    it("an approval for one set of arguments never rides on another", async () => {
      const { key, state } = await ask(f, "123");
      // The retry deletes campaign 456 under the approval for 123.
      const done = await call(
        f,
        "mrtr_delete",
        { id: "456" },
        {
          requestState: state,
          inputResponses: accept(key),
        }
      );
      expect(done.error?.code).toBe(-32602);
      expect(executions).toEqual([]);
    });

    it("an approval for one tool never rides on another", async () => {
      const { key, state } = await ask(f, "123", "mrtr_delete");
      const done = await call(
        f,
        "mrtr_other_delete",
        { id: "123" },
        {
          requestState: state,
          inputResponses: accept(key),
        }
      );
      expect(done.error?.code).toBe(-32602);
      expect(executions).toEqual([]);
    });

    it("answers without any state are rejected, not believed", async () => {
      const { key } = await ask(f);
      const done = await call(f, "mrtr_delete", { id: "123" }, { inputResponses: accept(key) });
      expect(done.error?.code).toBe(-32602);
      expect(executions).toEqual([]);
    });

    it("an answer to a different question does not satisfy this one", async () => {
      const { state } = await ask(f);
      const done = await call(
        f,
        "mrtr_delete",
        { id: "123" },
        {
          requestState: state,
          inputResponses: accept("confirm-000000000000000000000000"),
        }
      );
      expect(done.result.resultType).toBe("input_required");
      expect(executions).toEqual([]);
    });
  });

  describe("replay", () => {
    it("a replayed retry is asked again instead of executing twice", async () => {
      const { key, state } = await ask(f);
      const retry = { requestState: state, inputResponses: accept(key) };

      const first = await call(f, "mrtr_delete", { id: "123" }, retry);
      expect(resultText(first)).toContain("confirmed=true");

      const replay = await call(f, "mrtr_delete", { id: "123" }, retry);
      expect(replay.result.resultType).toBe("input_required");
      expect(executions).toEqual(["123"]);

      // The re-ask is answerable: a fresh state works, once.
      const [[key2]] = Object.entries(replay.result.inputRequests);
      const again = await call(
        f,
        "mrtr_delete",
        { id: "123" },
        {
          requestState: replay.result.requestState,
          inputResponses: accept(key2),
        }
      );
      expect(resultText(again)).toContain("confirmed=true");
      expect(executions).toEqual(["123", "123"]);
    });
  });

  describe("a client that cannot answer", () => {
    it("an irreversible operation is refused without a question", async () => {
      const reply = await call(f, "mrtr_delete", { id: "123" }, { capabilities: {} });
      expect(reply.result.resultType).not.toBe("input_required");
      expect(resultText(reply)).toContain("confirmed=false");
      expect(executions).toEqual([]);
    });

    it("a URL-only client cannot answer a form", async () => {
      const reply = await call(
        f,
        "mrtr_delete",
        { id: "123" },
        {
          capabilities: { elicitation: { url: {} } },
        }
      );
      expect(resultText(reply)).toContain("confirmed=false");
      expect(executions).toEqual([]);
    });

    it("MCP_ELICIT_DESTRUCTIVE=skip still lets it through", async () => {
      process.env.MCP_ELICIT_DESTRUCTIVE = "skip";
      const reply = await call(f, "mrtr_delete", { id: "123" }, { capabilities: {} });
      expect(resultText(reply)).toContain("confirmed=true");
      expect(executions).toEqual(["123"]);
    });

    it("`elicitation: {}` (form by default) can answer", async () => {
      const reply = await call(
        f,
        "mrtr_delete",
        { id: "123" },
        {
          capabilities: { elicitation: {} },
        }
      );
      expect(reply.result.resultType).toBe("input_required");
    });
  });

  describe("dry run", () => {
    it("never prompts: asking during a dry run is a hard error, not a question", async () => {
      const reply = await call(f, "mrtr_dry_run_asks", { id: "1", dry_run: true });
      expect(reply.result?.resultType).not.toBe("input_required");
      expect(reply.result.isError).toBe(true);
      expect(resultText(reply)).toContain("dry run must not ask");
    });
  });

  describe("decision-token replay protection stays intact", () => {
    const enforce = {
      GOVERNANCE_TOKEN_MODE: "enforce",
      GOVERNANCE_DECISION_TOKEN_SECRET: SECRET,
    };

    async function mint(args: Record<string, unknown>, jti: string) {
      const now = Math.floor(Date.now() / 1000);
      return new jose.SignJWT({
        iss: "cesteral-intelligence",
        aud: "mcp-open-advertising",
        sub: "tenant-1",
        contractId: GOVERNED_CONTRACT,
        definitionHash: "a".repeat(64),
        actionHash: hashActionInput(
          canonicalizeExecutableArgs({ rawArgs: args, exclude: ["dry_run"] })
        ),
        jti,
        iat: now - 5,
        exp: now + 3600,
      })
        .setProtectedHeader({ alg: "HS256" })
        .sign(new TextEncoder().encode(SECRET));
    }

    it("the confirmation round does not burn the token; the executing round consumes it once", async () => {
      const gov: Fixture = { ...f, governance: enforce };
      const args = { entityId: "9" };
      const token = await mint(args, "jti-confirm-1");

      const asked = await call(gov, "mrtr_governed_delete", args, { decisionToken: token });
      expect(asked.result.resultType).toBe("input_required");
      expect(executions).toEqual([]);
      const [[key]] = Object.entries(asked.result.inputRequests);

      // Same token, retried with the answer: admitted, not "REPLAYED_JTI".
      const retry = {
        requestState: asked.result.requestState,
        inputResponses: accept(key),
        decisionToken: token,
      };
      const done = await call(gov, "mrtr_governed_delete", args, retry);
      expect(done.error).toBeUndefined();
      expect(resultText(done)).toContain("confirmed=true");
      expect(executions).toEqual(["governed:9"]);

      // The same retry again: the jti was consumed by the executing round.
      const replay = await call(gov, "mrtr_governed_delete", args, retry);
      expect(resultText(replay)).toContain("REPLAYED_JTI");
      expect(executions).toEqual(["governed:9"]);
    });

    it("a declined confirmation still leaves the token spent (the call did run to a verdict)", async () => {
      const gov: Fixture = { ...f, governance: enforce };
      const args = { entityId: "10" };
      const token = await mint(args, "jti-decline-1");
      const asked = await call(gov, "mrtr_governed_delete", args, { decisionToken: token });
      const [[key]] = Object.entries(asked.result.inputRequests);
      const declined = await call(gov, "mrtr_governed_delete", args, {
        requestState: asked.result.requestState,
        inputResponses: { [key]: { action: "decline" } },
        decisionToken: token,
      });
      expect(resultText(declined)).toContain("confirmed=false");
      // Nothing executed, and the jti is consumed: a fresh token is required.
      expect(executions).toEqual([]);
      expect(await f.jtiStore.consumeOnce("jti-decline-1", 1000)).toBe("replayed");
    });

    it("a token with no valid confirmation never reaches the question", async () => {
      const gov: Fixture = { ...f, governance: enforce };
      const reply = await call(gov, "mrtr_governed_delete", { entityId: "11" });
      expect(resultText(reply)).toContain("MISSING_TOKEN");
    });
  });
});

describe("confirmation audit across rounds", () => {
  let f: Fixture;
  let lines: Array<Record<string, any>>;
  let savedEnv: string | undefined;

  /** The `destructive_confirmation` records the server logged so far. */
  const audits = () => lines.filter((l) => l.event === "destructive_confirmation");

  beforeEach(() => {
    executions = [];
    lines = [];
    const logger = pino(
      { level: "info" },
      { write: (s: string) => void lines.push(JSON.parse(s) as Record<string, any>) }
    );
    f = { jtiStore: new InMemoryJtiStore(), logger };
    savedEnv = process.env.MCP_ELICIT_DESTRUCTIVE;
    delete process.env.MCP_ELICIT_DESTRUCTIVE;
  });
  afterEach(() => {
    if (savedEnv === undefined) delete process.env.MCP_ELICIT_DESTRUCTIVE;
    else process.env.MCP_ELICIT_DESTRUCTIVE = savedEnv;
  });

  it("a 2026-era ask-then-accept emits exactly one record, on the deciding round", async () => {
    const { key, state } = await ask(f);
    // The round that only asks is not a decision.
    expect(audits()).toHaveLength(0);

    const done = await call(
      f,
      "mrtr_delete",
      { id: "123" },
      { requestState: state, inputResponses: accept(key) }
    );
    expect(resultText(done)).toContain("confirmed=true");
    const recs = audits();
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({
      component: "governance-audit",
      outcome: "accepted",
      irreversible: true,
      toolName: "mrtr_delete",
      argsDigest: digestArguments({ id: "123" }),
      action: "You are about to delete campaign 123.",
    });
    expect(typeof recs[0].principalTag).toBe("string");
    expect(recs[0].principalTag.length).toBeGreaterThan(0);
    // No token on this call, so no token ids.
    expect(recs[0].jti).toBeUndefined();
    expect(recs[0].approvalId).toBeUndefined();
    // Nothing sensitive: no raw arguments, no state, no answers.
    const serialized = JSON.stringify(recs[0]);
    expect(serialized).not.toContain(state);
    expect(recs[0]).not.toHaveProperty("params");
    expect(recs[0]).not.toHaveProperty("requestState");
  });

  it("a declined retry emits one `declined` record", async () => {
    const { key, state } = await ask(f);
    await call(
      f,
      "mrtr_delete",
      { id: "123" },
      { requestState: state, inputResponses: { [key]: { action: "decline" } } }
    );
    expect(audits().map((r) => r.outcome)).toEqual(["declined"]);
  });

  it("a replayed retry that is asked again records nothing more", async () => {
    const { key, state } = await ask(f);
    const retry = { requestState: state, inputResponses: accept(key) };
    await call(f, "mrtr_delete", { id: "123" }, retry);
    const replay = await call(f, "mrtr_delete", { id: "123" }, retry);
    expect(replay.result.resultType).toBe("input_required");
    expect(audits().map((r) => r.outcome)).toEqual(["accepted"]);
  });

  it("two questions over three rounds: one record per question, none repeated", async () => {
    const first = await call(f, "mrtr_two_deletes", { id: "7" });
    const [[keyA]] = Object.entries(first.result.inputRequests);
    expect(audits()).toHaveLength(0);

    const second = await call(
      f,
      "mrtr_two_deletes",
      { id: "7" },
      { requestState: first.result.requestState, inputResponses: accept(keyA) }
    );
    expect(second.result.resultType).toBe("input_required");
    const [[keyB]] = Object.entries(second.result.inputRequests);
    expect(audits().map((r) => r.action)).toEqual(["You are about to delete campaign 7-a."]);

    // Round three replays the first answer from the sealed state: not a new decision.
    const third = await call(
      f,
      "mrtr_two_deletes",
      { id: "7" },
      { requestState: second.result.requestState, inputResponses: accept(keyB) }
    );
    expect(resultText(third)).toContain("confirmed=true");
    expect(executions).toEqual(["7"]);
    expect(audits().map((r) => r.action)).toEqual([
      "You are about to delete campaign 7-a.",
      "You are about to delete campaign 7-b.",
    ]);
  });

  it("no channel: one `refused_no_channel` record with the call's scope", async () => {
    await call(f, "mrtr_delete", { id: "123" }, { capabilities: {} });
    const recs = audits();
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({
      outcome: "refused_no_channel",
      toolName: "mrtr_delete",
      argsDigest: digestArguments({ id: "123" }),
    });
  });

  it("MCP_ELICIT_DESTRUCTIVE=skip: one `skipped_by_env` record", async () => {
    process.env.MCP_ELICIT_DESTRUCTIVE = "skip";
    await call(f, "mrtr_delete", { id: "123" });
    expect(audits().map((r) => r.outcome)).toEqual(["skipped_by_env"]);
  });

  it("a verified decision token's jti and approvalId are on the record, the token is not", async () => {
    const args = { entityId: "9" };
    const now = Math.floor(Date.now() / 1000);
    const token = await new jose.SignJWT({
      iss: "cesteral-intelligence",
      aud: "mcp-open-advertising",
      sub: "tenant-1",
      contractId: GOVERNED_CONTRACT,
      definitionHash: "a".repeat(64),
      actionHash: hashActionInput(
        canonicalizeExecutableArgs({ rawArgs: args, exclude: ["dry_run"] })
      ),
      jti: "jti-audit-1",
      approvalId: "approval-audit-1",
      iat: now - 5,
      exp: now + 3600,
    })
      .setProtectedHeader({ alg: "HS256" })
      .sign(new TextEncoder().encode(SECRET));
    const gov: Fixture = {
      ...f,
      governance: { GOVERNANCE_TOKEN_MODE: "enforce", GOVERNANCE_DECISION_TOKEN_SECRET: SECRET },
    };

    const asked = await call(gov, "mrtr_governed_delete", args, { decisionToken: token });
    const [[key]] = Object.entries(asked.result.inputRequests);
    const done = await call(gov, "mrtr_governed_delete", args, {
      requestState: asked.result.requestState,
      inputResponses: accept(key),
      decisionToken: token,
    });
    expect(resultText(done)).toContain("confirmed=true");
    const recs = audits();
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({
      outcome: "accepted",
      toolName: "mrtr_governed_delete",
      jti: "jti-audit-1",
      approvalId: "approval-audit-1",
    });
    expect(JSON.stringify(lines)).not.toContain(token);
  });
});

describe("clientCanElicit", () => {
  const KEY = "io.modelcontextprotocol/clientCapabilities";
  it("reads the per-request envelope on a 2026-era request", () => {
    expect(clientCanElicit({ [KEY]: FORM }, undefined)).toBe(true);
    expect(clientCanElicit({ [KEY]: {} }, FORM)).toBe(false); // envelope wins
  });
  it("falls back to the initialize-time capabilities on a 2025-era request", () => {
    expect(clientCanElicit(undefined, FORM)).toBe(true);
    expect(clientCanElicit(undefined, {})).toBe(false);
    expect(clientCanElicit(undefined, undefined)).toBe(false);
  });
});
