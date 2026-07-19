// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { HashableToolDefinition } from "./index.js";

/**
 * SINGLE-SOURCED cross-repo `definitionHash` vector.
 *
 * This is the one canonical {fixture → expectedDefinitionHash} pair that pins
 * `computeDefinitionHash` parity across the seam between this repo
 * (mcp-open-advertising, which generates manifests) and the governance consumer
 * (cesteral-governance-layer, which verifies them and promotes matching tools to
 * `attested`). Governance promotes a cached tool only when its `definitionHash`
 * matches a hash blessed by a verified upstream manifest, so a silent change to
 * the algorithm on either side would stop every tool reaching `attested`.
 *
 * It used to be a JSON file hand-copied byte-identically into both repos, guarded
 * by a nightly job that fetched the producer copy and compared (issues #94/#360).
 * That two-copy design could drift. Now the vector ships INSIDE this published
 * package: the producer self-tests it here, and the consumer imports THIS constant
 * from `@cesteral/contract-hash` and asserts its installed version reproduces the
 * pinned hash. One source, type-checked, no copy to drift.
 *
 * If the canonicalization legitimately changes, update `fixture` here and
 * recompute `expectedDefinitionHash` in the SAME change — that is now a single,
 * atomic edit instead of a coordinated cross-repo one.
 */
export const CROSS_REPO_DEFINITION_HASH_GOLDEN: {
  expectedDefinitionHash: string;
  fixture: HashableToolDefinition;
} = {
  expectedDefinitionHash: "57de32fb103040f0cb66205c6db3079cc93e939e0ce9824ae7b34990a4edba2a",
  fixture: {
    name: "crossrepo_update_entity",
    description: "Cross-repo golden fixture. Edited in lockstep across both repos.",
    inputSchema: {
      type: "object",
      properties: {
        entityId: { type: "string" },
        budget: { type: "number" },
        status: { type: "string", enum: ["ACTIVE", "PAUSED", "ARCHIVED"] },
      },
      required: ["entityId"],
    },
    outputSchema: {
      type: "object",
      properties: { success: { type: "boolean" }, id: { type: "string" } },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      cesteral: {
        platform: "cross_repo",
        schemaVersion: 1,
        supportsDryRun: true,
        executableArgsExclude: ["dry_run"],
        contractId: "crossrepo.update.v1",
      },
    },
  },
};

/**
 * Edge-case parity vectors that pin the individual SERIALIZATION DECISIONS the
 * canonical `computeDefinitionHash` makes, so a divergence in any one of them
 * across the two repos is caught by a failing golden — not just the single
 * "realistic tool" shape above.
 *
 * The original single vector exercises a typical tool but leaves several
 * canonicalization choices un-pinned (raised in the 2026-07-19 attestation
 * review): deep key ordering, ARRAY-order preservation, number/boolean/null
 * encoding, empty-container handling, unicode NON-normalization, and
 * omitted-vs-explicit-`null`. Each vector below isolates one, with a `label`
 * naming the invariant it guards. `CROSS_REPO_GOLDEN_DISTINCTNESS_PAIRS`
 * additionally pins pairs that MUST hash differently (NFC vs NFD, null vs
 * omitted) — a canonicalizer that normalized unicode or dropped nulls would
 * collapse them.
 *
 * These ship in the published surface exactly like the single vector, so the
 * governance consumer can assert them against its installed `@cesteral/contract-hash`.
 */
export interface CrossRepoGoldenVector {
  /** Human label naming the serialization invariant this vector pins. */
  label: string;
  expectedDefinitionHash: string;
  fixture: HashableToolDefinition;
}

