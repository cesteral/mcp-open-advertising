#!/usr/bin/env node
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Cross-server routing eval runner (#205 Part 2).
//
//   node evals/run-cross-server-routing.mjs --router=lexical
//   node evals/run-cross-server-routing.mjs --router=anthropic --out=report.json
//
// WHY THIS IS A SCRIPT AND NOT A VITEST FILE
//
// The model router costs money and needs a key. `vitest.config.scripts.ts` is on
// the PR path, so anything inside `evals/**/*.test.mjs` runs on every pull
// request — which is the right home for the deterministic half and an expensive
// mistake for the model half. The split is structural, not a convention: the
// test file never imports a live router, and `anthropicRouter` refuses to
// construct without an explicit key, so a PR-path run cannot start billing even
// if someone wires it up by accident.
//
// EXIT CODES, matching check-platform-facts.mjs so a scheduled failure is
// diagnosable without opening logs:
//   0 = at or above the recorded baseline (or reported as unmeasured)
//   1 = regressed against the baseline
//   2 = could not run (no API key, or no servers built)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMergedCatalog, serverPackages } from "./lib/merged-catalog.mjs";
import { lexicalRouter, anthropicRouter, DEFAULT_MODEL } from "./lib/routers.mjs";
import { scoreCase, scoreAmbiguous, summarize, compareToBaseline } from "./lib/score.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS_PATH = join(ROOT, "evals", "cross-server-routing.json");
const BASELINE_PATH = join(ROOT, "evals", "cross-server-routing.baseline.json");

export const EXIT_OK = 0;
export const EXIT_REGRESSED = 1;
export const EXIT_CANNOT_RUN = 2;

function arg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

/** Run every corpus entry through one router. Pure apart from the router itself. */
export async function runEval(router, catalog, corpus) {
  const caseResults = [];
  for (const testCase of corpus.cases) {
    const decision = await router.route(catalog, testCase.query);
    caseResults.push({ ...scoreCase(testCase, decision, catalog), family: testCase.family });
  }
  const ambiguousResults = [];
  for (const testCase of corpus.ambiguous) {
    const decision = await router.route(catalog, testCase.query);
    ambiguousResults.push(scoreAmbiguous(testCase, decision, catalog));
  }
  return { caseResults, ambiguousResults, summary: summarize(caseResults, ambiguousResults) };
}

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) return null;
  return JSON.parse(readFileSync(BASELINE_PATH, "utf-8"));
}

async function main() {
  const routerId = arg("router", "lexical");
  const model = arg("model", DEFAULT_MODEL);
  const outPath = arg("out");
  const scope = arg("servers");
  const packages = scope ? scope.split(",").map((s) => s.trim()) : serverPackages();

  let router;
  if (routerId === "lexical") {
    router = lexicalRouter();
  } else if (routerId === "anthropic") {
    // Either credential shape works. ANTHROPIC_AUTH_TOKEN is what
    // `ant auth print-credentials --env` exports, so a local run needs no API
    // key at all — which is the point: this eval is run by hand when tool text
    // changes, not on a schedule that bills every week.
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const authToken = process.env.ANTHROPIC_AUTH_TOKEN;
    if (!apiKey && !authToken) {
      // Not a pass. An eval that cannot run has not measured anything, and
      // saying so is the whole point — see platform-facts' `unverified`.
      console.error(
        "routing-evals: no Anthropic credential, so the model router cannot run.\n" +
          "  Nothing was measured. This is reported rather than passed quietly.\n\n" +
          "  Locally, with the Anthropic CLI:\n" +
          "    ant auth login\n" +
          "    unset ANTHROPIC_API_KEY\n" +
          '    set -a; eval "$(ant auth print-credentials --env)"; set +a\n' +
          "    pnpm eval:routing:model\n\n" +
          "  Or export ANTHROPIC_API_KEY instead."
      );
      process.exit(EXIT_CANNOT_RUN);
    }
    if (apiKey && authToken) {
      // Sending both makes the API reject the request. The key wins, matching
      // the `ant` CLI's precedence — but say so, because the usual cause is a
      // stale exported key silently overriding the profile you just logged in to.
      console.error(
        "routing-evals: both ANTHROPIC_API_KEY and ANTHROPIC_AUTH_TOKEN are set; using the " +
          "API key. Unset it to use your `ant auth login` profile."
      );
    }
    router = anthropicRouter({ apiKey, authToken, model });
  } else {
    console.error(`routing-evals: unknown router ${JSON.stringify(routerId)}`);
    process.exit(EXIT_CANNOT_RUN);
  }

  const corpus = JSON.parse(readFileSync(CORPUS_PATH, "utf-8"));
  let catalog;
  try {
    catalog = await buildMergedCatalog(packages);
  } catch (error) {
    console.error(`routing-evals: could not build the merged catalog — ${error.message}`);
    process.exit(EXIT_CANNOT_RUN);
  }

  const { caseResults, ambiguousResults, summary } = await runEval(router, catalog, corpus);
  const baseline = loadBaseline()?.routers?.[router.id] ?? null;
  const comparison = compareToBaseline(summary, baseline);

  const report = {
    generatedAt: new Date().toISOString(),
    router: router.id,
    routerKind: router.kind,
    catalog: { servers: catalog.servers.length, tools: catalog.tools.length },
    summary,
    comparison,
    caseResults,
    ambiguousResults,
  };
  if (outPath) writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(`router: ${router.id}  (${catalog.tools.length} tools, ${packages.length} servers)`);
  console.log(
    `accuracy ${summary.correct}/${summary.cases} = ${summary.accuracy}` +
      `   wrong-platform ${summary.wrongPlatform}   wrong-operation ${summary.wrongOperation}`
  );
  console.log(
    `ambiguous: ${JSON.stringify(summary.ambiguousVerdicts)}   unsafe picks: ${summary.unsafePicks}`
  );
  for (const row of caseResults.filter((r) => r.verdict !== "correct")) {
    console.log(`  ${row.verdict.padEnd(16)} ${row.id} -> ${row.picked ?? "(abstained)"}`);
  }
  for (const row of ambiguousResults) {
    console.log(`  ${row.verdict.padEnd(16)} ${row.id} -> ${row.picked ?? "(abstained)"}`);
  }

  if (comparison.status === "unmeasured") {
    console.log(`\nbaseline: UNMEASURED — ${comparison.message}`);
    process.exit(EXIT_OK);
  }
  if (comparison.status === "regressed") {
    console.error("\nrouting-evals REGRESSED:");
    for (const line of comparison.regressions) console.error(`  - ${line}`);
    process.exit(EXIT_REGRESSED);
  }
  console.log(`\nbaseline: ${comparison.message}`);
  process.exit(EXIT_OK);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
