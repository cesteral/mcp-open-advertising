#!/usr/bin/env node

/**
 * Fails CI when a tool or resource does not state its authorization model, or
 * states one its code contradicts.
 *
 * Security review C-2: both scope checks are opt-in and key-driven, so a tool
 * whose scope parameter is unexpectedly named — or which takes none at all —
 * silently skips them and executes. Widening the key allowlist treats the
 * symptom; requiring an explicit classification makes "no check fired" either
 * justified or a build failure.
 *
 * The rule and rationale live in ./lib/authorization-model-audit.mjs; the
 * taxonomy lives in docs/AUTHORIZATION_MODELS.md. This runner collects files
 * and reports.
 *
 * Usage:
 *   node scripts/check-authorization-model.mjs
 *   node scripts/check-authorization-model.mjs --write-baseline   (regenerate, shrink-only)
 */

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { auditAuthorizationModelCoverage } from "./lib/authorization-model-audit.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PACKAGES = join(ROOT, "packages");
const BASELINE_PATH = join(__dirname, "authorization-model-baseline.json");

/** Every tool definition and every resource module — both are execution surfaces. */
function collectFiles() {
  const files = [];
  for (const pkg of readdirSync(PACKAGES)) {
    const toolDir = join(PACKAGES, pkg, "src", "mcp-server", "tools", "definitions");
    if (existsSync(toolDir)) {
      for (const name of readdirSync(toolDir)) {
        if (!name.endsWith(".tool.ts")) continue;
        const abs = join(toolDir, name);
        files.push({ path: relative(ROOT, abs), source: readFileSync(abs, "utf-8") });
      }
    }

    // Resources are NOT routed through the tool handler's scope check at all,
    // so leaving them out would preserve exactly the fail-open C-2 describes.
    const resourceDir = join(PACKAGES, pkg, "src", "mcp-server", "resources");
    if (existsSync(resourceDir)) {
      for (const name of readdirSync(resourceDir)) {
        if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
        const abs = join(resourceDir, name);
        files.push({ path: relative(ROOT, abs), source: readFileSync(abs, "utf-8") });
      }
    }
  }
  return files;
}

const BASELINE_EXISTS = existsSync(BASELINE_PATH);

function readBaseline() {
  if (!BASELINE_EXISTS) return [];
  return JSON.parse(readFileSync(BASELINE_PATH, "utf-8")).unclassified ?? [];
}

const files = collectFiles();
const baseline = readBaseline();
const { violations, stillUnclassified, stale } = auditAuthorizationModelCoverage(files, baseline);

if (process.argv.includes("--write-baseline")) {
  // Seed from every file whose ONLY problem is a missing declaration —
  // `stillUnclassified` alone would re-emit the existing baseline and never
  // pick up the un-baselined files this flag exists to capture. Files with a
  // real inconsistency are deliberately excluded: the baseline excuses silence,
  // never a wrong declaration.
  const next = [
    ...new Set([
      ...stillUnclassified,
      ...violations.filter((v) => v.code === "missing").map((v) => v.path),
    ]),
  ].sort();

  const blocking = violations.filter((v) => v.code !== "missing");
  if (blocking.length > 0) {
    console.error(
      `Refusing to write a baseline while ${blocking.length} file(s) declare a model their code ` +
        "contradicts — fix those first:\n"
    );
    for (const v of blocking) console.error(`  ✗ ${v.path}\n      [${v.code}] ${v.detail}`);
    process.exit(1);
  }

  // Shrink-only, once seeded. The very first write has nothing to compare
  // against, so it is allowed to establish the high-water mark; every later
  // write may only lower it.
  if (BASELINE_EXISTS && next.length > baseline.length) {
    console.error(
      `Refusing to grow the baseline (${baseline.length} -> ${next.length}).\n` +
        "New or newly-touched files must declare an authorization model; the baseline exists\n" +
        "only to let the guard land without a 300-file sweep, and it may only shrink."
    );
    process.exit(1);
  }
  writeFileSync(
    BASELINE_PATH,
    JSON.stringify(
      {
        $comment:
          "Files predating check:authorization-model. SHRINK-ONLY — see docs/AUTHORIZATION_MODELS.md. C-2 stays open until this is empty.",
        unclassified: next,
      },
      null,
      2
    ) + "\n"
  );
  console.log(`Baseline written: ${next.length} unclassified file(s).`);
  process.exit(0);
}

let failed = false;

if (violations.length > 0) {
  failed = true;
  console.error(
    "check:authorization-model FAILED — these files do not state a valid authorization\n" +
      "model, or state one their code contradicts:\n"
  );
  for (const v of violations) {
    console.error(`  ✗ ${v.path}`);
    console.error(`      [${v.code}] ${v.detail}\n`);
  }
}

if (stale.length > 0) {
  failed = true;
  console.error(
    "check:authorization-model FAILED — the baseline lists files that no longer exist.\n" +
      "Prune them so it cannot accumulate dead paths:\n"
  );
  for (const p of stale) console.error(`  ✗ ${p}`);
  console.error("");
}

if (failed) {
  console.error("See docs/AUTHORIZATION_MODELS.md for the taxonomy and how to classify a tool.");
  process.exit(1);
}

const classified = files.length - stillUnclassified.length;
console.log(
  `check:authorization-model OK — ${classified}/${files.length} classified, ` +
    `${stillUnclassified.length} in the shrink-only baseline.`
);
