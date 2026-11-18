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
// 2. A bulk write reports `results[]` + `successCount` + `failureCount`
//    (docs/CROSS_SERVER_CONTRACT.md, "Bulk Result Conventions"). cm360 and
//    msads diverge. Changing a governed tool's output schema moves its
//    definitionHash and needs the governance repo to admit the new hash, so
//    those five are an allowlist that may only shrink, not a fix made here.
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
 * Bulk write tools whose output predates the convention. An entry must still
 * diverge (the second test fails when it no longer does), and a new bulk tool
 * may not be added here: it follows the convention from its first commit.
 */
export const BULK_SHAPE_ALLOWLIST = new Set([
  "cm360_bulk_create_entities", // created / failed
  "cm360_bulk_update_entities", // updated / failed
  "cm360_bulk_update_status", // updated / failed
  "msads_bulk_create_entities", // totalItems only
  "msads_bulk_update_entities", // totalItems only
]);

const BULK_WRITE = /_bulk_(create_entities|update_entities|update_status)$/;
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

describe("bulk write result shape (#235)", () => {
  const bulkTools = packages.flatMap((pkg) =>
    toolsOf(pkg)
      .filter((t) => BULK_WRITE.test(t.name))
      .map((t) => ({
        name: t.name,
        keys: Object.keys(t.outputSchema?.properties ?? {}),
      }))
  );

  it("finds the bulk write tools", () => {
    expect(bulkTools.length).toBeGreaterThan(30);
  });

  it("every bulk write outside the allowlist publishes results, successCount and failureCount", () => {
    const bad = bulkTools
      .filter((t) => !BULK_SHAPE_ALLOWLIST.has(t.name))
      .filter((t) => REQUIRED_KEYS.some((k) => !t.keys.includes(k)))
      .map((t) => `${t.name}: has ${t.keys.join(",")}`);
    expect(bad).toEqual([]);
  });

  it("the allowlist only lists tools that still diverge", () => {
    const byName = new Map(bulkTools.map((t) => [t.name, t]));
    const stale = [...BULK_SHAPE_ALLOWLIST].filter((name) => {
      const t = byName.get(name);
      return !t || REQUIRED_KEYS.every((k) => t.keys.includes(k));
    });
    expect(stale).toEqual([]);
  });
});
