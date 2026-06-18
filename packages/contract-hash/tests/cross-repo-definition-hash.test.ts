// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect } from "vitest";
import { computeDefinitionHash, CROSS_REPO_DEFINITION_HASH_GOLDEN } from "../src/index.js";

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
