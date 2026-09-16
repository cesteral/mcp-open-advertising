// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Sweep 2026-07-25, 10-F2 — FIXED. These tests were written to pin the
 * divergence; per their own instruction ("when the canonicalization contract is
 * corrected, they should start failing and be inverted") they now assert
 * agreement.
 *
 * The mechanism, unchanged: `canonicalizeExecutableArgs` documents that it
 * "operates on the RAW wire shape", and the minter honours that — it hashes the
 * arguments it dispatched. The verifier could not, because the MCP SDK parses
 * `params.arguments` against the tool's `inputSchema` and hands the handler
 * `parseResult.data`, so any `.default()` is materialized before the handler —
 * and therefore the hash — ever sees it. The two sides hashed different objects
 * and every such call was rejected as forged under `enforce`.
 *
 * The fix does NOT change the canonicalization contract, so no cross-repo
 * republish is required: `installRawToolArgsCapture` wraps the SDK's `tools/call`
 * handler and preserves the unparsed arguments, so the verifier hashes the same
 * bytes the minter did. That also covers defaults nested inside objects and
 * arrays — e.g. sa360's `conversions[].segmentationType` — which no top-level
 * key-stripping could have reached.
 *
 * `argsSeenByHandler` still asserts the SDK materializes defaults. That is not
 * the bug; it is the upstream behaviour the fix works around, and it must keep
 * being true for these tests to mean anything.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { hashActionInput, canonicalizeExecutableArgs } from "@cesteral/contract-hash";
import { installRawToolArgsCapture, getRawToolArgs } from "../../src/utils/raw-tool-args.js";

interface Probe {
  /** What the SDK handed the tool handler (post-validation). */
  parsed: Record<string, unknown>;
  /** What `getRawToolArgs()` reported inside the handler (pre-validation). */
  raw: unknown;
}

/**
 * Register one tool on a real McpServer, with raw-args capture installed exactly
 * as `registerToolsFromDefinitions` installs it, and report both views of the
 * arguments from inside the handler.
 */
async function probe(
  inputSchema: Record<string, z.ZodTypeAny>,
  wireArguments: Record<string, unknown>,
  opts: { withCapture?: boolean } = {}
): Promise<Probe> {
  const { withCapture = true } = opts;
  let seen: Probe = { parsed: {}, raw: undefined };

  const server = new McpServer({ name: "hash-probe", version: "0.0.0" });
  server.registerTool("probe_tool", { description: "probe", inputSchema }, async (args) => {
    seen = { parsed: args as Record<string, unknown>, raw: getRawToolArgs() };
    return { content: [{ type: "text" as const, text: "ok" }] };
  });

  if (withCapture) {
    // Mirrors the factory: install AFTER registration, since McpServer creates
    // its `tools/call` handler lazily on the first `registerTool`.
    expect(installRawToolArgsCapture(server.server)).toBe(true);
  }

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "probe-client", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  await client.callTool({ name: "probe_tool", arguments: wireArguments });

  return seen;
}

const EXCLUDE = ["dry_run"];

/** What the minter hashes: the arguments actually dispatched, unparsed. */
function minterHash(rawArgs: unknown): string {
  return hashActionInput(canonicalizeExecutableArgs({ rawArgs, exclude: EXCLUDE }));
}

/**
 * What the verifier hashes, expressed exactly as the factory does: raw when
 * captured, falling back to the parsed args otherwise.
 */
function verifierHash(p: Probe): string {
  const rawArgs = p.raw !== undefined ? p.raw : p.parsed;
  return hashActionInput(canonicalizeExecutableArgs({ rawArgs, exclude: EXCLUDE }));
}

const DEFAULTED_SHAPE = {
  entityId: z.string(),
  segmentationType: z.string().default("PRODUCT"),
  dry_run: z.boolean().optional(),
};

describe("actionHash over Zod-defaulted args (10-F2, fixed)", () => {
  it("the SDK still materializes a default the client never sent", async () => {
    // The upstream behaviour the fix exists to work around. If this ever stops
    // being true the rest of this file proves nothing, so assert it directly.
    const p = await probe(DEFAULTED_SHAPE, { entityId: "c-1" });

    expect(p.parsed).toEqual({ entityId: "c-1", segmentationType: "PRODUCT" });
    expect(p.raw).toEqual({ entityId: "c-1" });
  });

  it("verifier and minter agree when the client omits a defaulted key", async () => {
    // The 10-F2 case. Before the fix these two hashes differed and the call was
    // rejected as `action_hash_mismatch` under `enforce`.
    const wire = { entityId: "c-1" };
    const p = await probe(DEFAULTED_SHAPE, wire);

    expect(verifierHash(p)).toBe(minterHash(wire));
  });

  it("verifier and minter agree when the client sends every defaulted key", async () => {
    const wire = { entityId: "c-1", segmentationType: "PRODUCT" };
    const p = await probe(DEFAULTED_SHAPE, wire);

    expect(verifierHash(p)).toBe(minterHash(wire));
  });

  it("agrees for a default nested inside an array — the sa360 shape", async () => {
    // `conversions[].segmentationType`. Capturing the raw wire shape covers this
    // for free; no top-level key filtering could have reached it.
    const shape = {
      conversions: z.array(
        z.object({
          conversionId: z.string(),
          segmentationType: z.string().default("FLOODLIGHT"),
        })
      ),
      dry_run: z.boolean().optional(),
    };
    const wire = { conversions: [{ conversionId: "x-1" }] };
    const p = await probe(shape, wire);

    // Confirm the nested default really was materialized, then that it did not
    // move the hash.
    expect(p.parsed).toEqual({
      conversions: [{ conversionId: "x-1", segmentationType: "FLOODLIGHT" }],
    });
    expect(verifierHash(p)).toBe(minterHash(wire));
  });

  it("still agrees when the only default is dry_run (excluded from the hash)", async () => {
    const wire = { entityId: "c-1" };
    const p = await probe({ entityId: z.string(), dry_run: z.boolean().default(false) }, wire);

    expect(p.parsed).toEqual({ entityId: "c-1", dry_run: false });
    expect(verifierHash(p)).toBe(minterHash(wire));
  });

  it("still agrees for a tool with no defaults at all", async () => {
    const wire = { entityId: "c-1", name: "Spring" };
    const p = await probe(
      { entityId: z.string(), name: z.string(), dry_run: z.boolean().optional() },
      wire
    );

    expect(verifierHash(p)).toBe(minterHash(wire));
  });

  it("a value the client actually sent still moves the hash", async () => {
    // The binding must stay tight: the fix drops materialized defaults from the
    // hash, and nothing else. A caller substituting a non-default value must not
    // match a token minted for the omitted form.
    const omitted = await probe(DEFAULTED_SHAPE, { entityId: "c-1" });
    const substituted = await probe(DEFAULTED_SHAPE, {
      entityId: "c-1",
      segmentationType: "TRANSACTION",
    });

    expect(verifierHash(substituted)).not.toBe(verifierHash(omitted));
    expect(verifierHash(substituted)).toBe(
      minterHash({ entityId: "c-1", segmentationType: "TRANSACTION" })
    );
  });

  it("falls back to the parsed args, and so diverges, when capture is absent", async () => {
    // Pins the fallback as the pre-fix behaviour rather than something new, and
    // documents the cost of losing the interceptor: a false mismatch, never a
    // bypass. `registerToolsFromDefinitions` logs
    // `raw_tool_args_capture_unavailable` when this path is live.
    const wire = { entityId: "c-1" };
    const p = await probe(DEFAULTED_SHAPE, wire, { withCapture: false });

    expect(p.raw).toBeUndefined();
    expect(verifierHash(p)).not.toBe(minterHash(wire));
  });
});
