// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * #241: server→client messages issued while handling a `tools/call` must reach
 * a client that never opens the optional standalone GET SSE stream.
 *
 * The factory used to send them through `server.server.elicitInput(params)` and
 * `server.sendLoggingMessage(params)`, neither of which carries the request's
 * id, so the SDK routed them to the GET stream — which this fleet answers with
 * 405, so nobody ever received them. A destructive-operation confirmation then
 * timed out instead of reaching the user.
 *
 * This drives the real stack end to end: a real `McpServer` with tools
 * registered through `registerToolsFromDefinitions`, behind the real
 * streamable-HTTP transport factory, listening on a real socket. The client is
 * plain `fetch` and deliberately never issues GET /mcp; everything it receives
 * arrives on the tools/call POST response stream.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import type { AddressInfo } from "node:net";
import pino from "pino";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  startMcpHttpServer,
  type McpHttpServer,
  type TransportFactoryConfig,
  type TransportFactoryAppConfig,
} from "../../src/utils/mcp-http-transport-factory.js";
import { SessionServiceStore } from "../../src/utils/session-store.js";
import { NoAuthStrategy } from "../../src/auth/auth-strategy.js";
import {
  registerToolsFromDefinitions,
  type ToolDefinitionForFactory,
  type ToolSdkContext,
} from "../../src/utils/tool-handler-factory.js";
import { extractZodShape } from "../../src/utils/zod-helpers.js";
import { elicitDeleteConfirmation } from "../../src/utils/elicitation-helpers.js";
import { NO_UNTRUSTED_CONTENT } from "../../src/utils/untrusted-content.js";

const PROTO = "2025-06-18";
/** Well under the SDK's 60s request timeout, so old code fails fast here. */
const READ_TIMEOUT_MS = 3_000;

type JsonRpc = {
  jsonrpc: "2.0";
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: unknown;
};

const tools: ToolDefinitionForFactory[] = [
  {
    name: "wire_confirm_delete",
    title: "Wire Confirm Delete",
    description: "Logs, then asks the user to confirm an irreversible delete.",
    untrustedContent: NO_UNTRUSTED_CONTENT,
    inputSchema: z.object({}),
    annotations: { destructiveHint: true },
    logic: async (_input: unknown, _context: unknown, sdkContext?: ToolSdkContext) => {
      await sdkContext?.sendLoggingMessage?.({
        level: "info",
        logger: "wire_confirm_delete",
        data: "about to confirm",
      });
      const confirmed = await elicitDeleteConfirmation({
        entityLabel: "campaign",
        entityId: "123",
        sdkContext,
      });
      return { confirmed };
    },
    responseFormatter: (r: { confirmed: boolean }) => [
      { type: "text" as const, text: `confirmed=${r.confirmed}` },
    ],
  },
];

async function startServer(): Promise<{ http: McpHttpServer; baseUrl: string }> {
  const logger = pino({ level: "silent" });
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
        { name: "wire-probe", version: "0.0.0" },
        { capabilities: { logging: {} } }
      );
      registerToolsFromDefinitions({
        server,
        tools,
        logger,
        sessionId,
        transformSchema: (schema) => extractZodShape(schema),
        createRequestContext: ({ operation }) => ({
          requestId: `req-${Math.random().toString(16).slice(2)}`,
          timestamp: new Date().toISOString(),
          operation,
        }),
      });
      return server as never;
    },
    packageJsonPath: "nonexistent-package.json",
  };
  const config: TransportFactoryAppConfig = {
    serviceName: "wire-probe",
    nodeEnv: "test",
    port: 0,
    host: "127.0.0.1",
    mcpAuthMode: "none",
    mcpStatefulSessionTimeoutMs: 60_000,
  };
  const http = await startMcpHttpServer(config, logger, platformConfig);
  await new Promise<void>((resolve) => {
    if (http.server.listening) resolve();
    else http.server.once("listening", () => resolve());
  });
  const { port } = http.server.address() as AddressInfo;
  return { http, baseUrl: `http://127.0.0.1:${port}` };
}

/** Incremental SSE reader over a POST response body. */
class SseReader {
  private buffer = "";
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private readonly decoder = new TextDecoder();
  readonly received: JsonRpc[] = [];

  constructor(res: Response) {
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
    this.reader = res.body!.getReader();
  }

  /** Read until a message matches, or fail after READ_TIMEOUT_MS. */
  async until(match: (m: JsonRpc) => boolean, what: string): Promise<JsonRpc> {
    const deadline = Date.now() + READ_TIMEOUT_MS;
    for (;;) {
      const found = this.drain(match);
      if (found) return found;
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(
          `timed out waiting for ${what}; received ${JSON.stringify(this.received.map((m) => m.method ?? `response:${m.id}`))}`
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
        throw new Error(
          `stream ended before ${what}; received ${JSON.stringify(this.received.map((m) => m.method ?? `response:${m.id}`))}`
        );
      }
      this.buffer += this.decoder.decode(chunk.value, { stream: true });
    }
  }

  private pending: JsonRpc[] = [];

