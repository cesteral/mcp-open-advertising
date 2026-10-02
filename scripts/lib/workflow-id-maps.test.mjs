// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Ratchet (fleet review 2026-09, _cross-fleet #26): every server's
// interaction-log workflow-id map covers exactly the tools it registers.
//
// Each server.ts hands `registerToolsFromDefinitions` a hand-written
// `*WorkflowIdByToolName` map; the factory stamps the entry on the tool's
// interaction-log record and OTEL span (`mcp.workflow.id`). A tool missing
// from the map logs every call, and every failure, with no workflowId, so
// BigQuery grouping by workflow silently drops it. The review found 81 such
// tools and 3 ghost entries for tools that did not exist; nothing tied the
// maps to the registry (only ttd had a test, since 3b3c936).
//
// This boots every built server, reads its wire `tools/list`, imports the map
// the server exports, and requires the two to match — no tool unmapped, no
// entry for a tool that is not registered.

import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { withServerClient, listRawTools, ROOT } from "./boot-server.mjs";

const packages = readdirSync(join(ROOT, "packages"))
  .filter((p) => p.endsWith("-mcp"))
  .sort();

/**
 * Registered tools that are deliberately unmapped, with the reason. Each must
 * still be registered (a stale entry fails).
 */
const UNMAPPED = new Map([
  [
    "dbm_run_custom_query_async",
    "registered by registerAsyncTaskTool, not the factory, so no workflow id reaches it",
  ],
]);

/** The generated discovery tool (`createToolSearchTool`) is not a workflow. */
const isSearchTool = (name) => name.endsWith("_search_tools");

const WORKFLOW_ID = /^mcp\.(execute|troubleshoot)\.[a-z0-9_]+$/;

async function exportedMap(pkg) {
  const mod = await import(
    pathToFileURL(join(ROOT, "packages", pkg, "dist", "mcp-server", "server.js")).href
  );
  const names = Object.keys(mod).filter((k) => k.endsWith("WorkflowIdByToolName"));
  expect(names, `${pkg} must export exactly one *WorkflowIdByToolName map`).toHaveLength(1);
  return mod[names[0]];
}

describe("workflow-id maps match the registered tools", () => {
  it("covers every server", () => {
    expect(packages.length).toBeGreaterThanOrEqual(13);
  });

  const seenUnmapped = new Set();

  for (const pkg of packages) {
    it(`${pkg}: every registered tool is mapped, and only those`, async () => {
      const map = await exportedMap(pkg);
      const registered = await withServerClient(pkg, async (client) =>
        (await listRawTools(client)).map((t) => t.name)
      );

      const expected = registered.filter((n) => !isSearchTool(n) && !UNMAPPED.has(n));
      for (const n of registered) if (UNMAPPED.has(n)) seenUnmapped.add(n);

      const unmapped = expected.filter((n) => !(n in map));
      const ghosts = Object.keys(map).filter((k) => !expected.includes(k));
      expect(unmapped, `${pkg}: tools with no workflow id`).toEqual([]);
      expect(ghosts, `${pkg}: entries for tools it does not register (or exempts)`).toEqual([]);

      const malformed = Object.entries(map).filter(([, id]) => !WORKFLOW_ID.test(id));
      expect(malformed, `${pkg}: workflow ids not shaped mcp.<kind>.<name>`).toEqual([]);
    });
  }

  it("has no stale exemption", () => {
    expect([...UNMAPPED.keys()].filter((n) => !seenUnmapped.has(n))).toEqual([]);
  });
});
