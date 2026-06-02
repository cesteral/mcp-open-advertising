// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect, expectTypeOf } from "vitest";
import { z } from "zod";
import {
  DryRunResultSchema,
  NormalizedEntitySnapshotSchema,
  DispatchedCapabilitySchema,
  EffectResultSchema,
  EffectDryRunResultSchema,
} from "../../src/schemas/dry-run-result.js";
import type {
  DryRunResult,
  NormalizedEntitySnapshot,
  DispatchedCapability,
  EffectResult,
  EffectDryRunResult,
} from "../../src/index.js";

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

describe("DispatchedCapability nullable canonicalEntityKind", () => {
  it("accepts a non-null kind for entity writes", () => {
    const v: DispatchedCapability = { operation: "update", canonicalEntityKind: "campaign" };
    expect(DispatchedCapabilitySchema.parse(v).canonicalEntityKind).toBe("campaign");
  });
  it("accepts null for effect writes", () => {
    const v: DispatchedCapability = { operation: "upload", canonicalEntityKind: null };
    expect(DispatchedCapabilitySchema.parse(v).canonicalEntityKind).toBeNull();
  });
  it("still rejects empty-string operation", () => {
    expect(
      DispatchedCapabilitySchema.safeParse({ operation: "", canonicalEntityKind: null }).success
    ).toBe(false);
  });
  it("schema ↔ interface parity", () => {
    type Inferred = z.infer<typeof DispatchedCapabilitySchema>;
    expectTypeOf<Inferred>().toMatchTypeOf<DispatchedCapability>();
    expectTypeOf<DispatchedCapability>().toMatchTypeOf<Inferred>();
  });
});

describe("EffectResult / EffectDryRunResult schemas", () => {
  it("validates an effect result with a scalar summary", () => {
    const v: EffectResult = {
      effectKind: "asset_created",
      summary: { assetId: "a1", bytes: 1024, accepted: true, note: null },
    };
    expect(EffectResultSchema.parse(v)).toEqual(v);
  });
  it("rejects a non-scalar summary value", () => {
    expect(
      EffectResultSchema.safeParse({ effectKind: "x", summary: { nested: { a: 1 } } }).success
    ).toBe(false);
  });
  it("validates a symbolic effect dry-run with an expected effect", () => {
    const v: EffectDryRunResult = {
      wouldSucceed: true,
      validationErrors: [],
      validationSource: "symbolic",
      expectedEffectSource: "symbolic",
      expectedEffect: { effectKind: "schedule_created", summary: { scheduleId: "s1" } },
    };
    expect(EffectDryRunResultSchema.parse(v)).toEqual(v);
  });
  it("allows omitting expectedEffect when source is none", () => {
    const v: EffectDryRunResult = {
      wouldSucceed: false,
      validationErrors: [{ code: "bad", message: "nope" }],
      validationSource: "none",
      expectedEffectSource: "none",
    };
    expect(EffectDryRunResultSchema.parse(v)).toEqual(v);
  });
  it("EffectResult schema ↔ interface parity", () => {
    type Inferred = z.infer<typeof EffectResultSchema>;
    expectTypeOf<Inferred>().toMatchTypeOf<EffectResult>();
    expectTypeOf<EffectResult>().toMatchTypeOf<Inferred>();
  });
  it("EffectDryRunResult schema ↔ interface parity", () => {
    type Inferred = z.infer<typeof EffectDryRunResultSchema>;
    expectTypeOf<Inferred>().toMatchTypeOf<EffectDryRunResult>();
    expectTypeOf<EffectDryRunResult>().toMatchTypeOf<Inferred>();
  });
});
