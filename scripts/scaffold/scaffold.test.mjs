// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DERIVED, INVENTORY_SITES, checkFleetInventory } from "../lib/fleet-inventory.mjs";
import { checkContractTiers } from "../lib/contract-tiers.mjs";
import { checkRegistryKeys } from "../lib/platform-keys.mjs";
import { validateLedger } from "../check/check-platform-facts.mjs";
import { ScaffoldError, applyPlan, planScaffold } from "./scaffold.mjs";

const ROOT = join(import.meta.dirname, "../..");
const TODAY = "2026-11-15";

const opts = {
  key: "foo_bar",
  displayName: "Foo Bar Ads",
  type: "management",
  baseUrl: "https://api.foobar.example",
  docsUrl: "https://developers.foobar.example/docs",
  rateLimitPerMinute: 25,
};

const COPIED = [
  "registry.json",
  "platform-facts.json",
  "README.md",
  "docs/architecture/platform-facts-ledger.md",
  ...new Set(INVENTORY_SITES.map((s) => s.file)),
  ...DERIVED.map((d) => d.file),
];

let tmp;

/** A temp repo root: the files the scaffold edits, plus every package's config (for ports). */
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "scaffold-"));
  for (const file of new Set(COPIED)) {
    mkdirSync(dirname(join(tmp, file)), { recursive: true });
    cpSync(join(ROOT, file), join(tmp, file));
  }
  const registry = JSON.parse(readFileSync(join(ROOT, "registry.json"), "utf8"));
  for (const { package: pkg } of registry.servers) {
    const config = `packages/${pkg}/src/config/index.ts`;
    mkdirSync(dirname(join(tmp, config)), { recursive: true });
    cpSync(join(ROOT, config), join(tmp, config));
  }
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

const snapshot = () => new Map(COPIED.map((f) => [f, readFileSync(join(tmp, f), "utf8")]));

describe("scaffold: plan and apply", () => {
  it("plans a package, registry entry, facts and every site, and writes nothing", async () => {
    const before = snapshot();
    const plan = await planScaffold(tmp, opts, TODAY);
    expect(plan.created).toContain("packages/foo-bar-mcp/package.json");
    expect(plan.created).toContain("packages/foo-bar-mcp/src/auth/foo_bar-auth-adapter.ts");
    for (const f of ["registry.json", "platform-facts.json", "README.md"]) {
      expect(plan.modified).toContain(f);
    }
    for (const f of new Set(INVENTORY_SITES.map((s) => s.file))) expect(plan.modified).toContain(f);
    expect(snapshot()).toEqual(before);
    expect(existsSync(join(tmp, "packages/foo-bar-mcp"))).toBe(false);
  });

  it("refuses a taken key, prefix or port", async () => {
    await expect(planScaffold(tmp, { ...opts, key: "msads" }, TODAY)).rejects.toThrow(
      /platform_key "msads" .*msads-mcp/
    );
    await expect(planScaffold(tmp, { ...opts, port: 3013 }, TODAY)).rejects.toThrow(
      /port 3013 .*msads-mcp/
    );
    await expect(planScaffold(tmp, { ...opts, key: "Foo-Bar" }, TODAY)).rejects.toThrow(
      ScaffoldError
    );
  });

  it("refuses an existing package and writes nothing", async () => {
    mkdirSync(join(tmp, "packages/foo-bar-mcp"));
    const before = snapshot();
    await expect(planScaffold(tmp, opts, TODAY)).rejects.toThrow(/packages\/foo-bar-mcp/);
    expect(snapshot()).toEqual(before);
  });

  it("refuses an unsupported type", async () => {
    await expect(planScaffold(tmp, { ...opts, type: "reporting" }, TODAY)).rejects.toThrow(
      /not supported yet.*PR 3/
    );
  });

  it("refuses a port that is not a usable integer", async () => {
    for (const port of [Number("abc"), 70000, 3.5, 80]) {
      await expect(planScaffold(tmp, { ...opts, port }, TODAY)).rejects.toThrow(ScaffoldError);
    }
  });

  it("links the package's LICENSE.md to the root one, as every package does", async () => {
    // publish-all.sh packs every registry server; inspect-tarball fails on a
    // missing LICENSE.md, which would block the whole fleet's release.
    cpSync(join(ROOT, "LICENSE.md"), join(tmp, "LICENSE.md"));
    applyPlan(tmp, await planScaffold(tmp, opts, TODAY));
    const license = join(tmp, "packages/foo-bar-mcp/LICENSE.md");
    expect(lstatSync(license).isSymbolicLink()).toBe(true);
    expect(readlinkSync(license)).toBe("../../LICENSE.md");
    expect(readFileSync(license, "utf8")).toBe(readFileSync(join(ROOT, "LICENSE.md"), "utf8"));
  });

  it("refuses a base URL that is not a URL", async () => {
    await expect(planScaffold(tmp, { ...opts, baseUrl: "api.foobar" }, TODAY)).rejects.toThrow(
      ScaffoldError
    );
  });

  it("applyPlan then fleet-inventory, contract-tiers, platform-keys and facts checks pass", async () => {
    applyPlan(tmp, await planScaffold(tmp, opts, TODAY));
    const registry = JSON.parse(readFileSync(join(tmp, "registry.json"), "utf8"));
    expect(registry.servers.at(-1).package).toBe("foo-bar-mcp");
    expect(checkFleetInventory(tmp, registry)).toEqual([]);
    expect(checkContractTiers(registry)).toEqual([]);
    expect(checkRegistryKeys(registry)).toEqual([]);
    const ledger = JSON.parse(readFileSync(join(tmp, "platform-facts.json"), "utf8"));
    expect(validateLedger(ledger)).toEqual([]);
    // Each fact's codeRef line holds the value it claims.
    const config = readFileSync(join(tmp, "packages/foo-bar-mcp/src/config/index.ts"), "utf8");
    for (const fact of ledger.facts.filter((f) => f.package === "foo-bar-mcp")) {
      const line = Number(fact.codeRefs[0].split(":").at(-1));
      expect(config.split("\n")[line - 1], fact.id).toContain(fact.value);
    }
  });

  it("the platform-facts doc counts the new facts", async () => {
    // scripts/__tests__/check-platform-facts.test.mjs asserts the doc's total.
    applyPlan(tmp, await planScaffold(tmp, opts, TODAY));
    const ledger = JSON.parse(readFileSync(join(tmp, "platform-facts.json"), "utf8"));
    const doc = readFileSync(join(tmp, "docs/architecture/platform-facts-ledger.md"), "utf8");
    const count = (cls) => ledger.facts.filter((f) => f.class === cls).length;
    expect(doc).toContain(`— ${ledger.facts.length} facts:`);
    expect(doc).toContain(
      `the ${count("versioned-base-url") + count("unversioned-base-url")} versioned and unversioned API base URLs`
    );
    expect(doc).toContain(
      `(${ledger.facts.filter((f) => f.id.endsWith(".rate_limit_default")).length} \`<platform>.rate_limit_default\` facts`
    );
  });

  it("the registry file keeps its formatting apart from the new entry", async () => {
    const before = readFileSync(join(tmp, "registry.json"), "utf8");
    applyPlan(tmp, await planScaffold(tmp, opts, TODAY));
    const after = readFileSync(join(tmp, "registry.json"), "utf8");
    const head = before.slice(0, before.lastIndexOf("    }\n  ]"));
    expect(after.startsWith(head)).toBe(true);
  });
});
