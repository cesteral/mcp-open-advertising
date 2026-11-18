// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.

import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  CENSUS,
  DERIVED,
  INVENTORY_SITES,
  checkFleetInventory,
  readRegistry,
} from "../lib/fleet-inventory.mjs";
import { SITE_INSERTERS, insertIntoSites, insertReadmeRow } from "./sites.mjs";
import { DEPLOY_SITE_FILES } from "../lib/fleet-inventory.mjs";

const ROOT = join(import.meta.dirname, "../..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const server = (key) => {
  const pkg = `${key.replaceAll("_", "-")}-mcp`;
  return {
    key,
    package: pkg,
    Pascal: "Zzscaffold",
    ENV: key.toUpperCase(),
    displayName: "ZZ Scaffold",
    authMode: `${key}-bearer`,
    secretEnvVars: {
      MCP_AUTH_SECRET_KEY: { secret_name: "cesteral-jwt-secret-key", version: "latest" },
    },
  };
};

const siteFiles = [...new Set(INVENTORY_SITES.map((s) => s.file))];

describe("scaffold: fleet-list inserters", () => {
  it("every inventory site file has an inserter", () => {
    expect(siteFiles.filter((f) => !(f in SITE_INSERTERS))).toEqual([]);
    expect(Object.keys(CENSUS).filter((f) => !(f in SITE_INSERTERS))).toEqual([]);
  });

  it("after insertion every site lists the new server", () => {
    const s = server("zzscaffold");
    const inserted = insertIntoSites(read, s);
    const tmp = mkdtempSync(join(tmpdir(), "scaffold-sites-"));
    try {
      const files = new Set([...siteFiles, ...DERIVED.map((d) => d.file)]);
      for (const file of files) {
        mkdirSync(dirname(join(tmp, file)), { recursive: true });
        writeFileSync(join(tmp, file), inserted.get(file) ?? read(file));
      }
      const registry = readRegistry(ROOT);
      for (const { package: pkg } of registry.servers) {
        const config = `packages/${pkg}/src/config/index.ts`;
        mkdirSync(dirname(join(tmp, config)), { recursive: true });
        cpSync(join(ROOT, config), join(tmp, config));
      }
      const fake = {
        ...registry.servers.at(-1),
        package: s.package,
        port: 3999,
        tool_prefix: s.key,
        platform_key: s.key,
        tools: [`${s.key}_list_entities`, `${s.key}_search_tools`],
        auth: { modes: [s.authMode, "jwt", "oauth", "none"] },
      };
      const violations = checkFleetInventory(tmp, {
        ...registry,
        servers: [...registry.servers, fake],
      });
      expect(violations.filter((v) => !v.startsWith("registry.json"))).toEqual([]);
      // The only registry line is the package directory this test never creates.
      expect(violations).toEqual([
        `registry.json: lists ${s.package}, but packages/${s.package} does not exist`,
      ]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("deploy: false leaves every deploy site alone; listing: false leaves the rest", () => {
    const s = server("zzscaffold");
    const listingOnly = insertIntoSites(read, s, { deploy: false });
    const deployOnly = insertIntoSites(read, s, { listing: false });
    for (const file of DEPLOY_SITE_FILES) {
      expect(listingOnly.has(file), file).toBe(false);
      expect(deployOnly.get(file), file).toContain(s.package);
    }
    for (const file of siteFiles.filter((f) => !DEPLOY_SITE_FILES.includes(f))) {
      expect(deployOnly.has(file), file).toBe(false);
      expect(listingOnly.get(file), file).toContain(s.package);
    }
  });

  it("a missing reporting enum anchor throws, naming the file", () => {
    const file = "packages/shared/src/utils/reporting/report-errors.ts";
    const text = read(file).replace("export type ReportingPlatform =", "export type Renamed =");
    expect(() => SITE_INSERTERS[file](text, server("zzscaffold"))).toThrow(
      /report-errors\.ts.*ReportingPlatform/
    );
  });

  it("a missing anchor throws, naming the file", () => {
    const text = read("terraform/main.tf").replace("service_auth_defaults = {", "renamed = {");
    expect(() => SITE_INSERTERS["terraform/main.tf"](text, server("zzscaffold"))).toThrow(
      /terraform\/main\.tf.*service_auth_defaults/
    );
  });

  it("a multi-word key uses package spelling where lists hold packages", () => {
    const out = SITE_INSERTERS["terraform/main.tf"](read("terraform/main.tf"), server("foo_bar"));
    expect(out).toMatch(/"foo-bar-mcp" +=/);
  });

  it("an auth mode already in the bug-report dropdown is not added twice", () => {
    const s = { ...server("zzscaffold"), authMode: "jwt" };
    const file = ".github/ISSUE_TEMPLATE/bug_report.yml";
    const out = SITE_INSERTERS[file](read(file), s);
    expect(out.match(/^\s+- jwt$/gm)).toHaveLength(1);
  });

  it.skipIf(!hasTerraform())(
    "Terraform files stay terraform-fmt clean, even with a long key",
    () => {
      const s = server("a_much_longer_platform_key");
      const tmp = mkdtempSync(join(tmpdir(), "scaffold-fmt-"));
      try {
        const inserted = insertIntoSites(read, s);
        for (const file of siteFiles.filter((f) => f.startsWith("terraform/"))) {
          const out = join(tmp, file.replaceAll("/", "_").replace(/\.example$/, ""));
          writeFileSync(out, inserted.get(file));
          execFileSync("terraform", ["fmt", "-check", out], { stdio: "pipe" });
        }
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    }
  );

  it("the README row satisfies check:doc-tool-counts", () => {
    const out = insertReadmeRow(read("README.md"), {
      ...server("zzscaffold"),
      displayName: "ZZ Scaffold API v1",
      toolCount: 9,
      authLabel: "Bearer token",
    });
    // The same row regex check-doc-tool-counts.mjs's checkReadme uses.
    const lineRe = /^\|\s*\[([a-z0-9-]+-mcp)\]\([^)]+\)\s*\|[^|]+\|\s*(\d+)\s*\|/gm;
    const rows = new Map([...out.matchAll(lineRe)].map((m) => [m[1], Number(m[2])]));
    expect(rows.get("zzscaffold-mcp")).toBe(9);
    expect(rows.size).toBe(
      new Map([...read("README.md").matchAll(lineRe)].map((m) => [m[1]])).size + 1
    );
  });
});

function hasTerraform() {
  try {
    execFileSync("terraform", ["version"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
