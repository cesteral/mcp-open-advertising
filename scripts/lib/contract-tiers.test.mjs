// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Cross-server contract tiers (see contract-tiers.mjs). Static: reads
// registry.json, boots nothing.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./boot-server.mjs";
import { SERVER_TYPES, checkContractTiers, meets } from "./contract-tiers.mjs";

const registry = JSON.parse(readFileSync(join(ROOT, "registry.json"), "utf8"));

const server = (over) => ({
  package: "zz-mcp",
  tool_prefix: "zz",
  type: "reporting",
  tools: ["zz_get_report", "zz_get_pacing_status", "zz_search_tools"],
  ...over,
});

describe("cross-server contract tiers", () => {
  it("every registry server meets its tier, with only reasoned, still-needed exceptions", () => {
    // A failure names the server and the tool to add, or the exception to
    // record or remove. Change registry.json or the server; not this test.
    expect(checkContractTiers(registry)).toEqual([]);
  });

  it("a missing MUST fails and cannot be excepted", () => {
    const s = server({
      tools: ["zz_get_report"],
      contract: { exceptions: [{ requirement: "pacing", reason: "x".repeat(30) }] },
    });
    const v = checkContractTiers({ servers: [s] });
    expect(v.some((l) => l.includes("MUST ship zz_get_pacing_status"))).toBe(true);
    expect(v.some((l) => l.includes('"pacing" is not a SHOULD'))).toBe(true);
  });

  it("a missing SHOULD fails unless excepted with a reason", () => {
    const missing = server({ tools: ["zz_get_report", "zz_get_pacing_status"] });
    expect(checkContractTiers({ servers: [missing] })).toEqual([
      "zz-mcp: SHOULD ship zz_search_tools; add it, or record why not in registry contract.exceptions",
    ]);
    const excepted = {
      ...missing,
      contract: { exceptions: [{ requirement: "search_tools", reason: "a reason long enough" }] },
    };
    expect(checkContractTiers({ servers: [excepted] })).toEqual([]);
    const terse = {
      ...missing,
      contract: { exceptions: [{ requirement: "search_tools", reason: "no" }] },
    };
    expect(checkContractTiers({ servers: [terse] })[0]).toMatch(/needs a reason/);
  });

  it("an exception for a requirement now met fails, so the list only shrinks", () => {
    const s = server({
      contract: { exceptions: [{ requirement: "search_tools", reason: "a reason long enough" }] },
    });
    expect(checkContractTiers({ servers: [s] })).toEqual([
      'zz-mcp: contract exception "search_tools" is no longer needed; remove it from registry.json',
    ]);
  });

  it("an unknown type fails", () => {
    expect(checkContractTiers({ servers: [server({ type: "other" })] })[0]).toMatch(
      /registry `type` must be one of/
    );
  });

  it("matches on the suffix after the server's own prefix, including accepted variants", () => {
    const gads = { tool_prefix: "gads", tools: ["gads_remove_entity", "gads_adjust_bids"] };
    expect(meets(gads, "delete_entity")).toBe(true);
    expect(meets(gads, "bid_adjustment")).toBe(true);
    const dv360 = { tool_prefix: "dv360", tools: ["dv360_adjust_line_item_bids"] };
    expect(meets(dv360, "bid_adjustment")).toBe(true);
    // A tool carrying another server's prefix does not count.
    expect(meets({ tool_prefix: "zz", tools: ["meta_get_report"] }, "reporting")).toBe(false);
  });

  it("every type's MUST and SHOULD lists are disjoint", () => {
    for (const [type, t] of Object.entries(SERVER_TYPES)) {
      expect(
        t.must.filter((r) => t.should.includes(r)),
        type
      ).toEqual([]);
    }
  });
});
