import { describe, it, expect } from "vitest";

import { compareAnnotationSchemas } from "../check-contract-schema-published-parity.mjs";

/**
 * Unit tests for the pure comparison core of the contract-schema release parity
 * guard (issue #171, step 3). The npm/network path runs in the real release
 * workflow; here we pin the decision logic with stub module objects.
 */

const OK = { success: true, data: {} };
const FAIL = { success: false, error: { issues: [] } };

const VECTORS = [
  {
    label: "entity write omitting requiresValidation",
    promiseField: "requiresValidation",
    fixture: { marker: "promise-missing" },
  },
];

const GOLDEN = {
  accepted: { fixture: { marker: "good" } },
  rejected: { fixture: { marker: "bad-contract-id" }, expectedIssuePathIncludes: "contractId" },
};

/**
 * `strict` models the post-a5b0f96 workspace build: it rejects the
 * promise-missing fixture. `loose` models the published 1.3.0: it accepts it.
 * Both agree on the golden pair — which is exactly why the golden alone cannot
 * tell them apart.
 */
function strict() {
  return {
    parseCesteralAnnotation: (f) =>
      f.marker === "good" ? OK : f.marker === "promise-missing" ? FAIL : FAIL,
    CROSS_REPO_WRITE_PROMISE_REJECTION_VECTORS: VECTORS,
    CROSS_REPO_ANNOTATION_PARITY_GOLDEN: GOLDEN,
  };
}

function loose() {
  return {
    parseCesteralAnnotation: (f) =>
      f.marker === "good" ? OK : f.marker === "promise-missing" ? OK : FAIL,
    CROSS_REPO_WRITE_PROMISE_REJECTION_VECTORS: VECTORS,
    CROSS_REPO_ANNOTATION_PARITY_GOLDEN: GOLDEN,
  };
}

describe("compareAnnotationSchemas", () => {
  it("passes when both builds reject the same annotations", () => {
    expect(compareAnnotationSchemas(strict(), strict())).toEqual([]);
  });

  /**
   * The regression the vector set exists for. The published build is looser on
   * the write-promise fields while agreeing on every other fixture — which is
   * the shape the sibling contract-hash guard missed entirely.
   */
  it("catches a published build looser than the workspace", () => {
    // Precondition: the two builds are indistinguishable on the golden pair.
    expect(loose().parseCesteralAnnotation(GOLDEN.accepted.fixture).success).toBe(true);
    expect(loose().parseCesteralAnnotation(GOLDEN.rejected.fixture).success).toBe(false);

    const mismatches = compareAnnotationSchemas(strict(), loose());
    expect(mismatches.join("\n")).toContain("admission schema is looser");
    expect(mismatches.join("\n")).toContain("requiresValidation");
  });

  it("flags a vector the workspace no longer rejects, rather than passing silently", () => {
    const workspace = strict();
    workspace.parseCesteralAnnotation = () => OK;
    const mismatches = compareAnnotationSchemas(workspace, loose());
    expect(mismatches.join("\n")).toContain("re-pin the vector set");
  });

  it("fails closed when the workspace exports no rejection vectors", () => {
    const workspace = strict();
    workspace.CROSS_REPO_WRITE_PROMISE_REJECTION_VECTORS = [];
    expect(compareAnnotationSchemas(workspace, strict()).join("\n")).toContain(
      "cannot establish parity over the write-promise fields"
    );
  });

  it("catches a published build that rejects the canonical accepted annotation", () => {
    const published = strict();
    published.parseCesteralAnnotation = () => FAIL;
    expect(compareAnnotationSchemas(strict(), published).join("\n")).toContain(
      "REJECTS the canonical accepted annotation"
    );
  });

  it("catches a published build that accepts the canonical rejected annotation", () => {
    const published = strict();
    published.parseCesteralAnnotation = () => OK;
    expect(compareAnnotationSchemas(strict(), published).join("\n")).toContain(
      "ACCEPTS the canonical rejected annotation"
    );
  });

  it("reports a throwing parser as a mismatch instead of crashing", () => {
    const published = strict();
    published.parseCesteralAnnotation = () => {
      throw new Error("boom");
    };
    expect(compareAnnotationSchemas(strict(), published).join("\n")).toContain("threw");
  });
});
