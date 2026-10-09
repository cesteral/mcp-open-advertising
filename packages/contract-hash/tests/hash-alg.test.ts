// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  HASH_ALGS,
  DEFAULT_HASH_ALG,
  isHashAlg,
  canonicalStringify,
  stableStringify,
  hashActionInput,
  computeDefinitionHash,
  hasOrderSensitiveKeys,
  CROSS_REPO_DEFINITION_HASH_GOLDEN_VECTORS,
} from "../src/index.js";

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/**
 * The review of 2026-10-09 found that `stableStringify` sorts keys and then lets
 * `JSON.stringify` emit them, so the JS engine re-orders integer-like keys ahead of
 * the rest: `{"9":…,"10":…,"-1":…}` where RFC 8785 requires `{"-1":…,"10":…,"9":…}`.
 * `cesteral-c14n-v1` is that behaviour, frozen under a name; `rfc8785` is the
 * standard. A signed `hashAlg` claim selects exactly one.
 */

describe("hash algorithm registry", () => {
  it("names the legacy algorithm and RFC 8785, legacy first", () => {
    expect([...HASH_ALGS]).toEqual(["cesteral-c14n-v1", "rfc8785"]);
  });

  it("defaults to the legacy algorithm: an absent wire claim means legacy", () => {
    expect(DEFAULT_HASH_ALG).toBe("cesteral-c14n-v1");
  });

  it.each([
    ["cesteral-c14n-v1", true],
    ["rfc8785", true],
    ["RFC8785", false],
    ["legacy", false],
    ["", false],
    [undefined, false],
    [null, false],
    [1, false],
    [["rfc8785"], false],
  ])("isHashAlg(%j) is %s", (value, expected) => {
    expect(isHashAlg(value)).toBe(expected);
  });
});

describe("canonicalStringify cesteral-c14n-v1 (legacy, frozen)", () => {
  it("is byte-identical to stableStringify, including the integer-key order", () => {
    const input = { b: 1, "10": 2, "9": 3, a: 4, "-1": 5 };
    expect(canonicalStringify(input, "cesteral-c14n-v1")).toBe(stableStringify(input));
    // Pinned so nobody "fixes" the quirk under the legacy name: changing these
    // bytes would silently change every hash minted against a legacy manifest.
    expect(canonicalStringify(input, "cesteral-c14n-v1")).toBe('{"9":3,"10":2,"-1":5,"a":4,"b":1}');
  });
});

