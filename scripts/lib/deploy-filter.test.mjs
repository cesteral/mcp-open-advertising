// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// An experimental server never reaches a publish or deploy command.
//
// fleet-inventory.test.mjs proves each deploy consumer *reads* `fleet.mjs
// deployable`; that does not prove every branch of a script uses the result.
// This runs the scripts themselves against a fixture registry (one stable, one
// experimental server) with every external command they call replaced by a
// stand-in that logs its working directory and arguments, and asserts the
// experimental package appears in no logged call and no output line.

import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT } from "./boot-server.mjs";

const STABLE = "zzstable-mcp";
const EXPERIMENTAL = "zzexp-mcp";
const SHIMMED = ["npm", "pnpm", "mcp-publisher", "gcloud", "docker", "terraform", "curl"];

/** A temp repo with the deploy scripts, the fixture registry and logging stand-ins. */
function fixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), "deploy-filter-"));
  for (const file of [
    "scripts/publish-all.sh",
    "scripts/deploy.sh",
    "scripts/smoke-test.sh",
    "scripts/fleet.mjs",
    "scripts/lib/server-status.mjs",
  ]) {
    mkdirSync(join(root, file, ".."), { recursive: true });
    cpSync(join(ROOT, file), join(root, file));
  }
  writeFileSync(
    join(root, "registry.json"),
    JSON.stringify({
      servers: [
        { package: STABLE, port: 3901, status: "stable" },
        { package: EXPERIMENTAL, port: 3902, status: "experimental" },
      ],
    })
  );
  for (const pkg of ["shared", "contract-hash", "contract-schema", STABLE, EXPERIMENTAL]) {
    mkdirSync(join(root, "packages", pkg), { recursive: true });
  }
  mkdirSync(join(root, "terraform"));
  const bin = join(root, "bin");
  mkdirSync(bin);
  const log = join(root, "calls.log");
  for (const cmd of SHIMMED) {
    const path = join(bin, cmd);
    // `terraform output -json` must print JSON: deploy.sh parses it.
    writeFileSync(
      path,
      `#!/bin/sh\necho "${cmd} $PWD $*" >> "${log}"\n` +
        (cmd === "terraform" ? `case "$*" in *"output -json"*) echo '{}';; esac\n` : "")
    );
    chmodSync(path, 0o755);
  }
  execFileSync("git", ["init", "-q"], { cwd: root });
  return {
    root,
    log,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GCP_PROJECT_DEV: "p" },
  };
}

function run(repo, script, args) {
  const r = spawnSync("bash", [join(repo.root, script), ...args], {
    cwd: repo.root,
    env: repo.env,
    input: "no\n",
    encoding: "utf8",
  });
  let calls = "";
  try {
    calls = readFileSync(repo.log, "utf8");
  } catch {
    calls = "";
  }
  return { output: `${r.stdout}\n${r.stderr}`, calls };
}

describe("an experimental server reaches no publish or deploy command", () => {
  it.each([
    ["scripts/publish-all.sh", ["--registry-only", "--dry-run"]],
    ["scripts/publish-all.sh", ["--dry-run"]],
    ["scripts/deploy.sh", ["dev"]],
    ["scripts/smoke-test.sh", ["dev"]],
  ])("%s %s", (script, args) => {
    const repo = fixtureRepo();
    try {
      const { output, calls } = run(repo, script, args);
      const seen = `${calls}\n${output}`;
      // Not vacuous: the stable fixture got as far as a command or the output.
      expect(seen, `${script} never reached the stable fixture`).toContain(STABLE);
      expect(seen, `${script} touched the experimental fixture`).not.toContain(EXPERIMENTAL);
    } finally {
      rmSync(repo.root, { recursive: true, force: true });
    }
  });

  it("Cloud Build names services only through the deployable list", () => {
    for (const file of ["cloudbuild.yaml", "cloudbuild-manual.yaml"]) {
      const text = readFileSync(join(ROOT, file), "utf8");
      const steps = text.slice(0, text.search(/^images:/m));
      expect(steps, file).toContain("fleet.mjs deployable > /workspace/.fleet-services");
      expect(steps, file).not.toMatch(/fleet\.mjs"? servers/);
    }
  });

  const hasTerraform = spawnSync("terraform", ["version"]).status === 0;
  it.skipIf(!hasTerraform)("Terraform's service list is the stable servers", () => {
    const main = readFileSync(join(ROOT, "terraform/main.tf"), "utf8");
    const expr = main.match(/^\s*fleet_service_names = (.+)$/m)[1];
    const dir = mkdtempSync(join(tmpdir(), "deploy-filter-tf-"));
    try {
      mkdirSync(join(dir, "module"));
      writeFileSync(
        join(dir, "registry.json"),
        JSON.stringify({
          servers: [
            { package: STABLE, status: "stable" },
            { package: EXPERIMENTAL, status: "experimental" },
            { package: "zznostatus-mcp" },
          ],
        })
      );
      writeFileSync(
        join(dir, "module", "main.tf"),
        `locals {\n  fleet_service_names = ${expr}\n}\n`
      );
      const out = execFileSync("terraform", ["console"], {
        cwd: join(dir, "module"),
        input: "jsonencode(local.fleet_service_names)\n",
        encoding: "utf8",
      });
      expect(JSON.parse(JSON.parse(out.trim()))).toEqual([STABLE]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
