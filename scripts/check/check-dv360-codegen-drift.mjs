#!/usr/bin/env node
/**
 * DV360 codegen drift check.
 *
 * Regenerates `packages/dv360-mcp/src/generated/schemas/{types,zod}.ts` from the
 * LIVE Google Discovery document and fails if the result differs from what is
 * committed.
 *
 * Why this exists (issue #175 + the dead-hook finding):
 *
 *   `packages/dv360-mcp/package.json` used to declare `"prebuild":
 *   "pnpm run generate:schemas"`, which looked like codegen ran on every build.
 *   It did not. pnpm has defaulted `enable-pre-post-scripts` to false since v7,
 *   so `pnpm run build` never invoked it, and nothing else in CI, the Dockerfile,
 *   cloudbuild.yaml, or turbo.json called `generate:schemas` either. The hook was
 *   dead, so the committed schemas could silently drift from the upstream API
 *   with no signal anywhere — which is exactly how the v4 Discovery removal in
 *   #79 reached us as a surprise. The hook is now gone; this check replaces it.
 *
 * Why it is NOT a PR-blocking check:
 *
 *   It fetches a document we do not control. Wiring it into the PR path would
 *   hand Google a switch that turns `main` red on a schedule of their choosing —
 *   a known standing risk for this package, and not one worth widening. So this
 *   runs on a schedule (and on demand) to give early warning of an upstream
 *   change, while the PR path stays hermetic against the committed schemas.
 *
 * Exit codes: 0 = no drift, 1 = drift detected, 2 = the generator itself failed
 * (network, upstream shape change) — distinguished so a scheduled run can tell
 * "the API moved" from "we could not check".
 */

import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const GENERATED_DIR = "packages/dv360-mcp/src/generated/schemas";
// Written by the generator: the Discovery revision the committed schemas came from.
const PIN_FILE = `${GENERATED_DIR}/discovery-revision.json`;

const EXIT_OK = 0;
const EXIT_DRIFT = 1;
const EXIT_GENERATOR_FAILED = 2;

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: REPO_ROOT, encoding: "utf8", ...opts });
}

/**
 * Refuse to run against a tree that already has uncommitted generated files —
 * otherwise a pre-existing local edit is reported as upstream drift.
 */
export function findPreexistingChanges(porcelainOutput) {
  return porcelainOutput
    .split("\n")
    .map((line) => line.slice(3).trim())
    .filter((file) => file.startsWith(GENERATED_DIR));
}

/** Parse a revision pin file; null when it is absent or malformed. */
export function readPin(text) {
  try {
    const pin = JSON.parse(text);
    return pin && typeof pin.revision === "string" && pin.revision !== "" ? pin : null;
  } catch {
    return null;
  }
}

function readPinFile() {
  try {
    return readPin(fs.readFileSync(path.join(REPO_ROOT, PIN_FILE), "utf8"));
  } catch {
    return null;
  }
}

/**
 * Decide what a regeneration means, from facts already resolved.
 *
 * - `none`: the generated files are unchanged.
 * - `revision-only`: Google bumped the revision (doc-only edits happen often)
 *   but the extracted schemas are identical. Not drift; the pin may be refreshed.
 * - `drift`: the generated schemas differ. `sameRevision` separates "the API
 *   moved" from "the committed files were never generated from this revision"
 *   (a hand edit, or a regeneration nobody committed).
 */
export function classifyDrift({ changedFiles, committedPin, livePin }) {
  const schemaFiles = changedFiles.filter((f) => f !== PIN_FILE);
  const pinChanged = changedFiles.includes(PIN_FILE);
  const from = committedPin?.revision ?? null;
  const to = livePin?.revision ?? null;

  if (schemaFiles.length > 0) {
    return { kind: "drift", schemaFiles, from, to, sameRevision: from !== null && from === to };
  }
  if (pinChanged) {
    return { kind: "revision-only", from, to };
  }
  return { kind: "none", from, to };
}

function main() {
  const preexisting = findPreexistingChanges(
    run("git", ["status", "--porcelain", "--", GENERATED_DIR]).stdout ?? ""
  );
  if (preexisting.length > 0) {
    console.error("✖ Generated schemas already differ from HEAD before regenerating:");
    preexisting.forEach((f) => console.error(`    ${f}`));
    console.error("\n  Commit or revert them first — this check cannot attribute the diff.");
    return EXIT_GENERATOR_FAILED;
  }

  const committedPin = readPinFile();

  console.log("🔄 Regenerating dv360 schemas from the live Discovery document...");
  const gen = run("pnpm", ["--filter", "@cesteral/dv360-mcp", "run", "generate:schemas"], {
    stdio: "inherit",
  });

  if (gen.status !== 0) {
    console.error(
      "\n✖ The generator failed. This is a fetch/transform failure, not schema drift —\n" +
        "  the upstream Discovery document may have moved or become unreachable."
    );
    return EXIT_GENERATOR_FAILED;
  }

  const verdict = classifyDrift({
    changedFiles: findPreexistingChanges(
      run("git", ["status", "--porcelain", "--", GENERATED_DIR]).stdout ?? ""
    ),
    committedPin,
    livePin: readPinFile(),
  });

  if (verdict.kind === "none") {
    console.log(
      `\n✓ No drift — committed schemas match the live Discovery document (revision ${verdict.to}).`
    );
    return EXIT_OK;
  }

  if (verdict.kind === "revision-only") {
    console.log(
      committedPin
        ? `\n✓ No schema drift. Google moved the Discovery revision ${verdict.from} → ${verdict.to},\n` +
            "  but the extracted schemas are identical. Refresh the pin when convenient:\n" +
            "    pnpm --filter @cesteral/dv360-mcp run generate:schemas"
        : `\n✓ No schema drift, but no revision pin is committed. Commit ${PIN_FILE}\n` +
            `  (revision ${verdict.to}).`
    );
    return EXIT_OK;
  }

  const diff = run("git", ["diff", "--stat", "--", GENERATED_DIR]).stdout ?? "";
  console.error("\n✖ DV360 schema drift detected. The live Discovery document no longer");
  console.error("  matches the committed schemas:\n");
  console.error(diff);
  console.error(
    verdict.sameRevision
      ? `  The revision has NOT moved (${verdict.to}), so the committed schemas were never\n` +
          "  generated from it: a hand edit to the generated files, or a regeneration that\n" +
          "  was not committed.\n"
      : verdict.from
        ? `  Discovery revision moved ${verdict.from} → ${verdict.to}.\n`
        : `  No revision pin is committed, so the revision the schemas came from is unknown\n` +
          `  (live: ${verdict.to}).\n`
  );
  console.error(
    "  Regenerate and commit:\n" +
      "    pnpm --filter @cesteral/dv360-mcp run generate:schemas\n\n" +
      "  Review the diff before committing — an upstream REMOVAL (as in #79, where v4\n" +
      "  dropped campaign and insertion-order assigned targeting) needs code changes,\n" +
      "  not just regenerated files."
  );
  return EXIT_DRIFT;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main());
}
