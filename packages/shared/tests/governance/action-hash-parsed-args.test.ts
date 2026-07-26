// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Sweep 2026-07-25, 10-F2 — CONFIRMED here, having been reported as PLAUSIBLE.
 *
 * `canonicalizeExecutableArgs` documents that it "operates on the RAW wire
 * shape". The minter (governance layer) honours that: it hashes the arguments it
 * dispatched. The verifier does not — it hashes the `args` the MCP SDK hands the
 * tool handler, and the SDK validates against the tool's Zod `inputSchema`
 * FIRST, so any key carrying a Zod `.default()` is materialized before the
 * handler (and therefore the hash) ever sees it.
 *
 * The two sides then hash different objects and every such call is rejected as
 * forged under `enforce`. The bypass direction is benign — an attacker cannot
 * add arguments this way — but the availability direction is a governance
 * outage on exactly the tools the gate exists to protect, and outages like that
 * are what train operators to turn the gate off.
 *
 * Why the existing suite missed it: `tool-handler-factory-governance.test.ts`
 * drives a hand-rolled mock server that calls handlers with raw args, so it
 * never performs the parse that causes the divergence. These tests use a real
 * `McpServer` over an in-memory transport instead.
 *
 * The fix is cross-repo and is NOT applied here: making the two sides agree
 * means changing the canonicalization contract in `@cesteral/contract-hash`,
 * which both repos consume as a pinned published package. That package cannot
 * currently be republished (sweep C3 / 03-F1 — the same publication blocker).
 * Stripping the defaulted keys from the hash inside this repo alone was
 * considered and rejected: a client that explicitly sends a value equal to the
 * default is indistinguishable from one that omits it, so that "fix" would
 * silently drop a real argument from a security binding.
 *
 * These tests therefore pin the DIVERGENCE, not a fix. When the canonicalization
 * contract is corrected, they should start failing and be inverted.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { hashActionInput, canonicalizeExecutableArgs } from "@cesteral/contract-hash";

/** Register one tool on a real McpServer and capture what its handler receives. */
async function argsSeenByHandler(
  inputSchema: Record<string, z.ZodTypeAny>,
  wireArguments: Record<string, unknown>
): Promise<Record<string, unknown>> {
  let seen: Record<string, unknown> = {};
  const server = new McpServer({ name: "hash-probe", version: "0.0.0" });
  server.registerTool("probe_tool", { description: "probe", inputSchema }, async (args) => {
    seen = args as Record<string, unknown>;
    return { content: [{ type: "text" as const, text: "ok" }] };
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "probe-client", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  await client.callTool({ name: "probe_tool", arguments: wireArguments });

  return seen;
}

const EXCLUDE = ["dry_run"];

/** What the minter hashes: the arguments actually dispatched, unparsed. */
function minterHash(rawArgs: Record<string, unknown>): string {
  return hashActionInput(canonicalizeExecutableArgs({ rawArgs, exclude: EXCLUDE }));
}

/** What the verifier hashes: whatever the tool handler was given. */
function verifierHash(handlerArgs: Record<string, unknown>): string {
  return hashActionInput(canonicalizeExecutableArgs({ rawArgs: handlerArgs, exclude: EXCLUDE }));
}

describe("actionHash divergence on Zod-defaulted args (10-F2)", () => {
  it("the SDK materializes a Zod default the client never sent", async () => {
    // This is the mechanism. Everything below follows from it.
    const seen = await argsSeenByHandler(
      {
        entityId: z.string(),
        segmentationType: z.string().default("PRODUCT"),
        dry_run: z.boolean().optional(),
      },
      { entityId: "c-1" }
    );

    expect(seen).toEqual({ entityId: "c-1", segmentationType: "PRODUCT" });
    expect(Object.keys(seen)).toContain("segmentationType");
  });

  it("so the verifier's hash does not match the minter's, and the call reads as forged", async () => {
    const wire = { entityId: "c-1" };
    const seen = await argsSeenByHandler(
      {
        entityId: z.string(),
        segmentationType: z.string().default("PRODUCT"),
        dry_run: z.boolean().optional(),
      },
      wire
    );

    // Same call, two different hashes. Under `enforce` this is
    // `action_hash_mismatch` on a legitimate request.
    expect(verifierHash(seen)).not.toBe(minterHash(wire));
  });

  it("matches when the client explicitly sends every defaulted key", async () => {
    // Confirms the divergence is caused by default MATERIALIZATION and nothing
    // else — the canonicalizer itself agrees on identical inputs.
    const wire = { entityId: "c-1", segmentationType: "PRODUCT" };
    const seen = await argsSeenByHandler(
      {
        entityId: z.string(),
        segmentationType: z.string().default("PRODUCT"),
        dry_run: z.boolean().optional(),
      },
      wire
    );

    expect(verifierHash(seen)).toBe(minterHash(wire));
  });

  it("matches for a tool whose only default is dry_run (excluded from the hash)", async () => {
    // Why this went unnoticed: `dry_run` is excluded via `executableArgsExclude`,
    // so tools whose sole default is `dry_run` are unaffected — which is most of
    // them.
    const wire = { entityId: "c-1" };
    const seen = await argsSeenByHandler(
      { entityId: z.string(), dry_run: z.boolean().default(false) },
      wire
    );

    expect(seen).toEqual({ entityId: "c-1", dry_run: false });
    expect(verifierHash(seen)).toBe(minterHash(wire));
  });

  it("matches for a tool with no defaults at all", async () => {
    const wire = { entityId: "c-1", name: "Spring" };
    const seen = await argsSeenByHandler(
      { entityId: z.string(), name: z.string(), dry_run: z.boolean().optional() },
      wire
    );

    expect(verifierHash(seen)).toBe(minterHash(wire));
  });
});
