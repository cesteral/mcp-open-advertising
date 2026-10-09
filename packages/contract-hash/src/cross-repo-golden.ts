// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { HashAlg, HashableToolDefinition } from "./index.js";

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

/**
 * Prototype-pollution parity vectors (2026-07-19 follow-up review, C1).
 *
 * An own `__proto__` property cannot be written as an object literal (`{ __proto__:
 * … }` sets the prototype), so these vectors ship the definition as a JSON SOURCE
 * string that both repos `JSON.parse` — which yields a real OWN `__proto__` data
 * property, exactly what an attacker's `tools/list` JSON produces over the wire.
 *
 * Each vector pins that the polluted definition (a) hashes to a STABLE value and
 * (b) hashes DIFFERENTLY from its prototype-key-free twin. Before the canonicalizer
 * fix, the `__proto__` cases collided with their twins (the key was dropped during
 * key-sorting), letting a mutated definition retain a blessed hash and reach
 * `attested`. `constructor` / `prototype` were always retained; they are covered
 * defensively so any future canonicalizer change that special-cased them is caught.
 */
export interface CrossRepoProtoPollutionVector {
  label: string;
  /** Full HashableToolDefinition as JSON; `JSON.parse` yields OWN prototype-sensitive keys. */
  pollutedJson: string;
  /** The same definition WITHOUT the prototype-sensitive key. */
  cleanJson: string;
  /** Canonical hash of `JSON.parse(pollutedJson)`. MUST differ from the clean twin's hash. */
  expectedPollutedHash: string;
}

export const CROSS_REPO_PROTO_POLLUTION_VECTORS: readonly CrossRepoProtoPollutionVector[] = [
  {
    label: "own __proto__ nested in inputSchema.properties",
    cleanJson:
      '{"name":"vec_pp","inputSchema":{"type":"object","properties":{"a":{"type":"string"}}}}',
    pollutedJson:
      '{"name":"vec_pp","inputSchema":{"type":"object","properties":{"a":{"type":"string"},"__proto__":{"type":"number"}}}}',
    expectedPollutedHash: "170b510bc0cb8394633f1347fd4643cfb901737c96e15be7bb055e7e95e01dad",
  },
  {
    label: "own __proto__ in annotations.cesteral.capabilityDispatch.entityKindValueMap",
    cleanJson:
      '{"name":"vec_pp","annotations":{"cesteral":{"schemaVersion":1,"platform":"x","contractId":"x.y.v1","capabilityDispatch":{"entityKindValueMap":{"campaign":"CAMPAIGN"}}}}}',
    pollutedJson:
      '{"name":"vec_pp","annotations":{"cesteral":{"schemaVersion":1,"platform":"x","contractId":"x.y.v1","capabilityDispatch":{"entityKindValueMap":{"campaign":"CAMPAIGN","__proto__":"campaign"}}}}}',
    expectedPollutedHash: "b906a2b6ae2677cde13d9c65640f70886b5c0986dc88f593463b5a59f3b4065f",
  },
  {
    label: "own __proto__ at inputSchema top level",
    cleanJson: '{"name":"vec_pp","inputSchema":{"type":"object"}}',
    pollutedJson: '{"name":"vec_pp","inputSchema":{"type":"object","__proto__":{"evil":true}}}',
    expectedPollutedHash: "1b377d1126d5a56c70fad4d90b773645a2eddaee27c8f726c46977d0deed07f9",
  },
  {
    label: "own constructor key retained (defensive; always distinct)",
    cleanJson: '{"name":"vec_pp","inputSchema":{"type":"object"}}',
    pollutedJson: '{"name":"vec_pp","inputSchema":{"type":"object","constructor":{"x":1}}}',
    expectedPollutedHash: "538fd756d27d2432eedf89c5ab08a3cf6fd6d3af607115a3bf9ce6e478d968d3",
  },
];

/**
 * Cross-repo vectors for the `hashAlg` selector (`cesteral-c14n-v1` vs `rfc8785`).
 *
 * Each vector gives an input and, for EVERY algorithm, the exact canonical bytes and
 * the sha256 of those bytes. The expected values are literals computed independently
 * of this package (sha256 over the hand-written canonical text), so a consumer — or
 * an implementation in another language — can assert its own serializer against them
 * without trusting this one.
 *
 * What they pin:
 *  - one vector where both algorithms AGREE (the common case: no order-sensitive
 *    object), identical to the shipped `golden-action-hashes.json` entry;
 *  - four where they DIFFER, all through the same mechanism — the JS engine hands
 *    integer-like keys back before the others, so `cesteral-c14n-v1` is not in
 *    UTF-16 code-unit order while `rfc8785` is. The bids vector is the realistic
 *    one: a map keyed by numeric entity ids.
 *
 * Changing an existing vector's value changes what a verifier accepts; add vectors,
 * never edit them.
 */
