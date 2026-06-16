// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { computeDefinitionHash, type HashableToolDefinition } from "../src/index.js";

// Shared cross-repo vector. The IDENTICAL file + expected hash is pinned in
// cesteral-governance-layer (lib/features/governance/write-preview/__tests__/
// cross-repo-definition-hash.golden.json). Both repos hashing the same fixture
// to the same constant is what guarantees `definitionHash` parity end-to-end —
// see the file's `__doc`.
const golden = JSON.parse(
  readFileSync(new URL("./cross-repo-definition-hash.golden.json", import.meta.url), "utf8")
) as { expectedDefinitionHash: string; fixture: HashableToolDefinition };

describe("cross-repo definitionHash parity", () => {
  it("hashes the shared fixture to the pinned cross-repo constant", () => {
    expect(computeDefinitionHash(golden.fixture)).toBe(golden.expectedDefinitionHash);
  });
});
