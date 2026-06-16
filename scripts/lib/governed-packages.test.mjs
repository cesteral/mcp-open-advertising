import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  declaredGovernedPackages,
  isDeclaredGoverned,
  assertManifestCoverage,
} from "./governed-packages.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const registry = {
  servers: [
    { package: "dbm-mcp", governed: false },
    { package: "dv360-mcp", governed: true },
    { package: "ttd-mcp", governed: true },
  ],
};

describe("declaredGovernedPackages", () => {
  it("returns only the packages flagged governed: true", () => {
    expect(declaredGovernedPackages(registry)).toEqual(new Set(["dv360-mcp", "ttd-mcp"]));
  });

  it("isDeclaredGoverned reflects the flag", () => {
    expect(isDeclaredGoverned(registry, "dv360-mcp")).toBe(true);
    expect(isDeclaredGoverned(registry, "dbm-mcp")).toBe(false);
    expect(isDeclaredGoverned(registry, "not-a-package")).toBe(false);
  });
});

describe("assertManifestCoverage", () => {
  it("passes when produced counts match the declared set", () => {
    const failures = assertManifestCoverage({
      registry,
      entryCounts: { "dbm-mcp": 0, "dv360-mcp": 12, "ttd-mcp": 8 },
    });
    expect(failures).toEqual([]);
  });

  it("fails a declared-governed package that produced no entries (the fail-open regression)", () => {
    const failures = assertManifestCoverage({
      registry,
      entryCounts: { "dbm-mcp": 0, "dv360-mcp": 0, "ttd-mcp": 8 },
    });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("dv360-mcp");
    expect(failures[0]).toContain('"governed": true');
  });

  it("fails a declared-governed package that was never booted (missing count = 0)", () => {
    const failures = assertManifestCoverage({
      registry,
      entryCounts: { "dbm-mcp": 0, "ttd-mcp": 8 },
    });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("dv360-mcp");
  });

  it("fails a declared-ungoverned package that unexpectedly produced entries (stale flag)", () => {
    const failures = assertManifestCoverage({
      registry,
      entryCounts: { "dbm-mcp": 3, "dv360-mcp": 12, "ttd-mcp": 8 },
    });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("dbm-mcp");
    expect(failures[0]).toContain("stale");
  });

  it("fails a server missing the required governed field", () => {
    const failures = assertManifestCoverage({
      registry: { servers: [{ package: "new-mcp" }] },
      entryCounts: { "new-mcp": 5 },
    });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("missing the required");
  });
});

describe("registry.json is fully classified", () => {
  it("every real server declares a boolean governed flag", () => {
    const real = JSON.parse(readFileSync(join(ROOT, "registry.json"), "utf-8"));
    const unclassified = real.servers.filter((s) => typeof s.governed !== "boolean");
    expect(unclassified.map((s) => s.package)).toEqual([]);
  });

  it("dbm-mcp is the only ungoverned (reporting-only) server", () => {
    const real = JSON.parse(readFileSync(join(ROOT, "registry.json"), "utf-8"));
    const ungoverned = real.servers.filter((s) => s.governed === false).map((s) => s.package);
    expect(ungoverned).toEqual(["dbm-mcp"]);
  });
});
