#!/usr/bin/env node

/**
 * Runtime check that registry.json tools/prompts match what each MCP server
 * actually advertises over the wire.
 *
 * For every server in registry.json, this script:
 *   1. Imports its built `dist/mcp-server/server.js`
 *   2. Constructs the MCP server via `createMcpServer(logger)`
 *   3. Connects an MCP Client over an in-memory transport pair
 *   4. Calls `tools/list` and `prompts/list` (paginating as needed)
 *   5. Diffs the live names against registry.servers[].tools / .prompts
 *
 * This catches drift the static parser in `sync-registry-tools.mjs` cannot:
 * tools registered through helpers (e.g. `registerAsyncTaskTool`,
 * `registerToolTask`) and any registration path that does not match the
 * regex. Tool-name drift is the registry field LLM clients use to decide
 * which server to call, so runtime ground truth matters.
 *
 * Requires `pnpm run build` first (uses dist output of every package).
 *
 * Usage: node scripts/check-registry-runtime.mjs
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, withServerClient } from "./lib/boot-server.mjs";

const REGISTRY_PATH = join(ROOT, "registry.json");

async function listAll(client, method) {
  const names = [];
  let cursor;
  do {
    const page = await client[method](cursor ? { cursor } : undefined);
    if (method === "listTools") {
      for (const tool of page.tools) names.push(tool.name);
    } else if (method === "listPrompts") {
      for (const prompt of page.prompts) names.push(prompt.name);
    }
    cursor = page.nextCursor;
  } while (cursor);
  return names;
}

async function bootAndIntrospect(packageName) {
  return withServerClient(packageName, async (client) => {
    const [tools, prompts] = await Promise.all([
      listAll(client, "listTools"),
      listAll(client, "listPrompts").catch(() => []),
    ]);
    return { tools, prompts };
  });
}

function diff(label, expected, actual) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const missing = expected.filter((n) => !actualSet.has(n));
  const extra = actual.filter((n) => !expectedSet.has(n));
  if (missing.length === 0 && extra.length === 0) return null;
  const lines = [];
  if (missing.length > 0) {
    lines.push(`  ${label} declared in registry but not advertised: ${missing.join(", ")}`);
  }
  if (extra.length > 0) {
    lines.push(`  ${label} advertised by server but missing from registry: ${extra.join(", ")}`);
  }
  return lines.join("\n");
}

async function main() {
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf-8"));
  const failures = [];

  for (const server of registry.servers) {
    process.stdout.write(`Checking ${server.package}... `);
    try {
      const { tools, prompts } = await bootAndIntrospect(server.package);

      const toolDiff = diff("tools", server.tools ?? [], tools);
      const promptDiff = diff("prompts", server.prompts ?? [], prompts);

      if (toolDiff || promptDiff) {
        process.stdout.write("DRIFT\n");
        if (toolDiff) failures.push(`${server.package}:\n${toolDiff}`);
        if (promptDiff) failures.push(`${server.package}:\n${promptDiff}`);
      } else {
        process.stdout.write("ok\n");
      }
    } catch (error) {
      process.stdout.write("ERROR\n");
      failures.push(`${server.package}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures.length > 0) {
    console.error("\nRegistry/runtime drift detected:\n");
    for (const f of failures) console.error(f);
    console.error(
      "\nFix by updating registry.json (or the server's tool/prompt registration)" +
        " until `pnpm run check:registry-runtime` is clean."
    );
    process.exit(1);
  }

  console.log("\nregistry.json tools/prompts match every server's live MCP advertisement.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
