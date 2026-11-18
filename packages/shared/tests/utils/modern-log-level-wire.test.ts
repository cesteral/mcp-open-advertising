// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.

/**
 * #247 (SEP-2577): on a 2026-07-28 request the log level is per request, in
 * `_meta["io.modelcontextprotocol/logLevel"]`, and a server MUST NOT send
 * `notifications/message` for a request that did not carry it.
 *
 * The tool wrapper sends its start/finish messages through `ctx.mcpReq.log`,
 * which the SDK filters on that field. This pins that behaviour through the
 * SDK's own HTTP handler, the one place it serves the modern era (the fleet's
 * transport serves the 2025 era only, #243; that path is covered by
 * `related-request-wire.test.ts`).
 */

import { describe, it, expect } from "vitest";
import pino from "pino";
import { z } from "zod";
import {
  McpServer,
  createMcpHandler,
  PROTOCOL_VERSION_META_KEY,
  CLIENT_INFO_META_KEY,
  CLIENT_CAPABILITIES_META_KEY,
  LOG_LEVEL_META_KEY,
} from "@modelcontextprotocol/server";
import { registerToolsFromDefinitions } from "../../src/utils/mcp/tool-handler-factory.js";
import { extractZodShape } from "../../src/utils/mcp/zod-helpers.js";
import { NO_UNTRUSTED_CONTENT } from "../../src/utils/mcp/untrusted-content.js";

const PROTOCOL = "2026-07-28";

function buildServer(): McpServer {
  // Same capability the fleet advertises (platform-server-factory).
  const server = new McpServer(
    { name: "log-probe", version: "0.0.0" },
    { capabilities: { logging: {} } }
  );
  registerToolsFromDefinitions({
    server: server as never,
    tools: [
      {
        name: "probe_log",
        description: "probe",
        inputSchema: z.object({}),
        untrustedContent: NO_UNTRUSTED_CONTENT,
        logic: async () => ({ ok: true }),
      },
    ],
    logger: pino({ level: "silent" }),
    transformSchema: (s) => extractZodShape(s),
    createRequestContext: ({ operation }) => ({
      requestId: "req-1",
      timestamp: new Date().toISOString(),
      operation,
    }),
  });
  return server;
}

/** Calls the tool as a modern-era client; returns every JSON-RPC message sent back. */
async function callModern(logLevel?: string) {
  const handler = createMcpHandler(() => buildServer());
  const res = await handler.fetch(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-method": "tools/call",
        "mcp-name": "probe_log",
        "mcp-protocol-version": PROTOCOL,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "probe_log",
          arguments: {},
          _meta: {
            [PROTOCOL_VERSION_META_KEY]: PROTOCOL,
            [CLIENT_INFO_META_KEY]: { name: "c", version: "0.0.0" },
            [CLIENT_CAPABILITIES_META_KEY]: {},
            ...(logLevel && { [LOG_LEVEL_META_KEY]: logLevel }),
          },
        },
      }),
    })
  );
  const text = await res.text();
  const payloads = res.headers.get("content-type")?.includes("text/event-stream")
    ? text
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
    : [text];
  const messages = payloads.filter(Boolean).map((p) => JSON.parse(p) as Record<string, any>);
  return { messages, logs: messages.filter((m) => m.method === "notifications/message") };
}

describe("modern per-request log level (#247)", () => {
  it("emits no notifications/message when the request has no logLevel", async () => {
    const { messages, logs } = await callModern();
    expect(messages.some((m) => m.id === 1 && m.result)).toBe(true);
    expect(logs).toEqual([]);
  });

  it("emits the tool's info messages when logLevel is info", async () => {
    const { logs } = await callModern("info");
    expect(logs.map((m) => m.params.data)).toContain("Invoking tool: probe_log");
  });

  it("filters out messages below the requested level", async () => {
    const { messages, logs } = await callModern("error");
    expect(messages.some((m) => m.id === 1 && m.result)).toBe(true);
    expect(logs).toEqual([]);
  });
});
