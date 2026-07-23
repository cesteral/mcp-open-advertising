import { describe, it, expect } from "vitest";

import { compareCanonicalizers } from "../check-contract-hash-published-parity.mjs";

/**
 * Unit tests for the pure comparison core of the release parity guard
 * (attestation review 2026-07-23, F7). The npm/network path is exercised only
 * in the real release workflow; here we pin the decision logic with stub
 * module objects.
 */

const FIXTURE = { name: "t", description: "d" };
const HASH = "a".repeat(64);
const OTHER_HASH = "b".repeat(64);

function mod(overrides = {}) {
  return {
    computeDefinitionHash: () => HASH,
    CROSS_REPO_DEFINITION_HASH_GOLDEN: { expectedDefinitionHash: HASH, fixture: FIXTURE },
    CROSS_REPO_DEFINITION_HASH_GOLDEN_VECTORS: [
      { label: "vec", expectedDefinitionHash: HASH, fixture: FIXTURE },
    ],
    ...overrides,
  };
}

describe("compareCanonicalizers", () => {
  it("passes when both builds reproduce every golden vector", () => {
    expect(compareCanonicalizers(mod(), mod())).toEqual([]);
  });

  it("fails when the published build hashes a vector differently (in-place canonicalization change)", () => {
    const published = mod({ computeDefinitionHash: () => OTHER_HASH });
    const mismatches = compareCanonicalizers(mod(), published);
    expect(mismatches.length).toBeGreaterThan(0);
    expect(mismatches.join("\n")).toContain("published hash");
  });

  it("fails when the WORKSPACE no longer reproduces its own pinned golden", () => {
    const workspace = mod({ computeDefinitionHash: () => OTHER_HASH });
    const published = mod({ computeDefinitionHash: () => OTHER_HASH });
    // Both agree with each other but not with the pinned golden — still drift.
    const mismatches = compareCanonicalizers(workspace, published);
    expect(mismatches.join("\n")).toContain("pinned golden");
  });

  it("fails when the published package pins a different golden constant (lockstep edit without bump)", () => {
    const published = mod({
      CROSS_REPO_DEFINITION_HASH_GOLDEN: { expectedDefinitionHash: OTHER_HASH, fixture: FIXTURE },
    });
    const mismatches = compareCanonicalizers(mod(), published);
    expect(mismatches.join("\n")).toContain("CROSS_REPO_DEFINITION_HASH_GOLDEN");
  });

  it("reports a throwing canonicalizer as a mismatch instead of crashing", () => {
    const published = mod({
      computeDefinitionHash: () => {
        throw new Error("boom");
      },
    });
    const mismatches = compareCanonicalizers(mod(), published);
    expect(mismatches.join("\n")).toContain("threw");
  });
});
