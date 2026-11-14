// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Release-pipeline hygiene (#299). npm provenance is only as trustworthy as the
// workflow that produced it, so these pin the properties that are easy to lose
// in a later edit: every action is pinned to a commit, the token is read-only
// unless a job asks for more, and the npm token never shares a step with the
// downloaded MCP Registry binary. Static: reads the workflow files, runs nothing.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "./boot-server.mjs";

const WORKFLOW_DIR = join(ROOT, ".github", "workflows");
const workflows = readdirSync(WORKFLOW_DIR)
  .filter((f) => f.endsWith(".yml"))
  .map((f) => ({ file: f, text: readFileSync(join(WORKFLOW_DIR, f), "utf8") }));

/** `uses:` values, excluding comments and local (`./`) actions. */
export function usesRefs(text) {
  const refs = [];
  for (const line of text.split("\n")) {
    const m = /^\s*(?:-\s+)?uses:\s*(\S+)/.exec(line);
    if (m && !m[1].startsWith("./")) refs.push({ ref: m[1], line });
  }
  return refs;
}

describe("usesRefs", () => {
  it("finds step and inline uses, skipping local actions", () => {
    const text = [
      "      - uses: actions/checkout@abc",
      "        uses: other/thing@def",
      "      - uses: ./local",
      "      # uses: commented/out@v1",
    ].join("\n");
    expect(usesRefs(text).map((r) => r.ref)).toEqual(["actions/checkout@abc", "other/thing@def"]);
  });
});

describe("workflow action pins", () => {
  it("found workflows with actions (an empty scan would make the rest vacuous)", () => {
    expect(workflows.length).toBeGreaterThanOrEqual(6);
    expect(workflows.flatMap((w) => usesRefs(w.text)).length).toBeGreaterThan(15);
  });

  it.each(workflows.map((w) => [w.file, w]))(
    "%s pins every action to a 40-character commit SHA",
    (_file, w) => {
      for (const { ref } of usesRefs(w.text)) {
        expect(ref, `${w.file}: ${ref}`).toMatch(/^[^@\s]+@[0-9a-f]{40}$/);
      }
    }
  );

  it.each(workflows.map((w) => [w.file, w]))(
    "%s names the version beside each pin",
    (_file, w) => {
      for (const { ref, line } of usesRefs(w.text)) {
        expect(line, `${w.file}: ${ref}`).toMatch(/#\s*v\d+(\.\d+)*\s*$/);
      }
    }
  );
});

describe("workflow token permissions", () => {
  it.each(workflows.map((w) => [w.file, w]))(
    "%s declares contents: read and no repository write at workflow level",
    (_file, w) => {
      // The scheduled workflows that file issues or authenticate to GCP keep
      // `issues: write` / `id-token: write`; what must never be workflow-wide is
      // a write to the repository contents.
      const top = /^permissions:\n((?:[ ]{2}\S.*\n)+)/m.exec(w.text);
      expect(top, `${w.file} has no top-level permissions block`).not.toBeNull();
      expect(top[1]).toMatch(/contents:\s*read/);
      expect(top[1]).not.toMatch(/contents:\s*write/);
    }
  );
});

describe("release.yml", () => {
  const release = workflows.find((w) => w.file === "release.yml").text;

  /** The text of one job, from its key to the next job (or the end). */
  function job(name) {
    const start = release.indexOf(`\n  ${name}:\n`);
    expect(start, `job ${name}`).toBeGreaterThan(-1);
    const rest = release.slice(start + 1);
    const next = rest.slice(1).search(/\n  [a-z][a-z-]*:\n/);
    return next === -1 ? rest : rest.slice(0, next + 1);
  }

  it("keeps the tag shapes and the file name npm provenance records", () => {
    expect(release).toContain('- "v[0-9]+.[0-9]+.[0-9]+"');
    expect(release).toContain('- "contract-v[0-9]+.[0-9]+.[0-9]+"');
  });

  it("gives contents: write only to the GitHub Release jobs", () => {
    for (const name of ["release", "release-contracts"]) {
      expect(job(name), name).not.toMatch(/contents:\s*write/);
      expect(job(name), name).toMatch(/id-token:\s*write/);
    }
    for (const name of ["github-release", "github-release-contracts"]) {
      expect(job(name), name).toMatch(/contents:\s*write/);
      expect(job(name), name).not.toMatch(/id-token/);
      expect(job(name), name).not.toMatch(/NPM_TOKEN/);
    }
  });

  it("never gives the npm token to a step that runs the MCP Registry binary", () => {
    const steps = job("release").split(/\n      - /);
    const withToken = steps.filter((s) => s.includes("NPM_TOKEN"));
    expect(withToken).toHaveLength(1);
    expect(withToken[0]).toContain("--npm-only");
    expect(withToken[0]).not.toContain("mcp-publisher");
    const registry = steps.filter((s) => /publish-all\.sh\s+--registry-only/.test(s));
    expect(registry).toHaveLength(1);
    expect(registry[0]).not.toContain("NPM_TOKEN");
  });

  it("installs a fixed mcp-publisher and checks its hash before unpacking", () => {
    expect(release).not.toContain("releases/latest");
    expect(release).toMatch(/MCP_PUBLISHER_VERSION:\s*v\d+\.\d+\.\d+/);
    expect(release).toMatch(/MCP_PUBLISHER_SHA256:\s*[0-9a-f]{64}/);
    const install = release.slice(release.indexOf("Install mcp-publisher"));
    expect(install.indexOf("sha256sum -c")).toBeGreaterThan(-1);
    expect(install.indexOf("sha256sum -c")).toBeLessThan(install.indexOf("tar -xzf"));
  });
});
