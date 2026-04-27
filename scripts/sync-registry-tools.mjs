#!/usr/bin/env node

/**
 * Syncs registry.json tool lists from MCP tool definition files.
 *
 * This keeps the rich registry metadata aligned with registered tool sources
 * without requiring developers to hand-count or manually chase renamed tools.
 *
 * Usage: node scripts/sync-registry-tools.mjs [--check]
 *   --check   Validate registry.json tool lists match source definitions.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const REGISTRY_PATH = join(ROOT, "registry.json");

function loadRegistry() {
  return JSON.parse(readFileSync(REGISTRY_PATH, "utf-8"));
}

function collectToolNames(packageName) {
  const definitionsDir = join(
    ROOT,
    "packages",
    packageName,
    "src",
    "mcp-server",
    "tools",
    "definitions"
  );

  if (!existsSync(definitionsDir)) {
    throw new Error(`Tool definitions directory not found: ${definitionsDir}`);
  }

  const toolFiles = readdirSync(definitionsDir)
    .filter((name) => name.endsWith(".tool.ts"))
    .sort();

  const names = [];
  for (const fileName of toolFiles) {
    const filePath = join(definitionsDir, fileName);
    const source = readFileSync(filePath, "utf-8");

    const constMatch = /const\s+TOOL_NAME\s*=\s*["']([^"']+)["']/.exec(source);
    if (constMatch) {
      names.push(constMatch[1]);
      continue;
    }

    const literalMatch = /name:\s*["']([^"']+)["']/.exec(source);
    if (literalMatch) {
      names.push(literalMatch[1]);
      continue;
    }

    const taskMatch = /registerToolTask\(\s*["']([^"']+)["']/.exec(source);
    if (taskMatch) {
      names.push(taskMatch[1]);
      continue;
    }

    throw new Error(`Could not find TOOL_NAME in ${filePath}`);
  }

  return [...new Set(names)].sort();
}

function mergePreservingExistingOrder(currentTools, actualTools) {
  const actualSet = new Set(actualTools);
  const next = currentTools.filter((name) => actualSet.has(name));
  const nextSet = new Set(next);

  for (const name of actualTools) {
    if (!nextSet.has(name)) {
      next.push(name);
      nextSet.add(name);
    }
  }

  return next;
}

function describeDiff(packageName, currentTools, expectedTools) {
  const current = new Set(currentTools);
  const expected = new Set(expectedTools);
  const missing = expectedTools.filter((name) => !current.has(name));
  const stale = currentTools.filter((name) => !expected.has(name));

  if (missing.length === 0 && stale.length === 0) return;

  console.error(`STALE: ${packageName} registry tools are out of sync`);
  if (missing.length > 0) {
    console.error(`  Missing: ${missing.join(", ")}`);
  }
  if (stale.length > 0) {
    console.error(`  Stale: ${stale.join(", ")}`);
  }
}

function main() {
  const checkMode = process.argv.includes("--check");
  const registry = loadRegistry();
  let changed = false;

  for (const server of registry.servers) {
    const actualTools = collectToolNames(server.package);
    const currentTools = Array.isArray(server.tools) ? server.tools : [];
    const expectedTools = mergePreservingExistingOrder(currentTools, actualTools);

    if (JSON.stringify(currentTools) !== JSON.stringify(expectedTools)) {
      changed = true;
      describeDiff(server.package, currentTools, expectedTools);
      server.tools = expectedTools;
    }
  }

  if (checkMode) {
    if (changed) {
      console.error("Run 'pnpm run sync:registry-tools' to update registry.json.");
      process.exit(1);
    }
    console.log("registry.json tool lists are in sync.");
    return;
  }

  if (changed) {
    writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`);
    console.log("Updated registry.json tool lists.");
  } else {
    console.log("registry.json tool lists are already in sync.");
  }
}

main();
