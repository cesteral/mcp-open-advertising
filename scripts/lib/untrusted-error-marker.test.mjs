// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Fleet-wide over-the-wire check for the #204 Tier 2 error marker.
//
// `tool-handler-factory.ts` attaches `_meta["cesteral/untrusted"]` to every
// error result it builds, because an upstream failure's message embeds the
// platform's own response text. A unit test can prove the factory sets it. It
// cannot prove the marker reaches a client: the MCP SDK re-serializes the
// handler's return value, and a result field it did not recognise would be
// dropped without a sound. So this boots every built server and reads what a
// real client receives.
//
// WHAT IS AND IS NOT MARKED
//
//   - An error the factory builds (the handler ran and threw, including "no
//     session" and every upstream failure) MUST carry the marker.
//   - An error the SDK builds before the handler runs does NOT: "MCP error
//     -32602: Input validation error" for bad arguments, and "MCP error -32601:
//     ... requires task augmentation" for a task-only tool called without task
//     mode. The factory never sees these, and their text describes only the
//     caller's own request, so it holds no platform text. Asserted below so the
//     boundary is written down, not assumed.
//   - A failed async TASK is marked in async-task-tool.ts, not here: reaching
//     it needs task mode and a live upstream failure, so it is covered by
//     packages/shared/tests/utils/async-task-tool.test.ts instead.
//   - A successful result must not carry the `tool-error` reason.
//
// Every tool except `*_search_tools` is called with `{}`: most fail SDK
// validation, and the rest reach the factory and fail there (no session). Each
// server must produce at least one factory error, so a sweep that reached
// nothing cannot pass. dbm-mcp has no tool that accepts `{}`, so it gets one
// probe with valid-shaped arguments.

import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { withServerClient, listRawTools, ROOT } from "./boot-server.mjs";

const KEY = "cesteral/untrusted";
/** Errors the SDK builds itself; the tool factory never produces this prefix. */
const SDK_BUILT_ERROR = /^MCP error -\d+: /;

/** The SDK strips unknown result fields unless handed a pass-through schema. */
const IDENTITY_SCHEMA = {
  parse: (value) => value,
  safeParse: (value) => ({ success: true, data: value }),
};

/** Extra calls for servers where `{}` never reaches the factory. */
const PROBES = {
  "dbm-mcp": [
    {
      name: "dbm_get_campaign_delivery",
      arguments: {
        advertiserId: "1",
        campaignId: "1",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      },
    },
  ],
};

const packages = readdirSync(join(ROOT, "packages"))
  .filter((p) => p.endsWith("-mcp"))
  .sort();

async function sweep(pkg) {
  return withServerClient(pkg, async (client) => {
    const tools = (await listRawTools(client)).filter((t) => !t.name.endsWith("_search_tools"));
    const calls = [...tools.map((t) => ({ name: t.name, arguments: {} })), ...(PROBES[pkg] ?? [])];
    const results = [];
    for (const params of calls) {
      const result = await client.request({ method: "tools/call", params }, IDENTITY_SCHEMA);
      results.push({ tool: params.name, result });
    }
    return results;
  });
}

const textOf = (result) => result.content?.[0]?.text ?? "";

describe("tool error results carry the untrusted marker over the wire (#204)", () => {
  it.each(packages)(
    "%s",
    async (pkg) => {
      const results = await sweep(pkg);

      const factoryErrors = results.filter(
        ({ result }) => result.isError && !SDK_BUILT_ERROR.test(textOf(result))
      );
      const sdkBuiltErrors = results.filter(
        ({ result }) => result.isError && SDK_BUILT_ERROR.test(textOf(result))
      );
      const successes = results.filter(({ result }) => !result.isError);

      // A sweep that reached no factory error proves nothing.
      expect(factoryErrors.length, `${pkg}: no call reached the tool factory`).toBeGreaterThan(0);

      for (const { tool, result } of factoryErrors) {
        expect(result._meta?.[KEY], `${tool}: factory error result is unmarked`).toEqual({
          v: 1,
          structuredPaths: [],
          contentBlocks: [0],
          reason: "tool-error",
        });
      }

      // The documented boundary: the SDK rejects these before the factory runs.
      // If this starts failing, the SDK began routing them through the handler,
      // and the "not marked" note above is out of date.
      for (const { tool, result } of sdkBuiltErrors) {
        expect(result._meta?.[KEY], `${tool}: SDK-built error unexpectedly marked`).toBe(undefined);
      }

      for (const { tool, result } of successes) {
        expect(result._meta?.[KEY]?.reason, `${tool}: success marked as an error`).not.toBe(
          "tool-error"
        );
      }
    },
    180_000
  );
});
