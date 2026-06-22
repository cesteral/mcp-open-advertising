// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.

import { describe, expect, it } from "vitest";
import {
  cesteralAnnotationSchema,
  CROSS_REPO_ANNOTATION_PARITY_GOLDEN,
} from "../src/index.js";

/**
 * Producer self-test for the cross-repo annotation-schema parity vector.
 *
 * Asserts THIS package's `cesteralAnnotationSchema` reproduces the pinned
 * accept/reject behavior. The governance consumer (cesteral-governance-layer)
 * imports the SAME exported constant and runs the equivalent assertion against
 * its installed copy, so a one-sided version bump that changed accept/reject
 * behavior fails on whichever side drifted. See cross-repo-golden.ts.
 */
describe("CROSS_REPO_ANNOTATION_PARITY_GOLDEN (producer self-test)", () => {
  it("accepts the pinned valid entity-write annotation", () => {
    const r = cesteralAnnotationSchema.safeParse(CROSS_REPO_ANNOTATION_PARITY_GOLDEN.accepted.fixture);
    expect(r.success).toBe(true);
  });

  it("rejects the pinned invalid annotation, for the pinned reason", () => {
    const r = cesteralAnnotationSchema.safeParse(CROSS_REPO_ANNOTATION_PARITY_GOLDEN.rejected.fixture);
    expect(r.success).toBe(false);
    if (!r.success) {
      const { expectedIssuePathIncludes } = CROSS_REPO_ANNOTATION_PARITY_GOLDEN.rejected;
      const matched = r.error.issues.some((issue) =>
        issue.path.some((seg) => String(seg).includes(expectedIssuePathIncludes))
      );
      expect(matched).toBe(true);
    }
  });
});
