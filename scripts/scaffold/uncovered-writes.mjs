// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.

import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const MARKER = "UNCOVERED_WRITES ";

/** In this process: boots the built server, so only ever call it once per process. */
async function inspect(tree, pkg) {
  const lib = (p) => import(pathToFileURL(join(tree, "scripts/lib", p)).href);
  const { withServerClient, listRawTools } = await lib("boot-server.mjs");
  const { coveredTools } = await lib("wire-request-coverage.mjs");
  const tools = await withServerClient(pkg, listRawTools);
  const writes = tools.filter((t) => t.annotations?.readOnlyHint === false).map((t) => t.name);
  const covered = coveredTools(pkg, writes);
  return writes.filter((name) => !covered.has(name)).sort();
}

/**
 * The generated server's write tools that no wire-request test covers,
 * computed with the tree's own coverage library (vitest truncates the
 * assertion message, so the failure text cannot be relied on to list them).
 *
 * It runs in a fresh `node` process each time: booting imports the server's
 * built modules, and Node's module cache would hand a second call in the same
 * process the first build (the staged smoke leg rebuilds with writes).
 */
export function uncoveredWrites(tree, pkg) {
  const out = execFileSync(process.execPath, [import.meta.filename, tree, pkg], {
    cwd: tree,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  const line = out.split("\n").find((l) => l.startsWith(MARKER));
  if (!line) throw new Error(`uncovered-writes: no result for ${pkg}; output:\n${out}`);
  return JSON.parse(line.slice(MARKER.length));
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(import.meta.filename)) {
  const [tree, pkg] = process.argv.slice(2);
  const result = await inspect(tree, pkg);
  process.stdout.write(`\n${MARKER}${JSON.stringify(result)}\n`);
  // The booted server may hold handles open; the result is written.
  process.exit(0);
}
