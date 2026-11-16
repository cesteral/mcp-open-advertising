// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// The reporting server types: read-only scaffold, the write stage
// (--add-write-stubs) and promotion, checked with the same fleet checks the
// management type is.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { checkFleetInventory } from "../lib/fleet-inventory.mjs";
import { checkContractTiers } from "../lib/contract-tiers.mjs";
import { checkPlatformNames, checkRegistryKeys } from "../lib/platform-keys.mjs";
import { applyPlan, planScaffold } from "./scaffold.mjs";
import { planAddWrites } from "./add-writes.mjs";
import { planPromotion } from "./promote.mjs";
import { expectedTodoTools } from "./expected-todo.mjs";
import { TEMPLATE_DIR, renderTemplate } from "./render.mjs";
import { SCAFFOLD_OPTS, TODAY, filesUnder, makeTempRepo } from "./test-fixture.mjs";

const PKG = "packages/foo-bar-mcp";
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

const read = (root, p) => readFileSync(join(root, p), "utf8");
const registryOf = (root) => JSON.parse(read(root, "registry.json"));
function fleetChecks(root) {
  const reg = registryOf(root);
  return [
    ...checkFleetInventory(root, reg),
    ...checkContractTiers(reg),
    ...checkRegistryKeys(reg),
    ...checkPlatformNames(reg, (p) => read(root, p)),
  ];
}

describe("scaffold: the reporting type", () => {
  const opts = { ...SCAFFOLD_OPTS, type: "reporting" };

  it("scaffolds an experimental, ungoverned, read-only server that passes the fleet checks", async () => {
    applyPlan(tmp, await planScaffold(tmp, opts, TODAY));
    const entry = registryOf(tmp).servers.at(-1);
    expect(entry).toMatchObject({ type: "reporting", status: "experimental", governed: false });
    expect(entry.tools.sort()).toEqual(
      ["get_pacing_status", "get_report", "list_accounts", "search_tools"]
        .map((t) => `foo_bar_${t}`)
        .sort()
    );
    expect(entry.operational.terminalOperations).toEqual([]);
    expect(fleetChecks(tmp)).toEqual([]);
    expect(read(tmp, "docs/CROSS_SERVER_CONTRACT.md")).toMatch(
      /^\| foo-bar-mcp\s+\| `foo_bar`\s+\| Reporting only\s+\|/m
    );
  });

  it("the read-only render carries no governance block and no manifest wiring", () => {
    const vars = {
      key: "foo_bar",
      package: "foo-bar-mcp",
      Pascal: "FooBar",
      ENV: "FOO_BAR",
      displayName: "Foo Bar Ads",
      port: "3014",
      baseUrl: "https://api.foobar.example",
      docsUrl: "https://docs.foobar.example",
      rateLimitPerMinute: "25",
    };
    const rendered = renderTemplate(TEMPLATE_DIR, "reporting", vars);
    for (const [path, text] of rendered) {
      expect(text, path).not.toMatch(/cesteral: \{/);
      expect(text, path).not.toMatch(/manifestUrl:\s*new URL\(/);
      expect(text, path).not.toContain("{{");
    }
  });

  it("--add-write-stubs on an untouched scaffold equals a --with-writes scaffold", async () => {
    applyPlan(tmp, await planScaffold(tmp, opts, TODAY));
    const plan = await planAddWrites(tmp, "foo_bar");
    expect(plan.manual).toEqual([]);
    applyPlan(tmp, plan);
    applyPlan(twin, await planScaffold(twin, { ...opts, writes: true }, TODAY));
    expect(filesUnder(join(tmp, PKG))).toEqual(filesUnder(join(twin, PKG)));
    // Every tool the write stage adds is registered; only submit_report is a governed write.
    const added = registryOf(tmp)
      .servers.at(-1)
      .tools.filter((t) => /report_status|download_report|submit_report/.test(t));
    expect(added.sort()).toEqual([
      "foo_bar_check_report_status",
      "foo_bar_download_report",
      "foo_bar_submit_report",
    ]);
    expect(expectedTodoTools("foo_bar", { type: "reporting", writes: true })).toEqual([
      "foo_bar_submit_report",
    ]);
    expect(registryOf(tmp).servers.at(-1).governed).toBe(true);
    expect(fleetChecks(tmp)).toEqual([]);
  });

  it("promotes while still read-only: the reporting type has no write requirement", async () => {
    applyPlan(tmp, await planScaffold(tmp, opts, TODAY));
    applyPlan(tmp, await planPromotion(tmp, "foo_bar"));
    expect(registryOf(tmp).servers.at(-1).status).toBe("stable");
    expect(fleetChecks(tmp)).toEqual([]);
  });
});
