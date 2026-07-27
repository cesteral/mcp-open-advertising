import { describe, it, expect } from "vitest";

import {
  evaluateContractVersionBump,
  CONTRACT_PACKAGES,
} from "../check-contract-version-bump.mjs";

/**
 * Unit tests for the pure core of the contract-library version-bump guard
 * (issues #165, #171). The git plumbing is exercised by the real CI job; here
 * we pin the decision logic against already-resolved facts.
 */

function pkg(overrides = {}) {
  return {
    name: "contract-hash",
    srcChanged: true,
    baseVersion: "1.2.0",
    headVersion: "1.2.0",
    ...overrides,
  };
}

describe("evaluateContractVersionBump", () => {
  it("flags a source change that left the version alone", () => {
    const violations = evaluateContractVersionBump([pkg()]);
    expect(violations).toHaveLength(1);
    expect(violations[0].name).toBe("contract-hash");
    expect(violations[0].reason).toContain("still 1.2.0");
  });

  it("passes when the version moved alongside the source", () => {
    expect(evaluateContractVersionBump([pkg({ headVersion: "2.0.0" })])).toEqual([]);
  });

  it("ignores a package whose source did not change", () => {
    expect(evaluateContractVersionBump([pkg({ srcChanged: false })])).toEqual([]);
  });

  it("ignores a newly added package, which has no version to bump", () => {
    expect(evaluateContractVersionBump([pkg({ baseVersion: null })])).toEqual([]);
  });

  it("flags a source change whose package.json lost its version field", () => {
    const violations = evaluateContractVersionBump([pkg({ headVersion: null })]);
    expect(violations[0].reason).toContain("no version field");
  });

  it("reports each offending package independently", () => {
    const violations = evaluateContractVersionBump([
      pkg({ name: "contract-hash", headVersion: "2.0.0" }),
      pkg({ name: "contract-schema", baseVersion: "1.3.0", headVersion: "1.3.0" }),
    ]);
    expect(violations.map((v) => v.name)).toEqual(["contract-schema"]);
  });

  /**
   * The exact history this guard exists for. `640c33c` changed the
   * canonicalizer and `a5b0f96` tightened the annotation schema; neither
   * touched a package.json, and both shipped as a second build of an
   * already-published version.
   */
  it("would have failed on the two real unbumped commits", () => {
    const violations = evaluateContractVersionBump([
      { name: "contract-hash", srcChanged: true, baseVersion: "1.2.0", headVersion: "1.2.0" },
      { name: "contract-schema", srcChanged: true, baseVersion: "1.3.0", headVersion: "1.3.0" },
    ]);
    expect(violations.map((v) => v.name)).toEqual(["contract-hash", "contract-schema"]);
  });

  it("covers both published contract libraries", () => {
    expect(CONTRACT_PACKAGES).toEqual(["contract-hash", "contract-schema"]);
  });
});
