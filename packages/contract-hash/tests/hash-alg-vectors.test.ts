// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  CROSS_REPO_HASH_ALG_VECTORS,
  HASH_ALGS,
  canonicalStringify,
  hashActionInput,
  hasOrderSensitiveKeys,
} from "../src/index.js";

/**
 * Published vectors for the `hashAlg` selector. The consumer (cesteral-intelligence,
 * and any other implementation) asserts these against its installed package or its
 * own port, so the expected values are literals: canonical bytes written out by hand
 * and their sha256, never derived from the code under test.
 */
describe("CROSS_REPO_HASH_ALG_VECTORS", () => {
  it("states canonical bytes and an action hash for every algorithm", () => {
    expect(CROSS_REPO_HASH_ALG_VECTORS.length).toBeGreaterThanOrEqual(5);
    for (const v of CROSS_REPO_HASH_ALG_VECTORS) {
      for (const alg of HASH_ALGS) {
        expect(typeof v.canonical[alg], `${v.label} canonical ${alg}`).toBe("string");
        expect(v.actionHash[alg], `${v.label} actionHash ${alg}`).toMatch(/^[0-9a-f]{64}$/);
      }
    }
  });

  it.each(CROSS_REPO_HASH_ALG_VECTORS.map((v) => [v.label, v] as const))(
    "reproduces canonical bytes and hash under each algorithm: %s",
    (_label, v) => {
      for (const alg of HASH_ALGS) {
        expect(canonicalStringify(v.input, alg)).toBe(v.canonical[alg]);
        expect(hashActionInput(v.input, alg)).toBe(v.actionHash[alg]);
        // The stated hash is the sha256 of the stated bytes: a vector cannot
        // quietly disagree with itself.
        expect(createHash("sha256").update(v.canonical[alg], "utf8").digest("hex")).toBe(
          v.actionHash[alg]
        );
      }
    }
  );

  it("includes vectors where the algorithms agree and vectors where they differ", () => {
    const agree = CROSS_REPO_HASH_ALG_VECTORS.filter(
      (v) => v.actionHash["cesteral-c14n-v1"] === v.actionHash.rfc8785
    );
    const differ = CROSS_REPO_HASH_ALG_VECTORS.filter(
      (v) => v.actionHash["cesteral-c14n-v1"] !== v.actionHash.rfc8785
    );
    expect(agree.length).toBeGreaterThanOrEqual(1);
    expect(differ.length).toBeGreaterThanOrEqual(3);
  });

  it("differs exactly on the order-sensitive inputs", () => {
    for (const v of CROSS_REPO_HASH_ALG_VECTORS) {
      const differs = v.canonical["cesteral-c14n-v1"] !== v.canonical.rfc8785;
      expect(hasOrderSensitiveKeys(v.input), v.label).toBe(differs);
    }
  });
});