export const CROSS_REPO_DEFINITION_HASH_GOLDEN_VECTORS: readonly CrossRepoGoldenVector[] = [
  {
    label: "deep key ordering + array element order preserved",
    expectedDefinitionHash: "cdeac55f10ac5e21827ae0cb6ce838f4b16e81258c2fdacb3a0e818a2f6a2f39",
    fixture: {
      name: "vec_key_ordering",
      // Keys deliberately NOT in sorted order, at multiple depths. Arrays must
      // keep their given order (canonicalization sorts object keys, never array
      // elements).
      inputSchema: {
        zeta: 1,
        alpha: 2,
        nested: { yankee: true, bravo: false, mike: { delta: 4, charlie: 3 } },
        tags: ["z", "a", "m"],
      },
      annotations: { cesteral: { schemaVersion: 1, platform: "vec", contractId: "vec.a.v1" } },
    },
  },
  {
    label: "number encoding (int, negative, zero, fraction, exponent, >2^53)",
    expectedDefinitionHash: "cc1b6c9444553fb3cd1d06d8492ab8873428753a33a5eb5622d85a3e13e07972",
    fixture: {
      name: "vec_numbers",
      inputSchema: {
        zero: 0,
        neg: -42,
        frac: 1.5,
        small: 0.000001,
        expo: 1e21,
        big: 9007199254740993,
      },
    },
  },
  {
    label: "boolean + explicit null preserved",
    expectedDefinitionHash: "a1bb62ca8428ce17947bfbb516aa62fcbe4480bc6c1f5ba513112b0f296dab0e",
    fixture: {
      name: "vec_bool_null",
      inputSchema: { t: true, f: false, n: null, present: "x" },
    },
  },
  {
    label: "explicit null present (pairs with omitted — must differ)",
    expectedDefinitionHash: "d58137c899d011347bc0aa85a2be5b0fbb243c0efcdde25b01f42c870d874227",
    fixture: {
      name: "vec_null_vs_omitted",
      inputSchema: { a: 1, b: null },
    },
  },
  {
    label: "property omitted (pairs with explicit-null — must differ)",
    expectedDefinitionHash: "ae46e31bf86f3675dd50ec8a2f444fa73b368db690e71f7156cb1e4419bea39d",
    fixture: {
      name: "vec_null_vs_omitted",
      inputSchema: { a: 1 },
    },
  },
  {
    label: "empty object + empty array preserved",
    expectedDefinitionHash: "74514e995a1eff54f1bd1c4fb13e4d8be1b6f4792d253f6eeb8e3c9066b6c6a7",
    fixture: {
      name: "vec_empty",
      inputSchema: { obj: {}, arr: [] },
      annotations: {},
    },
  },
  {
    label: "unicode NFC (U+00E9) — pairs with NFD, must differ (no normalization)",
    expectedDefinitionHash: "e256c2438e8390e75d0ed3fa6a6d6f2d237cab73403ae7e0030b1266fb085056",
    fixture: {
      name: "vec_unicode",
      // Precomposed "café" — explicit escape so the byte content is
      // unambiguous in source and cannot be silently re-normalized by an editor.
      description: "caf\u00E9",
    },
  },
  {
    label: "unicode NFD (e + U+0301) — pairs with NFC, must differ (no normalization)",
    expectedDefinitionHash: "711053ce16c5e04c9d4c2a975732d7e2a92f34174f9b63dd6eb097fd1a36005b",
    fixture: {
      name: "vec_unicode",
      // Decomposed "café" (combining acute accent). Visually identical to
      // the NFC form above but a different byte sequence — must hash differently.
      description: "cafe\u0301",
    },
  },
];

/**
 * Label pairs whose fixtures MUST hash to DIFFERENT values. If a canonicalizer
 * regression ever made either pair collide (unicode normalization, or treating
 * an explicit `null` the same as an omitted property), attestation parity would
 * be silently weakened — assert the inequality explicitly.
 */
export const CROSS_REPO_GOLDEN_DISTINCTNESS_PAIRS: ReadonlyArray<readonly [string, string]> = [
  [
    "unicode NFC (U+00E9) — pairs with NFD, must differ (no normalization)",
    "unicode NFD (e + U+0301) — pairs with NFC, must differ (no normalization)",
  ],
  [
    "explicit null present (pairs with omitted — must differ)",
    "property omitted (pairs with explicit-null — must differ)",
  ],
];
