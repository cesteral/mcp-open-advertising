// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect } from "vitest";
import { auditAccountScopeFile, auditAccountScopeCoverage } from "./account-scope-audit.mjs";

const boundAndAsserts = {
  path: "packages/pinterest-mcp/.../get-report.tool.ts",
  source: `
    const { pinterestReportingService, boundAdAccountId } = resolveSessionServices(sdkContext);
    assertAccountScope(input.adAccountId, boundAdAccountId, "adAccountId");
  `,
};

const boundNoAssert = {
  path: "packages/pinterest-mcp/.../new-report.tool.ts",
  source: `
    const { pinterestReportingService, boundAdAccountId } = resolveSessionServices(sdkContext);
    const r = await pinterestReportingService.get(boundAdAccountId, input);
  `,
};

const boundNoAssertButExempt = {
  path: "packages/pinterest-mcp/.../list-accounts.tool.ts",
  source: `
    // account-scope-audit-exempt: enumerates all accounts the session token can see
    const { boundAdAccountId } = resolveSessionServices(sdkContext);
  `,
};

const inputScopedNoBound = {
  path: "packages/pinterest-mcp/.../get-entity.tool.ts",
  source: `
    const { pinterestService } = resolveSessionServices(sdkContext);
    const e = await pinterestService.getEntity(input.entityType, { adAccountId: input.adAccountId }, input.entityId);
  `,
};

describe("auditAccountScopeFile", () => {
  it("passes a tool that reads a bound account id and asserts", () => {
    expect(auditAccountScopeFile(boundAndAsserts)).toBeNull();
  });

  it("flags a tool that reads a bound account id but never asserts", () => {
    const v = auditAccountScopeFile(boundNoAssert);
    expect(v).not.toBeNull();
    expect(v.boundVars).toContain("boundAdAccountId");
  });

  it("skips a tool with an account-scope-audit-exempt marker", () => {
    expect(auditAccountScopeFile(boundNoAssertButExempt)).toBeNull();
  });

  it("does not flag an input-scoped tool that uses no bound account id", () => {
    expect(auditAccountScopeFile(inputScopedNoBound)).toBeNull();
  });

  it("does not match the English word 'bounded'", () => {
    expect(
      auditAccountScopeFile({
        path: "x.tool.ts",
        source: "const bounded = clampToBounds(input.n); // no session account here",
      })
    ).toBeNull();
  });
});

describe("auditAccountScopeCoverage", () => {
  it("returns only the violating files", () => {
    const violations = auditAccountScopeCoverage([
      boundAndAsserts,
      boundNoAssert,
      boundNoAssertButExempt,
      inputScopedNoBound,
    ]);
    expect(violations).toHaveLength(1);
    expect(violations[0].path).toBe(boundNoAssert.path);
  });
});
