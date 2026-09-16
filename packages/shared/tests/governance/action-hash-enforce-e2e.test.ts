// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * End-to-end proof of the 10-F2 fix, through the REAL registration path.
 *
 * `tool-handler-factory-governance.test.ts` drives a hand-rolled mock server
 * that calls handlers with raw args, so it never performs the parse that caused
 * the divergence and cannot see this either way. `action-hash-parsed-args.test.ts`
 * uses a real McpServer but computes the hashes itself, so it proves the
 * mechanism rather than the wiring.
 *
 * This file closes that gap: a real `McpServer`, a real `registerToolsFromDefinitions`,
 * `enforce` mode, and a token minted exactly as the governance layer mints it —
 * over the arguments dispatched on the wire. A legitimate call must execute; a
 * substituted argument must still be rejected.
 */

import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import * as jose from "jose";
import { hashActionInput, canonicalizeExecutableArgs } from "@cesteral/contract-hash";

vi.mock("../../src/utils/telemetry.js", () => ({
  withToolSpan: vi.fn().mockImplementation((_name, _input, fn) => fn({})),
  withSpan: vi.fn().mockImplementation((_name, fn) => fn()),
  setSpanAttribute: vi.fn(),
  recordSpanError: vi.fn(),
}));

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerToolsFromDefinitions } from "../../src/utils/tool-handler-factory.js";
import { runWithRequestContext, createRequestContext } from "../../src/utils/request-context.js";
import { InMemoryJtiStore } from "../../src/index.js";
import { extractZodShape } from "../../src/utils/zod-helpers.js";
import type { Logger } from "pino";

const SECRET = "test-secret-10f2-aaaaaaaaaaaaaaaaaaaa";
const DEF_HASH = "b".repeat(64);
const CONTRACT_ID = "sa360.insert_conversions.v1";
const enc = new TextEncoder();

function createLogger(): Logger {
  const make = (): unknown => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockImplementation(make),
  });
  return make() as Logger;
}

/**
 * Modelled on sa360's `insert_conversions`: the defaulted key sits INSIDE the
 * conversions array, which is the shape the fleet actually ships and the one no
 * top-level key filtering could reach.
 */
const conversionsTool = {
  name: "sa360_insert_conversions",
  description: "Insert offline conversions",
  inputSchema: z.object({
    conversions: z.array(
      z.object({
        conversionId: z.string(),
        segmentationType: z.string().default("FLOODLIGHT"),
      })
    ),
    dry_run: z.boolean().optional(),
  }),
  annotations: {
    readOnlyHint: false,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      platform: "sa360",
      contractPlatformSlug: "sa360",
      contractToolSlug: "insert_conversions",
      operation: ["insert_conversions"],
      entityKinds: [],
      entityIdArgs: [],
      executableArgsExclude: ["dry_run"],
      schemaVersion: 1,
      contractId: CONTRACT_ID,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: false,
      requiresSimulation: false,
    },
  },
  logic: vi.fn().mockResolvedValue({ inserted: 1 }),
};

/** Mint over the RAW dispatched arguments, exactly as the governance layer does. */
async function mintToken(rawArgs: Record<string, unknown>): Promise<string> {
  const executable = canonicalizeExecutableArgs({ rawArgs, exclude: ["dry_run"] });
  const now = Math.floor(Date.now() / 1000);
  return new jose.SignJWT({
    iss: "cesteral-intelligence",
    aud: "mcp-open-advertising",
    sub: "tenant-1",
    contractId: CONTRACT_ID,
    definitionHash: DEF_HASH,
    actionHash: hashActionInput(executable),
    jti: `jti-${now}-${Math.random()}`,
    iat: now - 5,
    exp: now + 3600,
  })
    .setProtectedHeader({ alg: "HS256" })
    .sign(enc.encode(SECRET));
}

async function callUnderEnforce(
  wireArgs: Record<string, unknown>,
  token: string
): Promise<{ isError?: boolean; text: string }> {
  const server = new McpServer({ name: "sa360-probe", version: "0.0.0" });
  conversionsTool.logic.mockClear();

  registerToolsFromDefinitions({
    server: server as never,
    tools: [conversionsTool] as never,
    logger: createLogger(),
    sessionId: "s1",
    transformSchema: (s) => extractZodShape(s),
    createRequestContext: ({ operation }) => ({
      requestId: "req-1",
      timestamp: new Date().toISOString(),
      operation,
    }),
    governanceEnv: {
      GOVERNANCE_TOKEN_MODE: "enforce",
      GOVERNANCE_DECISION_TOKEN_SECRET: SECRET,
    },
    jtiStore: new InMemoryJtiStore(),
    resolveDefinitionHash: () => DEF_HASH,
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "c", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  const ctx = createRequestContext("test");
  ctx.decisionToken = token;
  const result = (await runWithRequestContext(ctx, () =>
    client.callTool({ name: "sa360_insert_conversions", arguments: wireArgs })
  )) as { isError?: boolean; content?: Array<{ text?: string }> };

  return { isError: result.isError, text: result.content?.[0]?.text ?? "" };
}

describe("actionHash under enforce, through the real factory (10-F2)", () => {
  it("admits a legitimate call that omits a nested defaulted key", async () => {
    // The 10-F2 case, and the whole point: before the fix the SDK materialized
    // `segmentationType` and the verifier hashed it, so this legitimate call was
    // rejected as `action_hash_mismatch` — sa360's entire governed surface.
    const wire = { conversions: [{ conversionId: "c-1" }] };

    const result = await callUnderEnforce(wire, await mintToken(wire));

    expect(result.isError).toBeFalsy();
    expect(result.text).not.toContain("action_hash_mismatch");
    expect(conversionsTool.logic).toHaveBeenCalledTimes(1);
  });

  it("admits a call that sends the defaulted key explicitly", async () => {
    const wire = { conversions: [{ conversionId: "c-1", segmentationType: "FLOODLIGHT" }] };

    const result = await callUnderEnforce(wire, await mintToken(wire));

    expect(result.isError).toBeFalsy();
    expect(conversionsTool.logic).toHaveBeenCalledTimes(1);
  });

  it("still rejects a substituted value, and does not execute the write", async () => {
    // The binding must stay tight. Token approves the omitted form (which
    // executes as FLOODLIGHT); the caller sends TRANSACTION instead.
    const approved = { conversions: [{ conversionId: "c-1" }] };
    const substituted = { conversions: [{ conversionId: "c-1", segmentationType: "TRANSACTION" }] };

    const result = await callUnderEnforce(substituted, await mintToken(approved));

    expect(result.isError).toBe(true);
    expect(result.text).toContain("ACTION_HASH_MISMATCH");
    expect(conversionsTool.logic).not.toHaveBeenCalled();
  });

  it("still rejects a substituted entity id", async () => {
    const approved = { conversions: [{ conversionId: "c-1" }] };
    const substituted = { conversions: [{ conversionId: "c-2" }] };

    const result = await callUnderEnforce(substituted, await mintToken(approved));

    expect(result.isError).toBe(true);
    expect(result.text).toContain("ACTION_HASH_MISMATCH");
    expect(conversionsTool.logic).not.toHaveBeenCalled();
  });
});
