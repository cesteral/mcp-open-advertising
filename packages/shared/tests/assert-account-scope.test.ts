// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect } from "vitest";
import { assertAccountScope } from "../src/utils/assert-account-scope.js";
import { McpError, JsonRpcErrorCode } from "../src/utils/mcp-errors.js";

describe("assertAccountScope", () => {
  it("throws InvalidParams when the declared account differs from the bound account", () => {
    let caught: unknown;
    try {
      assertAccountScope("acct_B", "acct_A", "advertiserId");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(McpError);
    expect((caught as McpError).code).toBe(JsonRpcErrorCode.InvalidParams);
    expect((caught as McpError).message).toContain("advertiserId");
    expect((caught as McpError).message).toContain("acct_B");
    expect((caught as McpError).message).toContain("acct_A");
  });

  it("does not throw when the declared account equals the bound account", () => {
    expect(() => assertAccountScope("acct_A", "acct_A", "advertiserId")).not.toThrow();
  });

  it("does not throw when the declared account is undefined (optional / omitted)", () => {
    expect(() => assertAccountScope(undefined, "acct_A", "profileId")).not.toThrow();
  });

  it("uses the provided parameter name in the error message", () => {
    try {
      assertAccountScope("111", "222", "adAccountId");
      throw new Error("expected assertAccountScope to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(McpError);
      expect((err as McpError).message).toMatch(/^adAccountId '111'/);
    }
  });
});
