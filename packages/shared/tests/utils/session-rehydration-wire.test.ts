// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/** Unknown-session recovery through the real SDK transport.
 */

import { describe, it, expect, afterAll, vi } from "vitest";
import type { AddressInfo } from "node:net";
import pino from "pino";
import { z } from "zod";
import { McpServer, WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import {
  startMcpHttpServer,
  type McpHttpServer,
  type TransportFactoryConfig,
  type TransportFactoryAppConfig,
} from "../../src/utils/transport/mcp-http-transport-factory.js";
import { SessionServiceStore } from "../../src/utils/transport/session-store.js";
import { NoAuthStrategy } from "../../src/auth/auth-strategy.js";
import {
  registerToolsFromDefinitions,
  type ToolDefinitionForFactory,
} from "../../src/utils/mcp/tool-handler-factory.js";
import { extractZodShape } from "../../src/utils/mcp/zod-helpers.js";
import { NO_UNTRUSTED_CONTENT } from "../../src/utils/mcp/untrusted-content.js";

const PROTO = "2025-06-18";

const tools: ToolDefinitionForFactory[] = [
  {
    name: "probe_echo",
    description: "Echoes its input.",
    inputSchema: z.object({ text: z.string() }),
    untrustedContent: NO_UNTRUSTED_CONTENT,
    logic: async (input: { text: string }) => ({ echoed: input.text }),
  },
];

interface Instance {
  http: McpHttpServer;
  baseUrl: string;
  store: SessionServiceStore<Record<string, never>>;
}

/** One "Cloud Run instance": its own session store, its own servers. */
async function startInstance(): Promise<Instance> {
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
      const server = new McpServer({ name: "rehydration-probe", version: "0.0.0" });
      registerToolsFromDefinitions({
        server,
        tools,
        logger,
        sessionId,
        transformSchema: (schema) => extractZodShape(schema),
        createRequestContext: ({ operation }) => ({
          requestId: "req-1",
          timestamp: new Date().toISOString(),
          operation,
        }),
      });
      return server as never;
    },
    packageJsonPath: "nonexistent-package.json",
  };
  const config: TransportFactoryAppConfig = {
    serviceName: "rehydration-probe",
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
  return { http, baseUrl: `http://127.0.0.1:${port}`, store };
}

async function post(baseUrl: string, body: unknown, sessionId?: string): Promise<Response> {
  return fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": PROTO,
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    },
    body: JSON.stringify(body),
  });
}

/** The JSON-RPC message with `id` from an SSE or JSON response body. */
async function messageWithId(res: Response, id: number): Promise<Record<string, unknown>> {
  const text = await res.text();
  const candidates = res.headers.get("content-type")?.includes("text/event-stream")
    ? text
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => JSON.parse(l.slice(5).trimStart()))
    : [JSON.parse(text)];
  const hit = candidates.find((m: { id?: number }) => m.id === id);
  if (!hit) throw new Error(`no message with id ${id} in: ${text}`);
  return hit;
}

describe("session recovery over the SDK transport", () => {
  const instances: Instance[] = [];
  afterAll(async () => {
    for (const { http } of instances) {
      await http.shutdown();
      await new Promise<void>((resolve) => http.server.close(() => resolve()));
    }
  });

  it("requires re-initialization on an instance that never saw the session", async () => {
    const a = await startInstance();
    const b = await startInstance();
    instances.push(a, b);

    // The client initializes on instance A…
    const init = await post(a.baseUrl, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: PROTO, capabilities: {}, clientInfo: { name: "c", version: "0" } },
    });
    expect(init.status).toBe(200);
    const sessionId = init.headers.get("mcp-session-id")!;
    expect(sessionId).toBeTruthy();
    await messageWithId(init, 1);
    expect(b.store.get(sessionId)).toBeUndefined();

    // …and its next request lands on instance B.
    const call = await post(
      b.baseUrl,
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "probe_echo", arguments: { text: "hi" } },
      },
      sessionId
    );
    expect(call.status).toBe(404);
    expect(b.store.get(sessionId)).toBeUndefined();

    const fresh = await post(b.baseUrl, {
      jsonrpc: "2.0",
      id: 3,
      method: "initialize",
      params: { protocolVersion: PROTO, capabilities: {}, clientInfo: { name: "c", version: "0" } },
    });
    expect(fresh.status).toBe(200);
    const freshId = fresh.headers.get("mcp-session-id")!;
    expect(freshId).not.toBe(sessionId);
    await messageWithId(fresh, 3);
    const retry = await post(
      b.baseUrl,
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "probe_echo", arguments: { text: "hi" } },
      },
      freshId
    );
    expect(retry.status).toBe(200);
    const result = await messageWithId(retry, 4);
    expect(result.error).toBeUndefined();
    expect(JSON.stringify(result.result)).toContain("hi");
    expect(b.store.get(freshId)).toBeDefined();
  });

  it("serves a held session after a request error requires a fresh transport", async () => {
    const a = await startInstance();
    instances.push(a);
    const init = await post(a.baseUrl, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: PROTO, capabilities: {}, clientInfo: { name: "c", version: "0" } },
    });
    const sessionId = init.headers.get("mcp-session-id")!;
    await messageWithId(init, 1);
    const fault = vi
      .spyOn(WebStandardStreamableHTTPServerTransport.prototype, "handleRequest")
      .mockRejectedValueOnce(new Error("request failure"));
    try {
      const failed = await post(a.baseUrl, { jsonrpc: "2.0", id: 2, method: "ping" }, sessionId);
      expect(failed.status).toBe(500);
    } finally {
      fault.mockRestore();
    }
    expect(a.store.get(sessionId)).toBeDefined();
    const retry = await post(
      a.baseUrl,
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "probe_echo", arguments: { text: "after-error" } },
      },
      sessionId
    );
    expect(retry.status).toBe(200);
    const result = await messageWithId(retry, 3);
    expect(result.error).toBeUndefined();
    expect(JSON.stringify(result.result)).toContain("after-error");
  });
});