export interface CrossRepoHashAlgVector {
  label: string;
  /** A JSON value, as it would arrive in a governed write's executable args. */
  input: unknown;
  /** The exact canonical text under each algorithm. */
  canonical: Record<HashAlg, string>;
  /** Lowercase-hex sha256 of that canonical text (`hashActionInput`). */
  actionHash: Record<HashAlg, string>;
}

export const CROSS_REPO_HASH_ALG_VECTORS: readonly CrossRepoHashAlgVector[] = [
  {
    label: "no order-sensitive keys: both algorithms agree",
    input: { customerId: "1", entityId: "2", data: { status: "PAUSED" } },
    canonical: {
      "cesteral-c14n-v1": '{"customerId":"1","data":{"status":"PAUSED"},"entityId":"2"}',
      rfc8785: '{"customerId":"1","data":{"status":"PAUSED"},"entityId":"2"}',
    },
    actionHash: {
      "cesteral-c14n-v1": "bad12abd17b823c4cc4d7050aa9d096384cc63fb7921e4d18aeabdcddce6a35e",
      rfc8785: "bad12abd17b823c4cc4d7050aa9d096384cc63fb7921e4d18aeabdcddce6a35e",
    },
  },
  {
    label: "integer-like keys at the top level",
    input: { b: 1, "10": 2, "9": 3, a: 4, "-1": 5 },
    canonical: {
      "cesteral-c14n-v1": '{"9":3,"10":2,"-1":5,"a":4,"b":1}',
      rfc8785: '{"-1":5,"10":2,"9":3,"a":4,"b":1}',
    },
    actionHash: {
      "cesteral-c14n-v1": "91092eceaa9ce19eef7485fa6ab8bd03ed46500122780bfaef02b21273771bb5",
      rfc8785: "5dd3e2704022214cd98ca83434e83554e3b80c8966c212bb024631ff8b1818b9",
    },
  },
  {
    label: "numeric-id-keyed map in a write (bids by entity id)",
    input: { accountId: "a1", bids: { "12345": 1.5, "9876": 2 } },
    canonical: {
      "cesteral-c14n-v1": '{"accountId":"a1","bids":{"9876":2,"12345":1.5}}',
      rfc8785: '{"accountId":"a1","bids":{"12345":1.5,"9876":2}}',
    },
    actionHash: {
      "cesteral-c14n-v1": "da31a5c004c5f7ac1a0be071cb92ea87b02b3c622b6cb6c3a6b5e921d377c1f2",
      rfc8785: "dbb313f074baad4179bec77f2088436ff546585fc3d478ec001ece54b3a217ba",
    },
  },
  {
    label: "negative-looking key sorts before an integer key only under rfc8785",
    input: { "1": "x", "-1": "y" },
    canonical: {
      "cesteral-c14n-v1": '{"1":"x","-1":"y"}',
      rfc8785: '{"-1":"y","1":"x"}',
    },
    actionHash: {
      "cesteral-c14n-v1": "8ff2bbb29a68043e8c49379453a7f2c51e37f8ec2cdc76f47eda6bf6c31d3f76",
      rfc8785: "a25abde03740aedac8a5220d0bdeb63e40436267ff22516222cfe4095a6e849a",
    },
  },
  {
    label: "ordering applies at every depth, through arrays",
    input: { z: { "10": 1, "9": 2 }, a: [{ "2": 0, "10": 0 }] },
    canonical: {
      "cesteral-c14n-v1": '{"a":[{"2":0,"10":0}],"z":{"9":2,"10":1}}',
      rfc8785: '{"a":[{"10":0,"2":0}],"z":{"10":1,"9":2}}',
    },
    actionHash: {
      "cesteral-c14n-v1": "ef4544e3cc37a092845711ce05d9018e3cf3aa8ee06292c3678cdefc4beb7d12",
      rfc8785: "3eb80be2f097660ffe6ac6ab2ea80b3a0f3b8ec5f27c590fb34764e01f59b3b3",
    },
  },
];
