// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendFileSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkFleetInventory } from "../lib/fleet-inventory.mjs";
import { checkContractTiers } from "../lib/contract-tiers.mjs";
import { ScaffoldError, applyPlan, planScaffold } from "./scaffold.mjs";
import { planAddWrites } from "./add-writes.mjs";
import { SCAFFOLD_OPTS as opts, TODAY, filesUnder, makeTempRepo } from "./test-fixture.mjs";

let tmp;
let twin;
beforeEach(() => {
  tmp = makeTempRepo();
  twin = makeTempRepo();
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  rmSync(twin, { recursive: true, force: true });
});

const PKG = "packages/foo-bar-mcp";
const registryOf = (root) => JSON.parse(readFileSync(join(root, "registry.json"), "utf8"));

describe("scaffold: --add-write-stubs", () => {
  it("on an untouched read-only scaffold yields exactly the --with-writes package", async () => {
    applyPlan(tmp, await planScaffold(tmp, opts, TODAY));
    const plan = await planAddWrites(tmp, "foo_bar");
    expect(plan.manual).toEqual([]);
    applyPlan(tmp, plan);

    applyPlan(twin, await planScaffold(twin, { ...opts, writes: true }, TODAY));
    expect(filesUnder(join(tmp, PKG))).toEqual(filesUnder(join(twin, PKG)));
    // The registry entry gains what the stubs need; the README row its count.
    const entry = registryOf(tmp).servers.at(-1);
    expect(entry).toMatchObject({ status: "experimental", governed: true });
    expect(entry.operational.terminalOperations.map((o) => o.tool)).toEqual([
      "foo_bar_delete_entity",
    ]);
    expect([...entry.tools].sort()).toEqual([...registryOf(twin).servers.at(-1).tools].sort());
    expect(readFileSync(join(tmp, "README.md"), "utf8")).toContain(
      readFileSync(join(twin, "README.md"), "utf8").match(/^\| \[foo-bar-mcp\].*$/m)[0]
    );
    expect(checkFleetInventory(tmp, registryOf(tmp))).toEqual([]);
    expect(checkContractTiers(registryOf(tmp))).toEqual([]);
  });

  it("leaves a file the contributor changed alone and lists the lines to add", async () => {
    applyPlan(tmp, await planScaffold(tmp, opts, TODAY));
    const server = join(tmp, PKG, "src/mcp-server/server.ts");
    appendFileSync(server, "// contributor note\n");
    const before = readFileSync(server, "utf8");
    const plan = await planAddWrites(tmp, "foo_bar");
    expect(plan.writes.has(`${PKG}/src/mcp-server/server.ts`)).toBe(false);
    const manual = plan.manual.find((m) => m.path === `${PKG}/src/mcp-server/server.ts`);
    expect(manual.add.join("\n")).toMatch(/manifestUrl: new URL/);
    expect(manual.add.join("\n")).toContain("foo_bar_create_entity");
    applyPlan(tmp, plan);
    expect(readFileSync(server, "utf8")).toBe(before);
  });

  it("refuses an unknown server, a stable one, and a package that already has a stub", async () => {
    await expect(planAddWrites(tmp, "foo_bar")).rejects.toThrow(ScaffoldError);
    await expect(planAddWrites(tmp, "msads")).rejects.toThrow(/not experimental/);
    applyPlan(tmp, await planScaffold(tmp, opts, TODAY));
    writeFileSync(join(tmp, PKG, "src/mcp-server/tools/definitions/create-entity.tool.ts"), "x");
    await expect(planAddWrites(tmp, "foo_bar")).rejects.toThrow(
      /create-entity\.tool\.ts already exists/
    );
  });
});
