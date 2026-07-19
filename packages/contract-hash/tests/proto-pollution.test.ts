// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect } from "vitest";
import { computeDefinitionHash, CROSS_REPO_PROTO_POLLUTION_VECTORS } from "../src/index.js";
import type { HashableToolDefinition } from "../src/index.js";

/**
 * Regression for the 2026-07-19 follow-up review C1 (critical): an own `__proto__`
 * property under a hashed object was dropped by the key-sorting canonicalizer, so
 * a definition carrying one hashed identically to the property-free definition —
 * a deterministic collision that carried a mutated tool to a blessed hash and
 * `attested` trust. `JSON.parse` is used to obtain a real OWN `__proto__` data
 * property (an object literal `{ __proto__: … }` would set the prototype), exactly
 * as attacker-supplied `tools/list` JSON would.
 */
describe("prototype-pollution canonicalization parity (C1)", () => {
  it.each(CROSS_REPO_PROTO_POLLUTION_VECTORS.map((v) => [v.label, v] as const))(
    "pins the polluted hash and keeps it distinct from the clean twin: %s",
    (_label, v) => {
      const polluted = JSON.parse(v.pollutedJson) as HashableToolDefinition;
      const clean = JSON.parse(v.cleanJson) as HashableToolDefinition;
      const pollutedHash = computeDefinitionHash(polluted);
      const cleanHash = computeDefinitionHash(clean);
      // (a) stable pinned value
      expect(pollutedHash).toBe(v.expectedPollutedHash);
      // (b) MUST differ from the prototype-key-free twin — the property is part of
      //     the canonical bytes, so a mutation cannot retain the blessed hash.
      expect(pollutedHash).not.toBe(cleanHash);
    }
  );

  it("confirms JSON.parse actually produces an OWN __proto__ property (test integrity)", () => {
    const parsed = JSON.parse('{"__proto__":{"x":1}}') as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(parsed, "__proto__")).toBe(true);
  });

  it("has no placeholder hashes left (all vectors pinned)", () => {
    for (const v of CROSS_REPO_PROTO_POLLUTION_VECTORS) {
      expect(v.expectedPollutedHash, `unpinned: ${v.label}`).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