describe("canonicalStringify rfc8785", () => {
  // RFC 8785 Appendix B, rows checked against the RFC text: IEEE-754 bits -> JCS text.
  it.each([
    ["0000000000000000", "0"],
    ["8000000000000000", "0"],
    ["0000000000000001", "5e-324"],
    ["7fefffffffffffff", "1.7976931348623157e+308"],
    ["4340000000000000", "9007199254740992"],
    ["44b52d02c7e14af6", "1e+23"],
    ["444b1ae4d6e2ef50", "1e+21"],
    ["3eb0c6f7a0b5ed8d", "0.000001"],
    ["41b3de4355555555", "333333333.3333333"],
    ["43143ff3c1cb0959", "1424953923781206.2"],
  ])("serializes number %s as %s", (bits, text) => {
    const n = Buffer.from(bits, "hex").readDoubleBE(0);
    expect(canonicalStringify(n, "rfc8785")).toBe(text);
  });

  it("sorts properties by UTF-16 code units (RFC 8785 section 3.2.3)", () => {
    const input: Record<string, string> = {
      "€": "Euro Sign",
      "\r": "Carriage Return",
      דּ: "Hebrew Letter Dalet With Dagesh",
      "1": "One",
      "😀": "Emoji: Grinning Face",
      "\u0080": "Control",
      ö: "Latin Small Letter O With Diaeresis",
    };
    const out = canonicalStringify(input, "rfc8785");
    const expectedOrder = [
      "Carriage Return",
      "One",
      "Control",
      "Latin Small Letter O With Diaeresis",
      "Euro Sign",
      "Emoji: Grinning Face",
      "Hebrew Letter Dalet With Dagesh",
    ];
    const positions = expectedOrder.map((v) => out.indexOf(`"${v}"`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("orders integer-like keys by code unit, not numerically", () => {
    expect(canonicalStringify({ b: 1, "10": 2, "9": 3, a: 4, "-1": 5 }, "rfc8785")).toBe(
      '{"-1":5,"10":2,"9":3,"a":4,"b":1}'
    );
  });

  it("orders a negative-looking key before an integer key", () => {
    expect(canonicalStringify({ "1": "x", "-1": "y" }, "rfc8785")).toBe('{"-1":"y","1":"x"}');
    expect(canonicalStringify({ "1": "x", "-1": "y" }, "cesteral-c14n-v1")).toBe(
      '{"1":"x","-1":"y"}'
    );
  });

  it("applies the ordering at every depth, through arrays", () => {
    const input = { z: { "10": 1, "9": 2 }, a: [{ "2": 0, "10": 0 }] };
    expect(canonicalStringify(input, "rfc8785")).toBe('{"a":[{"10":0,"2":0}],"z":{"10":1,"9":2}}');
  });

  it("emits no whitespace and keeps array order", () => {
    expect(canonicalStringify({ a: [3, 1, 2], b: { c: "x" } }, "rfc8785")).toBe(
      '{"a":[3,1,2],"b":{"c":"x"}}'
    );
  });

  it("keeps an own __proto__ property in the canonical bytes", () => {
    const polluted = JSON.parse('{"__proto__":{"x":1},"a":2}');
    expect(canonicalStringify(polluted, "rfc8785")).toBe('{"__proto__":{"x":1},"a":2}');
  });
});

describe.each(["cesteral-c14n-v1", "rfc8785"] as const)("%s fails loud on non-JSON", (alg) => {
  it.each([
    ["BigInt", () => BigInt(1)],
    ["Date", () => new Date(0)],
    ["NaN", () => Number.NaN],
    ["Infinity", () => Number.POSITIVE_INFINITY],
    ["function", () => () => 1],
    ["symbol", () => Symbol("x")],
    [
      "class instance",
      () =>
        new (class Foo {
          x = 1;
        })(),
    ],
  ])("throws on %s", (_name, make) => {
    // Match the message, not just "throws": a missing function also throws (a
    // TypeError), which would let this pass before the feature exists.
    expect(() => canonicalStringify({ v: make() }, alg)).toThrow(/JSON/);
  });

  it("throws on a root undefined and an undefined array element", () => {
    expect(() => canonicalStringify(undefined, alg)).toThrow(/JSON/);
    expect(() => canonicalStringify([1, undefined], alg)).toThrow(/JSON/);
  });

  it("drops undefined object properties (JSON semantics)", () => {
    expect(canonicalStringify({ a: undefined, b: 1 }, alg)).toBe('{"b":1}');
  });
});

describe("rfc8785 rejects lone surrogates (invalid I-JSON)", () => {
  it("throws on a lone surrogate in a value", () => {
    expect(() => canonicalStringify({ a: "\ud800" }, "rfc8785")).toThrow(/surrogate/i);
  });
  it("throws on a lone surrogate in a key", () => {
    expect(() => canonicalStringify({ ["\udc00"]: 1 }, "rfc8785")).toThrow(/surrogate/i);
  });
  it("accepts a well-formed surrogate pair", () => {
    expect(canonicalStringify({ a: "😀" }, "rfc8785")).toBe('{"a":"\u{1F600}"}');
  });
});

describe("rfc8785 rejects a sparse array hole", () => {
  it("throws rather than emitting invalid JSON like [1,,3]", () => {
    // eslint-disable-next-line no-sparse-arrays
    expect(() => canonicalStringify([1, , 3], "rfc8785")).toThrow(/JSON/);
  });
});

describe("unknown algorithm fails closed in the library too", () => {
  it("canonicalStringify throws", () => {
    expect(() => canonicalStringify({}, "nope" as never)).toThrow(/unsupported hash algorithm/i);
  });
  it("hashActionInput throws", () => {
    expect(() => hashActionInput({}, "nope" as never)).toThrow(/unsupported hash algorithm/i);
  });
  it("computeDefinitionHash throws", () => {
    expect(() => computeDefinitionHash({ name: "t" }, "nope" as never)).toThrow(
      /unsupported hash algorithm/i
    );
  });
});

// ---------------------------------------------------------------------------
// The two algorithms differ EXACTLY where an object's engine enumeration order
// disagrees with its code-unit order, and `hasOrderSensitiveKeys` reports that.
// Seeded and generated, so it needs no dependency and fails reproducibly.
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KEY_POOL = [
  "a",
  "b",
  "z",
  "A",
  "_",
  "é",
  "x1",
  "10",
  "9",
  "1",
  "2",
  "-1",
  "007",
  "1e3",
  "4294967294",
  "4294967295",
];

function genValue(rand: () => number, depth: number): unknown {
  const r = rand();
  if (depth <= 0 || r < 0.35) {
    const p = rand();
    if (p < 0.15) return null;
    if (p < 0.3) return rand() < 0.5;
    if (p < 0.55) return Math.floor(rand() * 2000) - 1000;
    if (p < 0.7) return rand() * 1e6;
    return ["", "x", "é€", "😀", 'q"\\/'][Math.floor(rand() * 5)];
  }
  if (r < 0.55) {
    return Array.from({ length: Math.floor(rand() * 4) }, () => genValue(rand, depth - 1));
  }
  const obj: Record<string, unknown> = {};
  const n = Math.floor(rand() * 5);
  for (let i = 0; i < n; i++) {
    obj[KEY_POOL[Math.floor(rand() * KEY_POOL.length)]!] = genValue(rand, depth - 1);
  }
  return obj;
}

describe("legacy and rfc8785 differ exactly where key order is engine-dependent", () => {
  const rand = mulberry32(0xc0ffee);
  const values = Array.from({ length: 4000 }, () => genValue(rand, 4));

  it("agrees on every value without order-sensitive keys, differs on every one with them", () => {
    let sensitive = 0;
    let insensitive = 0;
    for (const v of values) {
      const same = canonicalStringify(v, "cesteral-c14n-v1") === canonicalStringify(v, "rfc8785");
      if (hasOrderSensitiveKeys(v)) {
        sensitive++;
        expect(same).toBe(false);
      } else {
        insensitive++;
        expect(same).toBe(true);
      }
    }
    // Guard against a vacuous pass: both branches must really be exercised.
    expect(sensitive).toBeGreaterThan(100);
    expect(insensitive).toBeGreaterThan(100);
  });
});

describe("hasOrderSensitiveKeys", () => {
  it.each([
    [{ "9": 1, "10": 2 }, true],
    [{ "1": 1, "-1": 2 }, true],
    [[{ x: { "2": 1, "10": 2 } }], true],
    [{ a: 1, b: 2 }, false],
    [{ "1": 1, "2": 2 }, false],
    [{ "10": 1 }, false],
    [{ "1": 1, a: 2 }, false],
    // `undefined` properties are dropped from the canonical bytes, so a dropped
    // key cannot make the surviving keys order-sensitive. (%j hides the dropped
    // key in the title: this row is { "9": undefined, "10": 1 }.)
    [{ "9": undefined, "10": 1 }, false],
    [[1, 2, 3], false],
    ["str", false],
    [null, false],
    [5, false],
  ])("hasOrderSensitiveKeys(%j) is %s", (value, expected) => {
    expect(hasOrderSensitiveKeys(value)).toBe(expected);
  });
});

describe("hashActionInput with an algorithm", () => {
  const sensitive = { b: 1, "10": 2, "9": 3, a: 4, "-1": 5 };

  it("defaults to legacy, matching the explicit name", () => {
    expect(hashActionInput(sensitive)).toBe(hashActionInput(sensitive, "cesteral-c14n-v1"));
  });

  it("is sha256 over each algorithm's own canonical bytes", () => {
    expect(hashActionInput(sensitive, "cesteral-c14n-v1")).toBe(
      sha256('{"9":3,"10":2,"-1":5,"a":4,"b":1}')
    );
    expect(hashActionInput(sensitive, "rfc8785")).toBe(sha256('{"-1":5,"10":2,"9":3,"a":4,"b":1}'));
  });

  it("gives different hashes for an order-sensitive input and equal hashes otherwise", () => {
    expect(hashActionInput(sensitive, "rfc8785")).not.toBe(
      hashActionInput(sensitive, "cesteral-c14n-v1")
    );
    const plain = { customerId: "1", data: { status: "PAUSED" } };
    expect(hashActionInput(plain, "rfc8785")).toBe(hashActionInput(plain, "cesteral-c14n-v1"));
  });
});

describe("computeDefinitionHash with an algorithm", () => {
  it("is unchanged by the algorithm for every shipped golden vector", () => {
    for (const v of CROSS_REPO_DEFINITION_HASH_GOLDEN_VECTORS) {
      expect(computeDefinitionHash(v.fixture)).toBe(v.expectedDefinitionHash);
      expect(computeDefinitionHash(v.fixture, "cesteral-c14n-v1")).toBe(v.expectedDefinitionHash);
      expect(computeDefinitionHash(v.fixture, "rfc8785")).toBe(v.expectedDefinitionHash);
    }
  });

  it("differs when a hashed schema has integer-like property names", () => {
    const tool = { name: "t", inputSchema: { properties: { "2": {}, "10": {}, a: {} } } };
    expect(computeDefinitionHash(tool, "cesteral-c14n-v1")).toBe(
      sha256('{"inputSchema":{"properties":{"2":{},"10":{},"a":{}}},"name":"t"}')
    );
    expect(computeDefinitionHash(tool, "rfc8785")).toBe(
      sha256('{"inputSchema":{"properties":{"10":{},"2":{},"a":{}}},"name":"t"}')
    );
  });
});
