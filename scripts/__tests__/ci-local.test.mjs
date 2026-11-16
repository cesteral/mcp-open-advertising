// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// `pnpm ci:local` reads its steps from ci.yml at run time. These tests pin that
// the parser still understands the real workflow (so a CI edit cannot leave the
// local run silently short), and that it refuses what it cannot represent.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expandMatrix, parseWorkflowJobs, planJob } from "../ci-local.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ci = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");

describe("ci-local against the real ci.yml", () => {
  const jobs = parseWorkflowJobs(ci);

  it("finds every job, and every step of each job", () => {
    const jobsBlock = ci.slice(ci.search(/^jobs:/m));
    const jobKeys = [...jobsBlock.matchAll(/^ {2}([A-Za-z0-9_-]+):\s*$/gm)].map((m) => m[1]);
    expect(jobs.map((j) => j.name)).toEqual(jobKeys);
    for (const job of jobs) {
      const block = ci.slice(ci.indexOf(`\n  ${job.name}:`) + 1).split(/\n {2}\S/)[0];
      const stepCount = (block.match(/^ {6}- /gm) ?? []).length;
      expect(job.steps.length, job.name).toBe(stepCount);
    }
  });

  it("maps every action to a local equivalent (planning never throws)", () => {
    expect(() => jobs.flatMap(expandMatrix).map(planJob)).not.toThrow();
  });

  it("runs every scaffold-smoke matrix variant, with the variant substituted", () => {
    const smoke = jobs.find((j) => j.name === "scaffold-smoke");
    const runs = expandMatrix(smoke).map((j) => planJob(j).commands.at(-1).run);
    expect(runs).toEqual([
      "node scripts/scaffold/smoke.mjs --variant read-only",
      "node scripts/scaffold/smoke.mjs --variant journey",
    ]);
  });

  it("runs each job's commands in CI's order", () => {
    // secret-scan has no `run:`; its one command is the local gitleaks stand-in.
    for (const job of jobs.filter((j) => j.name !== "secret-scan")) {
      const block = ci.slice(ci.indexOf(`\n  ${job.name}:`) + 1).split(/\n {2}\S/)[0];
      const runs = [...block.matchAll(/^ {8}run: (.+)$/gm)].map((m) => m[1]);
      const [first] = expandMatrix(job);
      const sub = (r) => r.replace(/\$\{\{\s*matrix\.(\w+)\s*\}\}/g, (_m, k) => first.matrix[k]);
      expect(
        planJob(first).commands.map((c) => c.run),
        job.name
      ).toEqual(runs.map(sub));
    }
  });

  it("keeps every check CI has run (none dropped by splitting the job)", () => {
    const all = jobs
      .flatMap(expandMatrix)
      .flatMap((job) => planJob(job).commands.map((c) => c.run));
    for (const command of [
      "pnpm run format:check",
      "pnpm run check:registry",
      "pnpm run check:registry-tools",
      "pnpm run check:doc-tool-counts",
      "pnpm run check:account-scope",
      "pnpm run check:platform-facts",
      "pnpm run build",
      "pnpm run lint",
      "pnpm run test:scripts",
      "pnpm run generate:manifests",
      "pnpm run check:registry-runtime",
      "pnpm exec turbo run typecheck --only",
      "pnpm exec turbo run test --only",
      "pnpm run test:conformance:ci",
    ]) {
      expect(all, command).toContain(command);
    }
  });

  it("gives every job that needs built packages the build job's output", () => {
    // `--only` and the scripts suite assume dist/ exists. A job that runs them
    // without depending on `build` would fail, or pass against nothing.
    const build = jobs.find((j) => j.name === "build");
    expect(build.steps.some((s) => s.uses?.startsWith("actions/upload-artifact@"))).toBe(true);
    for (const name of [
      "lint",
      "typecheck",
      "test-packages",
      "test-scripts",
      "attestation",
      "conformance",
    ]) {
      const job = jobs.find((j) => j.name === name);
      expect(job.needs, name).toEqual(["build"]);
      expect(
        job.steps.some((s) => s.uses?.startsWith("actions/download-artifact@")),
        name
      ).toBe(true);
    }
  });

  it("keeps needs: and working-directory:", () => {
    expect(jobs.find((j) => j.name === "conformance").needs).toEqual(["build"]);
    const tf = planJob(jobs.find((j) => j.name === "terraform-validate"));
    expect(tf.requires).toEqual(["terraform"]);
    expect(tf.commands.every((c) => c.cwd === "terraform")).toBe(true);
  });
});

describe("parseWorkflowJobs refuses what it cannot represent", () => {
  it("rejects a multi-line run:", () => {
    const text = "jobs:\n  a:\n    steps:\n      - run: |\n          echo hi\n";
    expect(() => parseWorkflowJobs(text)).toThrow(/multi-line run/);
  });

  it("expands a matrix into one job per value", () => {
    const text =
      "jobs:\n  a:\n    strategy:\n      fail-fast: false\n      matrix:\n        v: [x, y]\n    steps:\n      - run: echo ${{ matrix.v }}\n";
    const [job] = parseWorkflowJobs(text);
    expect(expandMatrix(job).map((j) => planJob(j).commands[0].run)).toEqual(["echo x", "echo y"]);
  });

  it("rejects any other ${{ }} left in a run:", () => {
    const [job] = parseWorkflowJobs(
      "jobs:\n  a:\n    steps:\n      - run: echo ${{ github.sha }}\n"
    );
    expect(() => planJob(job)).toThrow(/\$\{\{ github\.sha \}\}/);
  });

  it("rejects an unknown action at planning time", () => {
    const [job] = parseWorkflowJobs("jobs:\n  a:\n    steps:\n      - uses: acme/deploy@v1\n");
    expect(() => planJob(job)).toThrow(/does not know how to run acme\/deploy@v1/);
  });
});
