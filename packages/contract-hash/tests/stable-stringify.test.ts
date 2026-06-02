// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect } from "vitest";
import { stableStringify } from "../src/index.js";

describe("stableStringify", () => {
  it("sorts object keys deeply and is order-invariant", () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
    expect(stableStringify({ a: { c: 3, d: 2 }, b: 1 })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });
  it("preserves array element order but sorts nested object keys", () => {
    expect(stableStringify([{ b: 1, a: 2 }, 3])).toBe('[{"a":2,"b":1},3]');
  });
  it("drops undefined object properties (JSON semantics)", () => {
    expect(stableStringify({ a: undefined, b: 1 })).toBe('{"b":1}');
  });
  it("emits null and empty containers", () => {
    expect(stableStringify({ a: null, b: [], c: {} })).toBe('{"a":null,"b":[],"c":{}}');
  });
  it("THROWS on non-JSON values rather than coercing", () => {
    expect(() => stableStringify(NaN)).toThrow(/JSON/i);
    expect(() => stableStringify(Infinity)).toThrow(/JSON/i);
    expect(() => stableStringify(10n)).toThrow(/BigInt/i);
    expect(() => stableStringify(new Date(0))).toThrow(/Date/i);
    expect(() => stableStringify(() => 1)).toThrow(/function/i);
    expect(() => stableStringify(Symbol("x"))).toThrow(/symbol/i);
  });
  it("THROWS on root undefined (JSON.stringify(undefined) === undefined would violate :string)", () => {
    expect(() => stableStringify(undefined)).toThrow(/undefined/i);
  });
  it("drops undefined object props but rejects undefined array elements", () => {
    expect(stableStringify({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(() => stableStringify([undefined])).toThrow(/undefined/i);
  });
});
