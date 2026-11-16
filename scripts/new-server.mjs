#!/usr/bin/env node
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Scaffold a new ad-platform server: the package, its registry.json entry,
// its platform facts and every hand-maintained fleet list.
//
//   pnpm new:server <key> --display-name "Reddit Ads" \
//     --base-url https://ads-api.reddit.com --docs-url https://ads-api.reddit.com/docs \
//     [--type management] [--port N] [--rate-limit 25] [--dry-run]
//
// Exit codes: 0 ok, 2 invalid input or the server already exists.
// Guide: docs/guides/adding-a-new-server.md.

import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { ScaffoldError, applyPlan, planScaffold } from "./scaffold/scaffold.mjs";

const ROOT = join(import.meta.dirname, "..");

function usage() {
  return (
    "usage: pnpm new:server <key> --display-name <name> --base-url <url> --docs-url <url>\n" +
    "         [--type management] [--port N] [--rate-limit 25] [--dry-run]"
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

  const opts = {
    key: positionals[0],
    displayName: values["display-name"],
    type: values.type,
    baseUrl: values["base-url"],
    docsUrl: values["docs-url"],
    rateLimitPerMinute: Number(values["rate-limit"]),
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
  // Both are generated from the registry entry just written: each package's
  // server.json, and the registry data @cesteral/shared compiles in (the
  // server card and serverInfo read it; a stale copy fails every boot).
  for (const script of ["generate-server-json.mjs", "sync-registry-data.mjs"]) {
    execFileSync("node", [join(ROOT, "scripts/generate", script)], { stdio: "inherit" });
  }

  const readme = plan.writes.get(plan.created.find((p) => p.endsWith("/README.md")));
  const todo = readme.slice(readme.indexOf("## Before this server can merge"));
  console.log(
    `\nNext:\n  pnpm install && pnpm run build\n  pnpm sync:untrusted-declarations   # records the new tools' untrusted-content declarations\n  pnpm run test\n\n${todo}`
  );
  return 0;
}

process.exitCode = await main();
