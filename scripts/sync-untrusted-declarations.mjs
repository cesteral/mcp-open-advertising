#!/usr/bin/env node
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Rewrites scripts/lib/untrusted-declarations.snapshot.json from the live
// tools/list of every server whose registry.json entry claims
// `untrustedContent.pathReporting: "per-response"` (#204). Run after an
// intended declaration change; the snapshot diff is what a reviewer checks.
// Needs a prior `pnpm run build`.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { withServerClient, listRawTools, ROOT } from "./lib/boot-server.mjs";
import { SNAPSHOT_PATH, declarationsOf } from "./lib/untrusted-declarations.mjs";

const registry = JSON.parse(readFileSync(join(ROOT, "registry.json"), "utf8"));
const perResponse = readdirSync(join(ROOT, "packages"))
  .filter((p) => p.endsWith("-mcp"))
  .filter(
    (p) =>
      registry.servers.find((s) => s.package === p)?.untrustedContent?.pathReporting ===
      "per-response"
  )
  .sort();

const snapshot = {};
for (const pkg of perResponse) {
  snapshot[pkg] = declarationsOf(await withServerClient(pkg, (c) => listRawTools(c)));
}
writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + "\n");
// JSON.stringify expands every array; prettier collapses short ones. Format
// here so the regenerated file passes `pnpm format:check` (as sync-registry-tools does).
execFileSync("npx", ["prettier", "--write", SNAPSHOT_PATH], { cwd: ROOT, stdio: "ignore" });
console.log(`Wrote ${SNAPSHOT_PATH} (${perResponse.join(", ")})`);
