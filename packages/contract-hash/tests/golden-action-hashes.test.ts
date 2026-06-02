// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { hashActionInput, stableStringify } from "../src/index.js";

const golden = JSON.parse(
  readFileSync(new URL("./golden-action-hashes.json", import.meta.url), "utf8")
) as { vectors: Array<{ input: unknown; stableString: string; actionHash: string }> };

describe("golden action-hash vectors", () => {
  for (const [i, v] of golden.vectors.entries()) {
    it(`vector ${i} canonicalizes and hashes stably`, () => {
      expect(stableStringify(v.input)).toBe(v.stableString);
      expect(hashActionInput(v.input)).toBe(v.actionHash);
    });
  }
});
