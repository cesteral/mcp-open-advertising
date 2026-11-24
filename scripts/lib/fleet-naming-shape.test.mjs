// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Ratchets (#235): two cross-server conventions that drifted because nothing
// checked them.
//
// 1. Prompt names carry the server's tool prefix. dv360 and dbm shipped
//    `bulk_operations_workflow`, `troubleshoot_underdelivery`,
//    `custom_query_workflow`...; `creative_upload_workflow` was on five
//    servers and `creative_setup_workflow` on three, so a client connected to
//    several servers saw colliding names for different content. The only
//    unprefixed names are the shared cross-platform prompts, which are
//    byte-identical on every server by design (cross-platform-prompts.test.mjs).
//
// 2. A multi-item write reports `results[]` + `successCount` + `failureCount`
//    (docs/CROSS_SERVER_CONTRACT.md, "Bulk Result Conventions"). cm360, msads,
//    ttd_bulk_manage_bid_lists, the multi-id delete_entity and adjust_bids
//    diverged until the 2026-11 contract bump (#235, #248) fixed them together
//    with the tool hints; the shrink-only allowlist that held them is gone, so
//    a new multi-item write follows the convention from its first commit.
//
// Reads the fleet snapshot (fleet-snapshot-inject.mjs); boots nothing.

import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./boot-server.mjs";
import { serverSnapshot, toolsOf } from "./fleet-snapshot-inject.mjs";
import { registryPrefixes } from "../../evals/lib/merged-catalog.mjs";

const packages = readdirSync(join(ROOT, "packages"))
  .filter((p) => p.endsWith("-mcp"))
  .sort();
const prefixes = registryPrefixes();

/** Prompts every server registers, from @cesteral/shared. */
const SHARED_PROMPTS = new Set([
  "cross_platform_campaign_setup",
  "cross_platform_performance_comparison",
]);

/**
 * Every tool that writes several items in one call. `delete_entity` is one
 * only where it takes `entityIds[]` (amazon-dsp, msads, pinterest, snapchat,
 * tiktok); the single-id deletes report one entity.
 */
const MULTI_ITEM_WRITE =
  /_(bulk_create_entities|bulk_update_entities|bulk_update_status|adjust_bids|adjust_line_item_bids|archive_entities|bulk_manage_bid_lists)$/;
const isMultiItemWrite = (t) =>
  MULTI_ITEM_WRITE.test(t.name) ||
  (/_delete_entity$/.test(t.name) && "entityIds" in (t.inputSchema?.properties ?? {}));

const REQUIRED_KEYS = ["results", "successCount", "failureCount"];

describe("prompt names are prefixed (#235)", () => {
  for (const pkg of packages) {
    it(`${pkg}: every server-specific prompt starts with the tool prefix`, () => {
      const prefix = prefixes.get(pkg);
      expect(prefix, `${pkg} has no tool prefix`).toBeTruthy();
      const bad = serverSnapshot(pkg)
        .prompts.map((p) => p.prompt.name)
        .filter((name) => !SHARED_PROMPTS.has(name) && !name.startsWith(`${prefix}_`));
      expect(bad, `${pkg} prompts missing the "${prefix}_" prefix`).toEqual([]);
    });
  }

  it("no two servers register the same server-specific prompt name", () => {
    const owner = new Map();
    const clashes = [];
    for (const pkg of packages) {
      for (const { prompt } of serverSnapshot(pkg).prompts) {
        if (SHARED_PROMPTS.has(prompt.name)) continue;
        if (owner.has(prompt.name))
          clashes.push(`${prompt.name}: ${owner.get(prompt.name)}, ${pkg}`);
        else owner.set(prompt.name, pkg);
      }
    }
    expect(clashes).toEqual([]);
  });
});

describe("multi-item write result shape (#235, #248)", () => {
  const bulkTools = packages.flatMap((pkg) =>
    toolsOf(pkg)
      .filter(isMultiItemWrite)
      .map((t) => ({
        name: t.name,
        keys: Object.keys(t.outputSchema?.properties ?? {}),
        item: t.outputSchema?.properties?.results?.items?.properties,
        types: Object.fromEntries(
          Object.entries(t.outputSchema?.properties ?? {}).map(([k, v]) => [k, v?.type])
        ),
      }))
  );

  it("finds the multi-item write tools", () => {
    // 3 bulk tools + adjust_bids on 11 servers' worth, archive, bid lists, 5 multi-id deletes.
    expect(bulkTools.length).toBeGreaterThan(45);
    for (const must of [
      "cm360_bulk_create_entities",
      "msads_bulk_update_entities",
      "ttd_bulk_manage_bid_lists",
      "tiktok_delete_entity",
      "dv360_adjust_line_item_bids",
    ])
      expect(
        bulkTools.map((t) => t.name),
        must
      ).toContain(must);
  });

  it("every multi-item write publishes results, successCount and failureCount", () => {
    const bad = bulkTools
      .filter((t) => REQUIRED_KEYS.some((k) => !t.keys.includes(k)))
      .map((t) => `${t.name}: has ${t.keys.join(",")}`);
    expect(bad).toEqual([]);
  });

  it("no multi-item write keeps a retired counter name", () => {
    const retired = [
      "created",
      "updated",
      "failed",
      "succeeded",
      "totalSucceeded",
      "totalFailed",
      "totalSuccessful",
      "succeededCount",
      "failedCount",
      "deletedCount",
      "adjustmentCount",
    ];
    const bad = bulkTools
      .map((t) => ({
        name: t.name,
        // dv360's `failed[]` array is a sanctioned sub-array; a retired COUNTER is a number.
        hit: t.keys.filter((k) => retired.includes(k) && t.types[k] !== "array"),
      }))
      .filter((t) => t.hit.length)
      .map((t) => `${t.name}: ${t.hit.join(",")}`);
    expect(bad).toEqual([]);
  });

  it("a typed per-item result says whether the item succeeded", () => {
    const bad = bulkTools.filter((t) => t.item && !("success" in t.item)).map((t) => t.name);
    expect(bad).toEqual([]);
  });
});

describe("gads_bulk_mutate keeps Google's native response and still reports counts", () => {
  it("exposes mutateResult, operationCount, successCount and failureCount", () => {
    const tool = toolsOf("gads-mcp").find((t) => t.name === "gads_bulk_mutate");
    const keys = Object.keys(tool?.outputSchema?.properties ?? {});
    for (const k of ["mutateResult", "operationCount", "successCount", "failureCount"])
      expect(keys, k).toContain(k);
  });
});
