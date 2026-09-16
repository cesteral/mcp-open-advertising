// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * `installRawToolArgsCapture` reaches into the MCP SDK's `_requestHandlers` map,
 * which the SDK does not export. These tests exist so an SDK upgrade that moves
 * or renames it fails CI rather than silently reverting the 10-F2 fix — losing
 * capture does not open a bypass, but it does restore the false
 * `action_hash_mismatch` rejections on every governed write with a schema
 * default.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  installRawToolArgsCapture,
  getRawToolArgs,
  runWithRawToolArgs,
} from "../../src/utils/raw-tool-args.js";

async function connect(server: McpServer): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "c", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

describe("installRawToolArgsCapture", () => {
  it("installs against a real McpServer that has registered a tool", async () => {
    const server = new McpServer({ name: "s", version: "0.0.0" });
    server.registerTool("t", { description: "d", inputSchema: { a: z.string() } }, async () => ({
      content: [{ type: "text" as const, text: "ok" }],
    }));

    // The load-bearing assertion: the SDK's handler map is still where we think.
    expect(installRawToolArgsCapture(server.server)).toBe(true);
  });

  it("returns false before any tool is registered", () => {
    // McpServer creates its `tools/call` handler lazily, so ordering matters —
    // the factory installs after the registration loop for exactly this reason.
    const server = new McpServer({ name: "s", version: "0.0.0" });

    expect(installRawToolArgsCapture(server.server)).toBe(false);
  });

  it("returns false for an object with no handler map, without throwing", () => {
    expect(installRawToolArgsCapture(undefined)).toBe(false);
    expect(installRawToolArgsCapture({})).toBe(false);
    expect(installRawToolArgsCapture({ _requestHandlers: "not a map" })).toBe(false);
  });

  it("exposes the unparsed arguments, defaults and all, inside the handler", async () => {
    let raw: unknown;
    const server = new McpServer({ name: "s", version: "0.0.0" });
    server.registerTool(
      "t",
      {
        description: "d",
        inputSchema: { a: z.string(), b: z.string().default("filled"), c: z.number().optional() },
      },
      async () => {
        raw = getRawToolArgs();
        return { content: [{ type: "text" as const, text: "ok" }] };
      }
    );
    installRawToolArgsCapture(server.server);
    const client = await connect(server);

    await client.callTool({ name: "t", arguments: { a: "x" } });

    expect(raw).toEqual({ a: "x" });
  });

  it("is idempotent — a second install does not nest wrappers", async () => {
    let raw: unknown;
    const server = new McpServer({ name: "s", version: "0.0.0" });
    server.registerTool(
      "t",
      { description: "d", inputSchema: { a: z.string(), b: z.string().default("filled") } },
      async () => {
        raw = getRawToolArgs();
        return { content: [{ type: "text" as const, text: "ok" }] };
      }
    );

    expect(installRawToolArgsCapture(server.server)).toBe(true);
    expect(installRawToolArgsCapture(server.server)).toBe(true);
    const client = await connect(server);

    await client.callTool({ name: "t", arguments: { a: "x" } });

    expect(raw).toEqual({ a: "x" });
  });

  it("keeps concurrent calls' arguments separate", async () => {
    const seen: Record<string, unknown> = {};
    const server = new McpServer({ name: "s", version: "0.0.0" });
    server.registerTool(
      "t",
      { description: "d", inputSchema: { id: z.string(), pad: z.string().default("p") } },
      async (args) => {
        const id = (args as { id: string }).id;
        // Yield so the two invocations genuinely interleave; AsyncLocalStorage
        // must keep each call's store bound across the await.
        await new Promise((r) => setTimeout(r, id === "slow" ? 20 : 0));
        seen[id] = getRawToolArgs();
        return { content: [{ type: "text" as const, text: "ok" }] };
      }
    );
    installRawToolArgsCapture(server.server);
    const client = await connect(server);

    await Promise.all([
      client.callTool({ name: "t", arguments: { id: "slow" } }),
      client.callTool({ name: "t", arguments: { id: "fast" } }),
    ]);

    expect(seen.slow).toEqual({ id: "slow" });
    expect(seen.fast).toEqual({ id: "fast" });
  });

  it("still returns the tool result through the wrapper", async () => {
    const server = new McpServer({ name: "s", version: "0.0.0" });
    server.registerTool("t", { description: "d", inputSchema: { a: z.string() } }, async () => ({
      content: [{ type: "text" as const, text: "payload" }],
    }));
    installRawToolArgsCapture(server.server);
    const client = await connect(server);

    const result = await client.callTool({ name: "t", arguments: { a: "x" } });

    expect(result.content).toEqual([{ type: "text", text: "payload" }]);
  });

  it("propagates tool errors rather than swallowing them in the wrapper", async () => {
    const server = new McpServer({ name: "s", version: "0.0.0" });
    server.registerTool("t", { description: "d", inputSchema: { a: z.string() } }, async () => {
      throw new Error("boom");
    });
    installRawToolArgsCapture(server.server);
    const client = await connect(server);

    const result = await client.callTool({ name: "t", arguments: { a: "x" } });

    expect(result.isError).toBe(true);
  });

  it("reports undefined outside any captured call", () => {
    expect(getRawToolArgs()).toBeUndefined();
  });

  it("runWithRawToolArgs scopes the value to its callback", () => {
    const inside = runWithRawToolArgs({ a: 1 }, () => getRawToolArgs());

    expect(inside).toEqual({ a: 1 });
    expect(getRawToolArgs()).toBeUndefined();
  });
});
