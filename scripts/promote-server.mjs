#!/usr/bin/env node
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Promote an experimental server to stable, so publish and deploy cover it:
//
//   pnpm promote:server <key> [--dry-run]
//
// It flips the registry `status`, adds the server to the deploy lists (and the
// Claude Code and Codex configs)
// (Cloud Build images, the three Terraform maps, the tfvars examples). It
// refuses, writing nothing, unless the server meets its type's whole contract.
// Promotion proves the contract is complete, not that the writes work: CI's
// wire-request coverage still blocks the merge until each write has a wire
// test. It prints the lines of the package (and its registry description)
// that still call it experimental, without editing them. Exit codes: 0 ok, 2
// refused or invalid input.

import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { ScaffoldError, applyPlan } from "./scaffold/scaffold.mjs";
import { planPromotion } from "./scaffold/promote.mjs";

const ROOT = join(import.meta.dirname, "..");

async function main() {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: { "dry-run": { type: "boolean", default: false } },
    });
  } catch (err) {
    console.error(`${err.message}\nusage: pnpm promote:server <key> [--dry-run]`);
    return 2;
  }
  if (parsed.positionals.length !== 1) {
    console.error("usage: pnpm promote:server <key> [--dry-run]");
    return 2;
  }
  const dryRun = parsed.values["dry-run"];

  let plan;
  try {
    plan = await planPromotion(ROOT, parsed.positionals[0]);
  } catch (err) {
    if (err instanceof ScaffoldError) {
      console.error(`promote:server: ${err.message}`);
      return 2;
    }
    throw err;
  }
  for (const p of plan.modified) console.log(`${dryRun ? "would modify" : "modified"}  ${p}`);
  const stale = plan.stale.map(
    ({ path, line, text }) => `  ${line ? `${path}:${line}` : path}: ${text}`
  );
  if (dryRun) {
    if (stale.length)
      console.log(`\nStill calls it experimental (not edited):\n${stale.join("\n")}`);
    return 0;
  }

  applyPlan(ROOT, plan);
  for (const script of [
    "generate-server-json.mjs",
    "sync-registry-data.mjs",
    "generate-client-configs.mjs",
  ]) {
    execFileSync("node", [join(ROOT, "scripts/generate", script)], { stdio: "inherit" });
  }
  console.log(
    "\nPromoted. Before it deploys: add the platform's credential secrets to its\n" +
      "mcp_secret_env_vars entry in terraform/variables.tf once they exist in Secret\n" +
      "Manager (only MCP_AUTH_SECRET_KEY was added). CI's wire-request coverage still\n" +
      "blocks the merge until every write tool has a wire test."
  );
  if (stale.length) {
    console.log(
      "\nThese lines still call the server experimental; promotion does not edit\n" +
        `them, so update them by hand:\n${stale.join("\n")}`
    );
  }
  return 0;
}

process.exitCode = await main();
