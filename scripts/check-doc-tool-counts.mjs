#!/usr/bin/env node

/**
 * Validates that the tool-count column in README.md matches the source of
 * truth in registry.json.
 *
 * README.md is the canonical place for the public fleet table. CI's existing
 * check:registry-tools and check:registry-runtime keep registry.json honest
 * against the source — this script closes the loop so the marketing copy
 * can't drift silently from those counts.
 *
 * CLAUDE.md / AGENTS.md intentionally do not duplicate the fleet table; they
 * focus on patterns and conventions. The README is the single doc-level
 * source of truth for tool counts.
 *
 * Usage: node scripts/check-doc-tool-counts.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const registry = JSON.parse(readFileSync(join(ROOT, "registry.json"), "utf-8"));
const expectedCounts = new Map(registry.servers.map((s) => [s.package, s.tools.length]));

const errors = [];

/**
 * README.md row shape:
 *   | [dbm-mcp](packages/dbm-mcp)               | Bid Manager API v2  | 6     | ... |
 */
function checkReadme() {
  const text = readFileSync(join(ROOT, "README.md"), "utf-8");
  const lineRe = /^\|\s*\[([a-z0-9-]+-mcp)\]\([^)]+\)\s*\|[^|]+\|\s*(\d+)\s*\|/gm;
  const seen = new Map();
  for (const match of text.matchAll(lineRe)) {
    const [, pkg, countStr] = match;
    seen.set(pkg, Number(countStr));
  }
  comparePackageCounts("README.md", seen);
}

function comparePackageCounts(fileLabel, seen) {
  // Every server in registry.json must appear in the doc with the right count.
  for (const [pkg, expected] of expectedCounts) {
    const actual = seen.get(pkg);
    if (actual === undefined) {
      errors.push(`${fileLabel}: missing row for ${pkg} (registry has ${expected} tools)`);
      continue;
    }
    if (actual !== expected) {
      errors.push(
        `${fileLabel}: ${pkg} count drift — doc says ${actual}, registry has ${expected}`
      );
    }
  }
  // Catch stale rows for servers that registry.json no longer lists.
  for (const pkg of seen.keys()) {
    if (!expectedCounts.has(pkg)) {
      errors.push(`${fileLabel}: row for ${pkg} but registry.json has no such server`);
    }
  }
}

checkReadme();

if (errors.length > 0) {
  console.error("❌ Tool-count drift detected between README.md and registry.json:\n");
  for (const err of errors) console.error("  - " + err);
  console.error(
    "\nFix by editing the tool-count column in README.md to match registry.json,\n" +
      "or update registry.json if the source is the one that changed."
  );
  process.exit(1);
}

console.log(`✓ README.md tool counts match registry.json for all ${expectedCounts.size} servers.`);
