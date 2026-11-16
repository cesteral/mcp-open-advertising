#!/usr/bin/env node
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Run the PR CI workflow locally: `pnpm ci:local`.
//
// The steps are read from .github/workflows/ci.yml at run time rather than
// copied here, so the order is CI's by construction and a step added to CI is
// picked up without editing this file. A `uses:` action this script does not
// know how to run locally is an error, never a silent skip.
//
// Differences from CI, all reported in the summary:
//   - Jobs run one after another instead of in parallel. A job whose `needs:`
//     failed is skipped, as in CI; other jobs still run.
//   - A command that already succeeded in this run (the second job's install
//     and build) is not repeated.
//   - A job whose tool is not installed (terraform, gitleaks) is reported as
//     NOT RUN with the prerequisite. `--strict` turns that into a failure.
//   - contract-version-guard compares against your local `origin/main`; run
//     `git fetch origin main` first or it compares against a stale base.
//   - Conformance binds ports 3001-3013; stop local dev servers first.
//   - A `strategy.matrix` job runs once per value (or once per
//     `matrix.include` entry), one after another, with `${{ matrix.<name> }}`
//     substituted. Any other `${{ }}` in a run: is an error: it has no local
//     value.
//
// Usage: node scripts/ci-local.mjs [--job <name>]... [--list] [--strict]

import { readFileSync, mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve, delimiter } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW = ".github/workflows/ci.yml";

/**
 * How each `uses:` action maps to local execution. `null` = CI setup with no
 * local equivalent needed (the checkout and toolchain already exist).
 * `requires` names a binary that must be on PATH for the job to run.
 */
export const ACTION_MAP = {
  "actions/checkout": null,
  "pnpm/action-setup": null,
  "actions/setup-node": null,
  // The build job's output is already in the working tree when running locally.
  "actions/upload-artifact": null,
  "actions/download-artifact": null,
  "hashicorp/setup-terraform": { requires: "terraform" },
  "gacts/gitleaks": {
    requires: "gitleaks",
    run: "gitleaks git --redact --no-banner .",
    name: "gitleaks (local equivalent of gacts/gitleaks)",
  },
};

/**
 * Parse the jobs of a GitHub Actions workflow. Handles the subset ci.yml uses:
 * job keys, `needs:`, and steps with single-line `name:` / `run:` / `uses:` /
 * `working-directory:`. Anything outside that subset throws, so a workflow
 * change this parser cannot represent fails loudly instead of being dropped.
 */
