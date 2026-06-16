#!/usr/bin/env node
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Thin CLI over scripts/lib/governed-packages.mjs for shell consumers
// (publish-all.sh). Exits 0 if the named package dir is declared
// `governed: true` in registry.json, 1 otherwise. Usage:
//
//   node scripts/is-governed-package.mjs dv360-mcp   # exit 0
//   node scripts/is-governed-package.mjs dbm-mcp      # exit 1

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeclaredGoverned } from "./lib/governed-packages.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = process.argv[2];

if (!pkg) {
  console.error("usage: node scripts/is-governed-package.mjs <package-dir>");
  process.exit(2);
}

const registry = JSON.parse(readFileSync(join(ROOT, "registry.json"), "utf-8"));
process.exit(isDeclaredGoverned(registry, pkg) ? 0 : 1);
