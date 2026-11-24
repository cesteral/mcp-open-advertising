#!/usr/bin/env node
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.

/**
 * Generates the client configuration files from the `client` block of registry.json:
 *   docs/guides/client-config-reference.md   per-server credentials and snippets
 *   examples/clients/claude-code.mcp.json    every stable server, stdio, as a Claude Code .mcp.json
 *   examples/clients/codex.config.toml       every stable server, stdio, as Codex config.toml tables
 *
 * Usage: node scripts/generate/generate-client-configs.mjs [--check]
 *   --check   Fail if a generated file differs from what would be written (CI mode)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  checkClientBlocks,
  claudeCodeMcpJson,
  codexConfigToml,
  referenceDocument,
} from "../lib/client-configs.mjs";
import { deployableServers } from "../lib/server-status.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const registry = JSON.parse(readFileSync(join(ROOT, "registry.json"), "utf8"));

const CODEX_HEADER =
  "# Cesteral MCP servers for Codex. Generated from registry.json; do not edit by hand.\n" +
  "# Copy the tables you need into ~/.codex/config.toml and export the variables each one lists.\n" +
  "# Credentials are read from your shell environment (env_vars), never stored here.\n\n";

// Only stable servers are published to npm, so only they get a config: an
// experimental package would be advertised as an `npx` target that does not exist.
const published = deployableServers(registry);
const violations = checkClientBlocks(published);
if (violations.length) {
  console.error(`registry.json:\n  ${violations.join("\n  ")}`);
  process.exit(1);
}

const REFERENCE = "docs/guides/client-config-reference.md";
const CLAUDE_CODE = "examples/clients/claude-code.mcp.json";

/** Runs the repo's prettier over generated text so `format:check` agrees with it. */
const prettier = (path, input) =>
  execFileSync("pnpm", ["exec", "prettier", "--stdin-filepath", path], {
    input,
    cwd: ROOT,
    encoding: "utf8",
  });

/** Generated files as path -> content. */
const files = {
  [REFERENCE]: prettier(REFERENCE, referenceDocument(registry)),
  [CLAUDE_CODE]: prettier(CLAUDE_CODE, claudeCodeMcpJson(published)),
  "examples/clients/codex.config.toml": CODEX_HEADER + codexConfigToml(published),
};

const check = process.argv.includes("--check");
const stale = [];
for (const [path, content] of Object.entries(files)) {
  const abs = join(ROOT, path);
  if (check) {
    if (!existsSync(abs) || readFileSync(abs, "utf8") !== content) stale.push(path);
  } else {
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
    console.log(`wrote ${path}`);
  }
}
if (stale.length) {
  console.error(`Out of date: ${stale.join(", ")}\nRun: pnpm run generate:client-configs`);
  process.exit(1);
}
if (check) console.log("client configs are up to date");