  private drain(match: (m: JsonRpc) => boolean): JsonRpc | undefined {
    let idx: number;
    while ((idx = this.buffer.indexOf("\n\n")) !== -1) {
      const event = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      const data = event
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
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

describe("server→client messages ride the tools/call POST stream (#241)", () => {
  let http: McpHttpServer;
  let baseUrl: string;
  let savedElicitEnv: string | undefined;

  beforeAll(async () => {
    ({ http, baseUrl } = await startServer());
  });
  afterAll(async () => {
    await http.shutdown();
    await new Promise<void>((resolve) => http.server.close(() => resolve()));
  });
  beforeEach(() => {
    savedElicitEnv = process.env.MCP_ELICIT_DESTRUCTIVE;
    delete process.env.MCP_ELICIT_DESTRUCTIVE;
  });
  afterEach(() => {
    if (savedElicitEnv === undefined) delete process.env.MCP_ELICIT_DESTRUCTIVE;
    else process.env.MCP_ELICIT_DESTRUCTIVE = savedElicitEnv;
  });

  const headers = (sessionId?: string): Record<string, string> => ({
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": PROTO,
    ...(sessionId ? { "mcp-session-id": sessionId } : {}),
  });

  async function post(body: JsonRpc, sessionId?: string): Promise<Response> {
    return fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: headers(sessionId),
      body: JSON.stringify(body),
    });
  }

  /** initialize + notifications/initialized; never opens GET /mcp. */
  async function openSession(capabilities: Record<string, unknown>): Promise<string> {
    const init = await post({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: PROTO,
        capabilities,
        clientInfo: { name: "no-get-stream-client", version: "0.0.0" },
      },
    });
    expect(init.status).toBe(200);
    const sessionId = init.headers.get("mcp-session-id");
    expect(sessionId).toBeTruthy();
    const reader = new SseReader(init);
    await reader.until((m) => m.id === 1, "initialize result");
    await reader.cancel();
    const ack = await post({ jsonrpc: "2.0", method: "notifications/initialized" }, sessionId!);
    expect(ack.status).toBe(202);
    return sessionId!;
  }

  const isLog = (text: string) => (m: JsonRpc) =>
    m.method === "notifications/message" && m.params?.data === text;

  it("delivers the elicitation and every log message on the POST response, and the confirmation completes", async () => {
    const sessionId = await openSession({ elicitation: { form: {} } });

    const call = await post(
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "wire_confirm_delete", arguments: {} },
      },
      sessionId
    );
    expect(call.status).toBe(200);
    const stream = new SseReader(call);

    // Factory log, then the tool's own log via sdkContext.sendLoggingMessage.
    await stream.until(isLog("Invoking tool: wire_confirm_delete"), "factory start log");
    await stream.until(isLog("about to confirm"), "tool log via sdkContext");

    const elicit = await stream.until(
      (m) => m.method === "elicitation/create",
      "elicitation/create request"
    );
    expect(elicit.id).toBeDefined();
    expect(String(elicit.params?.message)).toContain("delete campaign 123");

    const answer = await post(
      {
        jsonrpc: "2.0",
        id: elicit.id,
        result: { action: "accept", content: { confirm: true } },
      },
      sessionId
    );
    expect(answer.status).toBe(202);

    await stream.until(
      isLog("Tool wire_confirm_delete completed successfully"),
      "factory completion log"
    );
    const result = await stream.until((m) => m.id === 2, "tools/call result");
    expect(result.error).toBeUndefined();
    expect(JSON.stringify(result.result)).toContain("confirmed=true");
    await stream.cancel();
  });

  it("a declined confirmation reaches the tool as a refusal", async () => {
    const sessionId = await openSession({ elicitation: { form: {} } });
    const call = await post(
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "wire_confirm_delete", arguments: {} },
      },
      sessionId
    );
    const stream = new SseReader(call);
    const elicit = await stream.until((m) => m.method === "elicitation/create", "elicitation");
    await post({ jsonrpc: "2.0", id: elicit.id, result: { action: "decline" } }, sessionId);
    const result = await stream.until((m) => m.id === 3, "tools/call result");
    expect(JSON.stringify(result.result)).toContain("confirmed=false");
    await stream.cancel();
  });

  it("keeps capability gating: no elicitation is sent to a client that did not advertise it", async () => {
    const sessionId = await openSession({});
    const call = await post(
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "wire_confirm_delete", arguments: {} },
      },
      sessionId
    );
    const stream = new SseReader(call);
    const result = await stream.until((m) => m.id === 4, "tools/call result");
    // Irreversible + no channel → refused (elicitation-helpers, unchanged).
    expect(JSON.stringify(result.result)).toContain("confirmed=false");
    expect(stream.received.some((m) => m.method === "elicitation/create")).toBe(false);
    await stream.cancel();
  });

  it("honours logging/setLevel for this session on the related-request path", async () => {
    const sessionId = await openSession({});
    const setLevel = await post(
      { jsonrpc: "2.0", id: 5, method: "logging/setLevel", params: { level: "error" } },
      sessionId
    );
    const setLevelStream = new SseReader(setLevel);
    await setLevelStream.until((m) => m.id === 5, "setLevel result");
    await setLevelStream.cancel();

    const call = await post(
      {
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: { name: "wire_confirm_delete", arguments: {} },
      },
      sessionId
    );
    const stream = new SseReader(call);
    await stream.until((m) => m.id === 6, "tools/call result");
    expect(stream.received.filter((m) => m.method === "notifications/message")).toEqual([]);
    await stream.cancel();
  });
});
