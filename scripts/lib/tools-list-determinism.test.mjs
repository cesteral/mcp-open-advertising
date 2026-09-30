// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// tools/list determinism ratchet (#248).
//
// MCP 2026-07-28 says servers SHOULD return tools/list in a deterministic order,
// so clients can cache it and LLM prompt caches keep hitting: the merged fleet
// catalog is ~125k tokens, and one reordered tool invalidates everything after
// it in a cached prefix. The order is also load-bearing here already — the
// tool-search ranker breaks score ties by registry order (see CLAUDE.md,
// "Ranker facts").
//
// Nothing asserted it. Today it holds because every server registers a fixed
// `allTools` array; a registration path that iterates a Set built from
// unordered input, awaits registrations concurrently, or derives a
// description from a clock or random value would break it silently. So this
// boots each built server and requires the raw tools/list to be byte-identical:
//   - across repeated calls in one session, and
//   - across two independently booted server instances (what a client sees
//     when a Cloud Run request lands on a different instance).
// Byte-identical, not just name order: a cache keyed on the payload misses on
// any change, reordered annotation keys included.

import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { withServerClient, listRawTools, ROOT } from "./boot-server.mjs";

const packages = readdirSync(join(ROOT, "packages"))
  .filter((p) => p.endsWith("-mcp"))
  .sort();

describe("tools/list is deterministic", () => {
  it.each(packages)(
    "%s: identical across calls and across server instances",
    async (pkg) => {
      const [first, second] = await withServerClient(pkg, async (client) => [
        JSON.stringify(await listRawTools(client)),
        JSON.stringify(await listRawTools(client)),
      ]);
      const otherInstance = await withServerClient(pkg, async (client) =>
        JSON.stringify(await listRawTools(client))
      );

      expect(JSON.parse(first).length, `${pkg}: advertises no tools`).toBeGreaterThan(0);
      expect(second, `${pkg}: tools/list changed between two calls in one session`).toBe(first);
      expect(
        otherInstance,
        `${pkg}: tools/list differs between two freshly booted server instances`
      ).toBe(first);
    },
    // two cold server boots per package
    60_000
  );
});
