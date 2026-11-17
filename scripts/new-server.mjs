#!/usr/bin/env node
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Scaffold a new ad-platform server: the package, its registry.json entry,
// its platform facts and every hand-maintained fleet list.
//
//   pnpm new:server <key> --display-name "Reddit Ads" \
//     --base-url https://ads-api.reddit.com --docs-url https://ads-api.reddit.com/docs \
//     [--type management|reporting|reporting_conversions] [--port N] [--rate-limit 25] [--with-writes] [--dry-run]
//   pnpm new:server <key> --add-write-stubs [--dry-run]
//
// A new server is experimental and read-only unless --with-writes; it is not
// published or deployed until `pnpm promote:server <key>`.
//
// Exit codes: 0 ok, 2 invalid input or the server already exists.
// Guide: docs/guides/adding-a-new-server.md.

import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { ScaffoldError, applyPlan, planScaffold } from "./scaffold/scaffold.mjs";
import { planAddWrites } from "./scaffold/add-writes.mjs";

const ROOT = join(import.meta.dirname, "..");

function usage() {
  return (
    "usage: pnpm new:server <key> --display-name <name> --base-url <url> --docs-url <url>\n" +
    "         [--type management|reporting|reporting_conversions] [--port N] [--rate-limit 25] [--with-writes] [--dry-run]\n" +
    "       pnpm new:server <key> --add-write-stubs"
  );
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        "display-name": { type: "string" },
        "base-url": { type: "string" },
        "docs-url": { type: "string" },
        type: { type: "string", default: "management" },
        port: { type: "string" },
        "rate-limit": { type: "string", default: "25" },
        "dry-run": { type: "boolean", default: false },
        "with-writes": { type: "boolean", default: false },
        "add-write-stubs": { type: "boolean", default: false },
      },
    });
  } catch (err) {
    console.error(`${err.message}\n${usage()}`);
    return 2;
  }
  const { values, positionals } = parsed;
  if (positionals.length !== 1) {
    console.error(usage());
    return 2;
  }

  if (values["add-write-stubs"]) return addWriteStubs(positionals[0], values["dry-run"]);

  const opts = {
    key: positionals[0],
    displayName: values["display-name"],
    type: values.type,
    baseUrl: values["base-url"],
    docsUrl: values["docs-url"],
    rateLimitPerMinute: Number(values["rate-limit"]),
    writes: values["with-writes"],
    ...(values.port !== undefined ? { port: Number(values.port) } : {}),
  };

  let plan;
  try {
    plan = await planScaffold(ROOT, opts, new Date().toISOString().slice(0, 10));
  } catch (err) {
    if (err instanceof ScaffoldError) {
      console.error(`new:server: ${err.message}`);
      return 2;
    }
    throw err;
  }

  const verb = values["dry-run"] ? "would create" : "created";
  for (const p of plan.created) console.log(`${verb}  ${p}`);
  for (const p of plan.modified)
    console.log(`${values["dry-run"] ? "would modify" : "modified"}  ${p}`);
  if (values["dry-run"]) return 0;

  applyPlan(ROOT, plan);
  regenerate();

  const readme = plan.writes.get(plan.created.find((p) => p.endsWith("/README.md")));
  const todo = readme.slice(readme.indexOf("## Before this server can merge"));
  console.log(`\nNext:\n  ${NEXT_STEPS}\n\n${todo}`);
  return 0;
}

/**
 * Both are generated from the registry entry just written: each package's
 * server.json, and the registry data @cesteral/shared compiles in (the server
 * card and serverInfo read it; a stale copy fails every boot).
 */
function regenerate() {
  for (const script of ["generate-server-json.mjs", "sync-registry-data.mjs"]) {
    execFileSync("node", [join(ROOT, "scripts/generate", script)], { stdio: "inherit" });
  }
}

const NEXT_STEPS =
  "pnpm install && pnpm run build\n" +
  "  pnpm sync:untrusted-declarations   # records the new tools' untrusted-content declarations\n" +
  "  pnpm run test";

/** `--add-write-stubs`: governed write stubs for an experimental read-only server. */
async function addWriteStubs(key, dryRun) {
  let plan;
  try {
    plan = await planAddWrites(ROOT, key);
  } catch (err) {
    if (err instanceof ScaffoldError) {
      console.error(`new:server --add-write-stubs: ${err.message}`);
      return 2;
    }
    throw err;
  }
  for (const p of plan.created) console.log(`${dryRun ? "would create" : "created"}  ${p}`);
  for (const p of plan.modified) console.log(`${dryRun ? "would modify" : "modified"}  ${p}`);
  if (!dryRun) {
    applyPlan(ROOT, plan);
    regenerate();
  }
  if (plan.manual.length) {
    console.log(
      "\nYou have changed these files, so they were left alone. Make these edits by hand:"
    );
    for (const { path, add, remove } of plan.manual) {
      console.log(`\n  ${path}`);
      for (const l of remove) console.log(`    - ${l}`);
      for (const l of add) console.log(`    + ${l}`);
    }
  }
  console.log(
    `\nNext:\n  ${NEXT_STEPS}\n\nThen implement each write and its wire test; see the package README.`
  );
  return 0;
}

process.exitCode = await main();
