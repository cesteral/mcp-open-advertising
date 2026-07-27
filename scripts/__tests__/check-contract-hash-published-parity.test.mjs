import { describe, it, expect } from "vitest";

import {
  compareCanonicalizers,
  compareProtoPollutionVectors,
} from "../check-contract-hash-published-parity.mjs";

/**
 * Unit tests for the pure comparison core of the release parity guard
 * (attestation review 2026-07-23, F7). The npm/network path is exercised only
 * in the real release workflow; here we pin the decision logic with stub
 * module objects.
 */

const FIXTURE = { name: "t", description: "d" };
const HASH = "a".repeat(64);
const OTHER_HASH = "b".repeat(64);
const POLLUTED_HASH = "c".repeat(64);

const CLEAN_JSON = '{"name":"t","inputSchema":{"type":"object"}}';
const POLLUTED_JSON = '{"name":"t","inputSchema":{"type":"object","__proto__":{"evil":true}}}';

/**
 * A canonicalizer that HONOURS own `__proto__` keys: polluted inputs hash
 * distinctly from their clean twin. This models the post-C1-fix build.
 */
function protoAwareHash(value) {
  return JSON.stringify(value).includes("__proto__") ? POLLUTED_HASH : HASH;
}

/**
 * A canonicalizer that DROPS own `__proto__` keys, so a polluted input collides
 * with its clean twin. This models the published pre-fix 1.2.0 build — and it
 * agrees with the post-fix build on every `__proto__`-free golden vector, which
 * is exactly why the golden comparison alone cannot see the difference.
 */
function protoBlindHash() {
  return HASH;
}

function protoVectors() {
  return [
    {
      label: "pp",
      cleanJson: CLEAN_JSON,
      pollutedJson: POLLUTED_JSON,
      expectedPollutedHash: POLLUTED_HASH,
    },
  ];
}

function mod(overrides = {}) {
  return {
    computeDefinitionHash: protoAwareHash,
    CROSS_REPO_DEFINITION_HASH_GOLDEN: { expectedDefinitionHash: HASH, fixture: FIXTURE },
    CROSS_REPO_DEFINITION_HASH_GOLDEN_VECTORS: [
      { label: "vec", expectedDefinitionHash: HASH, fixture: FIXTURE },
    ],
    CROSS_REPO_PROTO_POLLUTION_VECTORS: protoVectors(),
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

  /**
   * The regression this whole prototype-key comparison exists for. Before it,
   * running the guard for real against the published pre-fix `1.2.0` tarball
   * printed "workspace canonicalizer matches the published tarball" — the C1
   * fix left `__proto__`-free serialization byte-identical, so every golden
   * vector agreed. A tag release would have shipped the changed
   * canonicalization under an unchanged version, which is precisely the
   * failure the guard was written to stop.
   */
  it("catches a published build that drops __proto__ keys, though every golden vector agrees", () => {
    const published = mod({
      computeDefinitionHash: protoBlindHash,
      CROSS_REPO_PROTO_POLLUTION_VECTORS: undefined,
    });

    // Precondition: the two builds are indistinguishable on the golden surface.
    for (const vector of mod().CROSS_REPO_DEFINITION_HASH_GOLDEN_VECTORS) {
      expect(published.computeDefinitionHash(vector.fixture)).toBe(
        mod().computeDefinitionHash(vector.fixture)
      );
    }

    const mismatches = compareCanonicalizers(mod(), published);
    expect(mismatches.length).toBeGreaterThan(0);
    expect(mismatches.join("\n")).toContain("predates the __proto__ canonicalization fix");
  });
});

describe("compareProtoPollutionVectors", () => {
  it("passes when both builds honour own __proto__ keys", () => {
    expect(compareProtoPollutionVectors(mod(), mod())).toEqual([]);
  });

  it("fails when the published build hashes a polluted fixture differently", () => {
    const published = mod({ computeDefinitionHash: protoBlindHash });
    const mismatches = compareProtoPollutionVectors(mod(), published);
    expect(mismatches.join("\n")).toContain("published polluted hash");
  });

  it("fails when the workspace itself collides the polluted and clean twins", () => {
    const workspace = mod({ computeDefinitionHash: protoBlindHash });
    const mismatches = compareProtoPollutionVectors(workspace, workspace);
    expect(mismatches.join("\n")).toContain("prototype key is being dropped again");
  });

  it("fails closed when the workspace exports no prototype-key vectors", () => {
    const workspace = mod({ CROSS_REPO_PROTO_POLLUTION_VECTORS: [] });
    const mismatches = compareProtoPollutionVectors(workspace, mod());
    expect(mismatches.join("\n")).toContain("cannot establish parity over prototype keys");
  });

  it("reports a throwing canonicalizer as a mismatch instead of crashing", () => {
    const published = mod({
      computeDefinitionHash: () => {
        throw new Error("boom");
      },
    });
    const mismatches = compareProtoPollutionVectors(mod(), published);
    expect(mismatches.join("\n")).toContain("threw");
  });
});