export function parseWorkflowJobs(text) {
  const jobsAt = text.search(/^jobs:\s*$/m);
  if (jobsAt < 0) throw new Error(`${WORKFLOW}: no top-level jobs:`);
  const body = text.slice(jobsAt).split("\n").slice(1);
  const jobs = [];
  let job = null;
  let step = null;
  for (const raw of body) {
    const line = raw.replace(/\s+#.*$/, "");
    if (/^\S/.test(line)) break; // next top-level key
    if (!line.trim()) continue;
    const jobKey = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (jobKey) {
      job = { name: jobKey[1], needs: [], steps: [], matrix: {}, include: null };
      jobs.push(job);
      step = null;
      continue;
    }
    if (!job) continue;
    const needs = line.match(/^ {4}needs:\s*(.+)$/);
    if (needs) {
      job.needs = needs[1]
        .replace(/[[\]]/g, "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      continue;
    }
    // `strategy:` / `matrix:` children: `<name>: [a, b]` one level under matrix.
    const axis = line.match(/^ {8}([A-Za-z0-9_-]+):\s*\[(.*)\]\s*$/);
    if (axis && !step) {
      job.matrix[axis[1]] = axis[2]
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      continue;
    }
    // `include:` under matrix, then one `- { k: v, k: v }` entry per line.
    if (/^ {8}include:\s*$/.test(line) && !step) {
      job.include = [];
      continue;
    }
    const entry = line.match(/^ {10}- \{(.*)\}\s*$/);
    if (entry && job.include && !step) {
      job.include.push(
        Object.fromEntries(
          entry[1].split(",").map((kv) => {
            const m = kv.match(/^\s*([A-Za-z0-9_-]+):\s*(\S+)\s*$/);
            if (!m)
              throw new Error(`${WORKFLOW} job ${job.name}: unsupported include entry "${kv}"`);
            return [m[1], m[2]];
          })
        )
      );
      continue;
    }
    if (/^ {10}-/.test(line) && !step) {
      throw new Error(
        `${WORKFLOW} job ${job.name}: matrix.include entries must be one-line { k: v } maps`
      );
    }
    const stepStart = line.match(/^ {6}- (.*)$/);
    if (stepStart) {
      step = {};
      job.steps.push(step);
      readStepField(step, stepStart[1], job.name);
      continue;
    }
    const field = line.match(/^ {8}(\S.*)$/);
    if (step && field) readStepField(step, field[1], job.name);
  }
  return jobs;
}

function readStepField(step, text, jobName) {
  const m = text.match(/^(name|run|uses|working-directory):\s*(.*)$/);
  if (!m) return; // `with:` blocks and their children are CI-only configuration
  const value = m[2].trim().replace(/^"(.*)"$/, "$1");
  if (m[1] === "run" && /^[|>]/.test(value)) {
    throw new Error(
      `${WORKFLOW} job ${jobName}: multi-line run: is not supported by ci-local; extend parseWorkflowJobs`
    );
  }
  step[m[1] === "working-directory" ? "cwd" : m[1]] = value;
}

/**
 * One job per combination of its matrix values, or per `matrix.include` entry
 * (the job itself when it has neither), each with `matrix` holding that
 * combination. Names stay the job's, so `--job` and `needs:` select every
 * variant. Axes and include together (GitHub's "extend" semantics) are not
 * supported.
 */
export function expandMatrix(job) {
  const axes = Object.entries(job.matrix ?? {});
  if (job.include && axes.length) {
    throw new Error(
      `${WORKFLOW} job ${job.name}: matrix axes with matrix.include are not supported by ci-local`
    );
  }
  let combos = job.include ? job.include.map((e) => ({ ...e })) : [{}];
  for (const [axis, values] of axes) {
    combos = combos.flatMap((c) => values.map((v) => ({ ...c, [axis]: v })));
  }
  return combos.map((matrix) => ({
    ...job,
    matrix,
    steps: job.steps.map((st) =>
      st.run
        ? {
            ...st,
            run: st.run.replace(/\$\{\{\s*matrix\.([A-Za-z0-9_-]+)\s*\}\}/g, (m, k) =>
              k in matrix ? matrix[k] : m
            ),
          }
        : st
    ),
  }));
}

/** Resolve each step to something runnable locally, or throw on an unknown action. */
export function planJob(job) {
  const requires = new Set();
  const commands = [];
  for (const step of job.steps) {
    if (step.uses) {
      const action = step.uses.replace(/@.*$/, "");
      if (!(action in ACTION_MAP)) {
        throw new Error(
          `${WORKFLOW} job ${job.name}: ci-local does not know how to run ${step.uses}; add it to ACTION_MAP in scripts/ci-local.mjs`
        );
      }
      const mapped = ACTION_MAP[action];
      if (mapped?.requires) requires.add(mapped.requires);
      if (mapped?.run) commands.push({ name: mapped.name, run: mapped.run, cwd: step.cwd });
      continue;
    }
    if (step.run) {
      const expr = step.run.match(/\$\{\{[^}]*\}\}/);
      if (expr) {
        throw new Error(
          `${WORKFLOW} job ${job.name}: run: uses ${expr[0]}, which has no local value; extend expandMatrix or drop the expression`
        );
      }
      commands.push({ name: step.name ?? step.run, run: step.run, cwd: step.cwd });
    }
  }
  return { name: job.name, needs: job.needs, requires: [...requires], commands };
}

function onPath(bin) {
  return spawnSync("sh", ["-c", `command -v ${bin}`], { stdio: "ignore" }).status === 0;
}

/**
 * A directory holding a `pnpm` shim for the pnpm that launched us, first on
 * PATH for every step, so nested `pnpm` calls (turbo, shell scripts) cannot
 * fall through to a different global pnpm. Refuses a version that does not
 * match `packageManager`.
 */
function pnpmShim() {
  const wanted = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).packageManager;
  const wantedVersion = wanted?.replace(/^pnpm@/, "").replace(/\+.*$/, "");
  const execpath = process.env.npm_execpath;
  const agent = process.env.npm_config_user_agent ?? "";
  const launching = agent.match(/^pnpm\/(\S+)/)?.[1];
  if (!execpath || !launching) {
    throw new Error(`run this through pnpm: \`corepack pnpm ci:local\` (needs ${wanted})`);
  }
  if (wantedVersion && launching !== wantedVersion) {
    throw new Error(
      `launched by pnpm ${launching}, but package.json pins ${wanted}. Use \`corepack pnpm ci:local\`.`
    );
  }
  const dir = mkdtempSync(join(tmpdir(), "ci-local-"));
  const shim = join(dir, "pnpm");
  writeFileSync(shim, `#!/bin/sh\nexec "${process.execPath}" "${execpath}" "$@"\n`);
  chmodSync(shim, 0o755);
  return dir;
}

