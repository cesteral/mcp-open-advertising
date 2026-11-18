// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * `serveStdioServer` serves both protocol eras on one stdio connection (#243):
 * a 2026-07-28 `server/discover` is answered, and a 2025 `initialize` still
 * works. Driven over a linked in-memory transport pair with raw JSON-RPC, so
 * no server process is booted.
 */

import { describe, expect, it, vi } from "vitest";
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  InMemoryTransport,
  McpServer,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";
import type { JSONRPCMessage } from "@modelcontextprotocol/server";
import { serveStdioServer, STDIO_SESSION_ID } from "../../src/utils/transport/stdio-server.js";

const MODERN = "2026-07-28";
const logger = { info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() } as never;

function harness() {
  const [wire, client] = InMemoryTransport.createLinkedPair();
  const sessionIds: string[] = [];
  const handle = serveStdioServer(
    async (sessionId) => {
      sessionIds.push(sessionId);
      const server = new McpServer({ name: "stdio-test", version: "1.0.0" });
      server.registerTool("ping_tool", { description: "ping" }, async () => ({
        content: [{ type: "text", text: "pong" }],
      }));
      return server;
    },
    logger,
    { transport: wire }
  );
  const inbox: JSONRPCMessage[] = [];
  client.onmessage = (m) => inbox.push(m);
  const reply = async (id: number): Promise<Record<string, any>> => {
    for (let i = 0; i < 200; i++) {
      const hit = inbox.find((m) => "id" in m && m.id === id);
      if (hit) return hit as Record<string, any>;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`no reply to ${id}`);
  };
  return { client, handle, sessionIds, reply };
}

describe("serveStdioServer", () => {
  it("answers a 2026-07-28 server/discover", async () => {
    const h = harness();
    await h.client.start();
    await h.client.send({
      jsonrpc: "2.0",
      id: 1,
      method: "server/discover",
      params: {
        _meta: {
          [PROTOCOL_VERSION_META_KEY]: MODERN,
          [CLIENT_INFO_META_KEY]: { name: "c", version: "0.0.0" },
          [CLIENT_CAPABILITIES_META_KEY]: {},
        },
      },
    });
    const res = await h.reply(1);
    expect(res.error).toBeUndefined();
    expect(JSON.stringify(res.result)).toContain(MODERN);
    expect(h.sessionIds.every((s) => s === STDIO_SESSION_ID)).toBe(true);
    await h.handle.close();
  });

  it("still serves a 2025 initialize and tools/list", async () => {
    const h = harness();
    await h.client.start();
    await h.client.send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "c", version: "0.0.0" },
      },
    });
    const init = await h.reply(1);
    expect(init.result.serverInfo.name).toBe("stdio-test");
    expect(init.result.protocolVersion).not.toBe(MODERN);
    await h.client.send({ jsonrpc: "2.0", method: "notifications/initialized" });
    await h.client.send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    const list = await h.reply(2);
    expect(list.result.tools.map((t: { name: string }) => t.name)).toEqual(["ping_tool"]);
    expect(h.sessionIds.every((s) => s === STDIO_SESSION_ID)).toBe(true);
    await h.handle.close();
  });
});
