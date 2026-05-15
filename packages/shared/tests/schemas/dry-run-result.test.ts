// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect, expectTypeOf } from "vitest";
import { z } from "zod";
import {
  DryRunResultSchema,
  NormalizedEntitySnapshotSchema,
} from "../../src/schemas/dry-run-result.js";
import type { DryRunResult, NormalizedEntitySnapshot } from "../../src/index.js";

/**
 * The Zod schema and the TS interface for `DryRunResult` are two
 * representations of the same contract. This test fails the build if they
 * drift — anyone editing one must update the other.
 */
describe("DryRunResultSchema ↔ DryRunResult interface parity", () => {
  it("z.infer<DryRunResultSchema> is structurally compatible with DryRunResult", () => {
    type Inferred = z.infer<typeof DryRunResultSchema>;
    // Both directions: each is assignable to the other.
    expectTypeOf<Inferred>().toMatchTypeOf<DryRunResult>();
    expectTypeOf<DryRunResult>().toMatchTypeOf<Inferred>();
  });

  it("z.infer<NormalizedEntitySnapshotSchema> is structurally compatible with NormalizedEntitySnapshot", () => {
    type Inferred = z.infer<typeof NormalizedEntitySnapshotSchema>;
    expectTypeOf<Inferred>().toMatchTypeOf<NormalizedEntitySnapshot>();
    expectTypeOf<NormalizedEntitySnapshot>().toMatchTypeOf<Inferred>();
  });

  it("accepts a minimal valid DryRunResult", () => {
    const value: DryRunResult = {
      wouldSucceed: true,
      validationErrors: [],
      validationSource: "symbolic",
      expectedStateSource: "none",
    };
    expect(DryRunResultSchema.parse(value)).toEqual(value);
  });

  it("accepts a fully populated DryRunResult", () => {
    const value: DryRunResult = {
      wouldSucceed: true,
      validationErrors: [{ code: "test", message: "msg", field: "data.daily_budget" }],
      validationSource: "native_validator",
      expectedStateSource: "server_symbolic_apply",
      expectedPostState: {
        schemaVersion: 1,
        platform: "meta_ads",
        entityKind: "ad_set",
        platformEntityId: "123",
        displayName: "Test",
        accountId: "act_456",
        status: { canonical: "paused", platformRaw: "PAUSED" },
        budget: { daily: { amountMinor: 10000, currency: "USD" } },
        schedule: { startAt: null, endAt: null },
      },
    };
    expect(DryRunResultSchema.parse(value)).toEqual(value);
  });

  it("rejects unknown validationSource values", () => {
    const result = DryRunResultSchema.safeParse({
      wouldSucceed: true,
      validationErrors: [],
      validationSource: "guessed",
      expectedStateSource: "none",
    });
    expect(result.success).toBe(false);
  });
});
