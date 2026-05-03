// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect, vi } from "vitest";
import { findPaginationConformanceViolations } from "@cesteral/shared";

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: vi.fn(),
}));

describe("ttd-mcp pagination conformance", () => {
  it("every tool with a pagination output field uses PaginationOutputSchema shape", async () => {
    const { allTools } = await import("../../src/mcp-server/tools/index.js");
    const violations = findPaginationConformanceViolations(allTools);
    expect(violations).toEqual([]);
  });
});
