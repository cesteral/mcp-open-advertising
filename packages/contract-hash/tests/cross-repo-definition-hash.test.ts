// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect } from "vitest";
import {
  computeDefinitionHash,
  CROSS_REPO_DEFINITION_HASH_GOLDEN,
  CROSS_REPO_DEFINITION_HASH_GOLDEN_VECTORS,
  CROSS_REPO_GOLDEN_DISTINCTNESS_PAIRS,
} from "../src/index.js";

// The cross-repo parity vector is now single-sourced from this package
// (src/cross-repo-golden.ts) and shipped in the published surface, so the
// governance consumer imports the IDENTICAL constant from
// `@cesteral/contract-hash` instead of maintaining a hand-copied JSON. This is
// the producer-side half: it asserts this package's own computeDefinitionHash
// reproduces the pinned hash for the shared fixture.
describe("cross-repo definitionHash parity", () => {
  it("hashes the shared fixture to the pinned cross-repo constant", () => {
    expect(computeDefinitionHash(CROSS_REPO_DEFINITION_HASH_GOLDEN.fixture)).toBe(
      CROSS_REPO_DEFINITION_HASH_GOLDEN.expectedDefinitionHash
    );
  });
});

// Edge-case vectors: each pins ONE serialization decision (key ordering, array
// order, number/boolean/null encoding, empty containers, unicode
// non-normalization, null-vs-omitted) so a canonicalization regression on either
// repo is caught precisely rather than only via the one realistic-tool fixture.
describe("cross-repo definitionHash edge-case vectors", () => {
  it.each(CROSS_REPO_DEFINITION_HASH_GOLDEN_VECTORS.map((v) => [v.label, v] as const))(
    "pins %s",
    (_label, v) => {
      expect(computeDefinitionHash(v.fixture)).toBe(v.expectedDefinitionHash);
    }
  );

  it("hashes every declared distinctness pair to DIFFERENT values", () => {
    const byLabel = new Map(
      CROSS_REPO_DEFINITION_HASH_GOLDEN_VECTORS.map((v) => [
        v.label,
        computeDefinitionHash(v.fixture),
      ])
    );
    for (const [a, b] of CROSS_REPO_GOLDEN_DISTINCTNESS_PAIRS) {
      const ha = byLabel.get(a);
      const hb = byLabel.get(b);
      expect(ha, `missing vector for label: ${a}`).toBeDefined();
      expect(hb, `missing vector for label: ${b}`).toBeDefined();
      expect(ha).not.toBe(hb);
    }
  });

  it("has no placeholder hashes left (all vectors pinned)", () => {
    for (const v of CROSS_REPO_DEFINITION_HASH_GOLDEN_VECTORS) {
      expect(v.expectedDefinitionHash, `unpinned vector: ${v.label}`).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
