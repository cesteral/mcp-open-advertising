// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Ratchet (#235 review #11/#12, #248): every tool's four MCP annotations follow
// the one rule set in tool-hint-rules.mjs, so the same operation carries the same
// hints on every server. Before this, `update_entity` was destructive on six
// servers and not on five, `msads_create_entity` was all-false, and
// `openWorldHint` was set per server by hand.
//
// A new write tool must be classified in WRITE_SUFFIX_CLASS (the test fails
// naming it); a new read tool needs nothing but `readOnlyHint: true`.
//
// Reads the fleet snapshot (fleet-snapshot-inject.mjs); boots nothing.

import { describe, expect, it } from "vitest";
import { serverSnapshot, toolsOf } from "./fleet-snapshot-inject.mjs";
import { registryPrefixes } from "../../evals/lib/merged-catalog.mjs";
import { fleetPackages } from "./fleet-snapshot.mjs";
import {
  expectedHints,
  LOCAL_SUFFIXES,
  LOCAL_TOOLS,
  WRITE_SUFFIX_CLASS,
} from "./tool-hint-rules.mjs";

const HINTS = ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"];
const packages = fleetPackages();
const prefixes = registryPrefixes();
const all = packages.flatMap((pkg) => {
  const prefix = `${prefixes.get(pkg)}_`;
  return toolsOf(pkg).map((tool) => ({ pkg, prefix, tool }));
});

describe("tool annotations follow one rule set (#235, #248)", () => {
  it("covers the fleet", () => {
    expect(packages.length).toBeGreaterThanOrEqual(13);
    expect(all.length).toBeGreaterThan(300);
    for (const pkg of packages) serverSnapshot(pkg); // throws if a server has no snapshot
  });

  it("every tool declares all four hints as booleans", () => {
    const bad = all
      .filter(({ tool }) => HINTS.some((h) => typeof tool.annotations?.[h] !== "boolean"))
      .map(({ tool }) => tool.name);
    expect(bad).toEqual([]);
  });

  it("every write tool is classified, and every tool carries the hints its class requires", () => {
    const problems = [];
    for (const { tool, prefix } of all) {
      const rule = expectedHints(tool, prefix);
      if (!rule.ok) {
        problems.push(rule.reason);
        continue;
      }
      for (const hint of HINTS) {
        const actual = tool.annotations?.[hint];
        if (actual !== rule.expected[hint]) {
          problems.push(
            `${tool.name} (${rule.kind}): ${hint} is ${actual}, must be ${rule.expected[hint]}`
          );
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("no rule is stale: every classified suffix and local tool still exists", () => {
    const names = new Set(all.map(({ tool }) => tool.name));
    const suffixes = new Set(all.map(({ tool, prefix }) => tool.name.slice(prefix.length)));
    const stale = [
      ...Object.keys(WRITE_SUFFIX_CLASS).filter((s) => !suffixes.has(s)),
      ...[...LOCAL_SUFFIXES].filter((s) => !suffixes.has(s)),
      ...[...LOCAL_TOOLS].filter((n) => !names.has(n)),
    ];
    expect(stale).toEqual([]);
  });

  it("a governed write is never read-only (the read partner is the read-only half)", () => {
    const bad = all
      .filter(
        ({ tool }) => tool.annotations?.cesteral?.kind === "write" && tool.annotations.readOnlyHint
      )
      .map(({ tool }) => tool.name);
    expect(bad).toEqual([]);
  });
});
