// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect } from "vitest";
import { HASH_ALGS as HASH_ALG_NAMES, hashAlgSchema } from "@cesteral/contract-schema";
import { HASH_ALGS as HASH_ALG_IMPLEMENTATIONS, canonicalStringify } from "@cesteral/contract-hash";

/**
 * `@cesteral/contract-schema` owns the NAMES a `hashAlg` may take on the wire (a
 * manifest entry's field); `@cesteral/contract-hash` owns the ALGORITHMS those names
 * select. Neither depends on the other, so only a workspace that sees both can
 * notice a name added to one and not the other. `shared` depends on both.
 *
 * The failure this prevents is quiet: a manifest could carry a name the schema
 * accepts but no implementation can compute (every token against it fails closed as
 * UNSUPPORTED_HASH_ALG), or an implementation could exist that no manifest may name.
 */
describe("hashAlg names stay in step across the contract libraries", () => {
  it("contract-schema and contract-hash list the same algorithms in the same order", () => {
    expect([...HASH_ALG_NAMES]).toEqual([...HASH_ALG_IMPLEMENTATIONS]);
  });

  it("every name the schema accepts is one contract-hash can canonicalize under", () => {
    for (const name of HASH_ALG_NAMES) {
      expect(hashAlgSchema.safeParse(name).success).toBe(true);
      expect(() => canonicalStringify({ a: 1 }, name)).not.toThrow();
    }
  });

  it("the schema rejects a name contract-hash does not implement", () => {
    expect(hashAlgSchema.safeParse("not-an-algorithm").success).toBe(false);
  });
});
