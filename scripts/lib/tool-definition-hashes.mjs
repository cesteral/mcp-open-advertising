// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// The committed `definitionHash` of every tool the fleet publishes (#242).
//
// `definitionHash` (@cesteral/contract-hash) covers a tool's name,
// description, inputSchema, outputSchema and annotations exactly as
// `tools/list` puts them on the wire. Two upcoming changes touch how every one
// of those schemas is produced without touching a single tool file:
//
//   - the MCP SDK v1 → v2 swap, which must change NO hash: v2 is fed the same
//     JSON Schema v1 published, so a moved hash there is a regression;
//   - the Zod 3 → 4 move, which changes the emitted JSON Schema dialect and so
//     moves nearly EVERY hash, on purpose, once.
//
// Neither is reviewable without a baseline. The release manifest only lists
// governed tools and is generated, not committed, so a schema-emission change
// could move hundreds of definitions with no diff anyone reads. This file is
// that diff: every tool on every server, governed or not, because a client
// sees every tool's schema.
//
// Changing a tool's name, description, schemas or annotations moves its hash
// here; run `pnpm sync:tool-definition-hashes` and commit the result with the
// change. A hash moving in a PR that did not mean to change that tool is the
// thing this exists to catch.

import { computeDefinitionHash } from "@cesteral/contract-hash";
import { join } from "node:path";
import { ROOT } from "./boot-server.mjs";

export const SNAPSHOT_PATH = join(ROOT, "scripts/lib/tool-definition-hashes.snapshot.json");

/** `{ toolName: definitionHash }` for one server's raw `tools/list`, sorted by name. */
export function definitionHashesOf(tools) {
  return Object.fromEntries(
    tools
      .map((tool) => [tool.name, computeDefinitionHash(tool)])
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  );
}

/**
 * The difference between a committed baseline and the live fleet, as three
 * lists of `pkg/tool` keys. Pure, so the failure message is testable.
 */
export function diffDefinitionHashes(committed, live) {
  const changed = [];
  const added = [];
  const removed = [];
  for (const pkg of new Set([...Object.keys(committed), ...Object.keys(live)])) {
    const before = committed[pkg] ?? {};
    const after = live[pkg] ?? {};
    for (const tool of Object.keys(after)) {
      if (!(tool in before)) added.push(`${pkg}/${tool}`);
      else if (before[tool] !== after[tool]) changed.push(`${pkg}/${tool}`);
    }
    for (const tool of Object.keys(before)) {
      if (!(tool in after)) removed.push(`${pkg}/${tool}`);
    }
  }
  return { changed: changed.sort(), added: added.sort(), removed: removed.sort() };
}
