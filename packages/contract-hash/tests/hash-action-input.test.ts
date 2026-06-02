// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { hashActionInput, stableStringify } from "../src/index.js";

describe("hashActionInput", () => {
  it("is sha256 over stableStringify, lowercase hex", () => {
    const args = { campaignId: "123", status: "PAUSED" };
    const expected = createHash("sha256").update(stableStringify(args), "utf8").digest("hex");
    expect(hashActionInput(args)).toBe(expected);
    expect(hashActionInput(args)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("is invariant to key ordering", () => {
    expect(hashActionInput({ a: 1, b: 2 })).toBe(hashActionInput({ b: 2, a: 1 }));
  });
});
