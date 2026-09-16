// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect } from "vitest";
import {
  auditAccountScopeFile,
  auditAccountScopeCoverage,
  auditSessionBoundScopeFile,
  auditSessionBoundScopeCoverage,
  extractSessionBoundKeys,
} from "./account-scope-audit.mjs";

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

// ─── Session-contract rule (#211 Gap 1) ──────────────────────────────────────

describe("extractSessionBoundKeys", () => {
  it("maps a bound field to the caller-supplied key it guards", () => {
    const src = `
export interface SessionServices {
  amazonDspService: AmazonDspService;
  boundProfileId: string;
}
`;
    expect(extractSessionBoundKeys(src)).toEqual(["profileId"]);
  });

  it("reads several bindings, including an optional one", () => {
    const src = `
export interface SessionServices {
  svc: S;
  boundAdAccountId: string;
  boundAdvertiserId?: string;
}
`;
    expect(extractSessionBoundKeys(src)).toEqual(["adAccountId", "advertiserId"]);
  });

  it("returns [] for a package whose session binds nothing", () => {
    expect(
      extractSessionBoundKeys(`
export interface SessionServices {
  cm360Service: CM360Service;
}
`)
    ).toEqual([]);
  });

  it("returns null — not [] — when the interface cannot be found", () => {
    // The runner must fail loudly here. Degrading to "no binding" would disable
    // the rule on a rename, which is the quiet blind spot it exists to close.
    expect(extractSessionBoundKeys("export type SessionServices = { x: 1 };")).toBeNull();
  });

  it("does not match the English word 'bounded' or non-account fields", () => {
    expect(
      extractSessionBoundKeys(`
export interface SessionServices {
  boundedRetries: number;
  boundary: string;
  boundThing: string;
}
`)
    ).toEqual([]);
  });
});

/** The pre-#195 shape: a required profileId, with the binding held in the SERVICE. */
const COMMITMENT_SHAPE = `
const inputSchema = z.object({
  profileId: z.string().min(1).describe("Amazon DSP Profile ID"),
  data: z.record(z.any()),
});
export async function createCommitmentLogic(input, context, sdkContext) {
  const { amazonDspV1Service } = resolveSessionServices(sdkContext);
  const after = buildCommitmentSnapshot(id, input.profileId, commitment, {});
  return await amazonDspV1Service.createCommitment(input.data, context);
}
`;

describe("auditSessionBoundScopeFile", () => {
  const boundKeys = ["profileId"];

  it("flags the shape that reached production in #195", () => {
    // The whole point: no `bound*` local, so the rule above sees nothing at all.
    expect(auditAccountScopeFile({ path: "t.ts", source: COMMITMENT_SHAPE })).toBeNull();

    const v = auditSessionBoundScopeFile({ path: "t.ts", source: COMMITMENT_SHAPE, boundKeys });
    expect(v).not.toBeNull();
    expect(v.keys).toEqual(["profileId"]);
  });

  it("passes once the handler asserts", () => {
    const fixed = COMMITMENT_SHAPE.replace(
      "const { amazonDspV1Service } = resolveSessionServices(sdkContext);",
      "const { amazonDspV1Service, boundProfileId } = resolveSessionServices(sdkContext);\n" +
        '  assertAccountScope(input.profileId, boundProfileId, "profileId");'
    );
    expect(auditSessionBoundScopeFile({ path: "t.ts", source: fixed, boundKeys })).toBeNull();
  });

  it("passes an explicitly exempted tool", () => {
    const exempt = COMMITMENT_SHAPE + "\n// account-scope-audit-exempt: reason\n";
    expect(auditSessionBoundScopeFile({ path: "t.ts", source: exempt, boundKeys })).toBeNull();
  });

  it("ignores a tool that never resolves session services", () => {
    // Symbolic validators and pure projections cannot execute against any
    // account, so they need no reconciliation. Excluding them requires only the
    // absence of the call — no dataflow analysis.
    const symbolic = `
const inputSchema = z.object({ profileId: z.string() });
export async function validateEntityLogic(input) {
  return { valid: true, profileId: input.profileId };
}
`;
    expect(auditSessionBoundScopeFile({ path: "t.ts", source: symbolic, boundKeys })).toBeNull();
  });

  it("ignores a package whose session binds nothing", () => {
    expect(
      auditSessionBoundScopeFile({ path: "t.ts", source: COMMITMENT_SHAPE, boundKeys: [] })
    ).toBeNull();
  });

  it("requires a schema declaration, not a passing mention", () => {
    // `profileId` shows up in annotations, argMaps and examples across these
    // files; only a Zod field declaration means the caller can supply it.
    const mentionOnly = `
const inputSchema = z.object({ entityId: z.string() });
export async function logic(input, c, sdkContext) {
  const { svc } = resolveSessionServices(sdkContext);
  // entityIdArgs: ["profileId"], argMap: { profileId: "profileId" }
  return svc.get(input.entityId);
}
`;
    expect(auditSessionBoundScopeFile({ path: "t.ts", source: mentionOnly, boundKeys })).toBeNull();
  });

  it("flags the key even when the caller's value IS forwarded upstream", () => {
    // Deliberate. Whether the id reaches the platform is not statically
    // decidable here — it travels through intermediate objects and nested
    // clients. A forwarded id still escapes the session binding unless
    // reconciled, so it must assert or carry an exemption.
    const forwarded = `
const inputSchema = z.object({ profileId: z.string() });
export async function logic(input, c, sdkContext) {
  const { svc } = resolveSessionServices(sdkContext);
  const filters = { profileId: input.profileId };
  return svc.list(filters);
}
`;
    expect(
      auditSessionBoundScopeFile({ path: "t.ts", source: forwarded, boundKeys })
    ).not.toBeNull();
  });
});

describe("auditSessionBoundScopeCoverage", () => {
  it("reports only the offending files", () => {
    const bad = `const s = z.object({ profileId: z.string() });
      const { svc } = resolveSessionServices(sdkContext);`;
    const good = `const s = z.object({ profileId: z.string() });
      const { svc, boundProfileId } = resolveSessionServices(sdkContext);
      assertAccountScope(input.profileId, boundProfileId, "profileId");`;
    const out = auditSessionBoundScopeCoverage([
      { path: "bad.ts", source: bad, boundKeys: ["profileId"] },
      { path: "good.ts", source: good, boundKeys: ["profileId"] },
    ]);
    expect(out.map((v) => v.path)).toEqual(["bad.ts"]);
  });
});
