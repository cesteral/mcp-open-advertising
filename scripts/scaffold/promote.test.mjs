// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEPLOY_SITE_FILES, checkFleetInventory } from "../lib/fleet-inventory.mjs";
import { checkContractTiers } from "../lib/contract-tiers.mjs";
import { checkRegistryKeys } from "../lib/platform-keys.mjs";
import { validateLedger } from "../check/check-platform-facts.mjs";
import { ScaffoldError, applyPlan, planScaffold } from "./scaffold.mjs";
import { planAddWrites } from "./add-writes.mjs";
import { planPromotion } from "./promote.mjs";
import { SCAFFOLD_OPTS as opts, TODAY, makeTempRepo } from "./test-fixture.mjs";

let tmp;
beforeEach(() => {
  tmp = makeTempRepo();
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

const read = (p) => readFileSync(join(tmp, p), "utf8");
const registry = () => JSON.parse(read("registry.json"));
const snapshot = () => new Map(["registry.json", ...DEPLOY_SITE_FILES].map((f) => [f, read(f)]));

describe("scaffold: promote:server", () => {
  it("the journey: read-only → --add-write-stubs → promote leaves every check green", async () => {
    applyPlan(tmp, await planScaffold(tmp, opts, TODAY));
    applyPlan(tmp, await planAddWrites(tmp, "foo_bar"));
    applyPlan(tmp, await planPromotion(tmp, "foo_bar"));

    const reg = registry();
    const entry = reg.servers.at(-1);
    expect(entry).toMatchObject({ package: "foo-bar-mcp", status: "stable", governed: true });
    for (const t of ["create_entity", "update_entity", "delete_entity", "bulk_update_status"]) {
      expect(entry.tools).toContain(`foo_bar_${t}`);
    }
    expect(entry.operational.terminalOperations.map((o) => o.tool)).toEqual([
      "foo_bar_delete_entity",
    ]);
    expect(read("packages/foo-bar-mcp/src/mcp-server/server.ts")).toMatch(
      /manifestUrl:\s*new URL\(/
    );
    for (const file of DEPLOY_SITE_FILES) expect(read(file), file).toContain("foo-bar-mcp");
    expect(checkFleetInventory(tmp, reg)).toEqual([]);
    expect(checkContractTiers(reg)).toEqual([]);
    expect(checkRegistryKeys(reg)).toEqual([]);
    expect(validateLedger(JSON.parse(read("platform-facts.json")))).toEqual([]);
  });

  it("refuses a read-only server, naming the write tools it lacks, and writes nothing", async () => {
    applyPlan(tmp, await planScaffold(tmp, opts, TODAY));
    const before = snapshot();
    const err = await planPromotion(tmp, "foo_bar").catch((e) => e);
    expect(err).toBeInstanceOf(ScaffoldError);
    for (const t of ["create_entity", "update_entity", "delete_entity", "bulk_update_status"]) {
      expect(err.message).toContain(`foo_bar_${t}`);
    }
    expect(snapshot()).toEqual(before);
  });

  it("refuses when a write SHOULD has no exception, so promotion cannot leave CI red", async () => {
    applyPlan(tmp, await planScaffold(tmp, opts, TODAY));
    applyPlan(tmp, await planAddWrites(tmp, "foo_bar"));
    const reg = registry();
    const entry = reg.servers.at(-1);
    entry.contract.exceptions = entry.contract.exceptions.filter(
      (e) => e.requirement !== "duplicate_entity"
    );
    writeFileSync(join(tmp, "registry.json"), JSON.stringify(reg, null, 2) + "\n");
    await expect(planPromotion(tmp, "foo_bar")).rejects.toThrow(/foo_bar_duplicate_entity/);
  });

  it("refuses when a deploy list already names the server, rather than adding a duplicate", async () => {
    // A contributor who added the platform's secrets to mcp_secret_env_vars
    // early would otherwise get a second "foo-bar-mcp" = { block.
    applyPlan(tmp, await planScaffold(tmp, opts, TODAY));
    applyPlan(tmp, await planAddWrites(tmp, "foo_bar"));
    const tf = read("terraform/variables.tf").replace(
      "  default = {\n",
      '  default = {\n    "foo-bar-mcp" = {\n    }\n'
    );
    writeFileSync(join(tmp, "terraform/variables.tf"), tf);
    const before = snapshot();
    await expect(planPromotion(tmp, "foo_bar")).rejects.toThrow(
      /terraform\/variables\.tf already lists foo-bar-mcp/
    );
    expect(snapshot()).toEqual(before);
  });

  it("refuses an unknown server and a stable one", async () => {
    await expect(planPromotion(tmp, "foo_bar")).rejects.toThrow(/no server/);
    await expect(planPromotion(tmp, "msads")).rejects.toThrow(/already stable/);
  });
});