function parseArgs(argv) {
  const opts = { jobs: [], list: false, strict: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--job") opts.jobs.push(argv[++i]);
    else if (argv[i] === "--list") opts.list = true;
    else if (argv[i] === "--strict") opts.strict = true;
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const plans = parseWorkflowJobs(readFileSync(join(ROOT, WORKFLOW), "utf8"))
    .flatMap(expandMatrix)
    .map(planJob);
  const unknown = opts.jobs.filter((j) => !plans.some((p) => p.name === j));
  if (unknown.length) throw new Error(`no such job in ${WORKFLOW}: ${unknown.join(", ")}`);
  const selected = opts.jobs.length ? plans.filter((p) => opts.jobs.includes(p.name)) : plans;

  if (opts.list) {
    for (const p of selected) {
      const extra = [
        p.needs.length ? `needs ${p.needs.join(", ")}` : "",
        p.requires.length ? `requires ${p.requires.join(", ")}` : "",
      ].filter(Boolean);
      console.log(`${p.name}${extra.length ? ` (${extra.join("; ")})` : ""}`);
      for (const c of p.commands) console.log(`  ${c.cwd ? `[${c.cwd}] ` : ""}${c.run}`);
    }
    return 0;
  }

  const shimDir = pnpmShim();
  const env = { ...process.env, PATH: `${shimDir}${delimiter}${process.env.PATH}` };
  const done = new Set();
  const results = [];
  try {
    for (const plan of selected) {
      const failedNeed = plan.needs.find((n) =>
        results.some((r) => r.job === n && r.status !== "passed")
      );
      if (failedNeed) {
        results.push({ job: plan.name, status: "skipped", detail: `needs ${failedNeed}` });
        continue;
      }
      const missing = plan.requires.filter((bin) => !onPath(bin));
      if (missing.length) {
        results.push({
          job: plan.name,
          status: "not-run",
          detail: `install ${missing.join(", ")} to run it`,
        });
        continue;
      }
      console.log(`\n=== ${plan.name} ===`);
      let failed = null;
      for (const cmd of plan.commands) {
        const key = `${cmd.cwd ?? "."}\0${cmd.run}`;
        if (done.has(key)) {
          console.log(`--- ${cmd.name}: already ran in this session, skipped`);
          continue;
        }
        console.log(`--- ${cmd.name}\n$ ${cmd.run}`);
        const r = spawnSync("sh", ["-c", cmd.run], {
          cwd: join(ROOT, cmd.cwd ?? "."),
          env,
          stdio: "inherit",
        });
        if (r.status !== 0) {
          failed = cmd.name;
          break;
        }
        done.add(key);
      }
      results.push({
        job: plan.name,
        status: failed ? "failed" : "passed",
        detail: failed ?? "",
      });
    }
  } finally {
    rmSync(shimDir, { recursive: true, force: true });
  }

  console.log("\n=== ci:local summary ===");
  for (const r of results) {
    console.log(`${r.status.toUpperCase().padEnd(8)} ${r.job}${r.detail ? ` — ${r.detail}` : ""}`);
  }
  const failed = results.some((r) => r.status === "failed" || r.status === "skipped");
  const notRun = results.some((r) => r.status === "not-run");
  if (notRun) {
    console.log(
      opts.strict
        ? "\nNOT RUN jobs fail under --strict."
        : "\nNOT RUN jobs still run in CI; this local result does not cover them."
    );
  }
  return failed || (notRun && opts.strict) ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (err) {
    console.error(`ci:local: ${err.message}`);
    process.exitCode = 2;
  }
}
