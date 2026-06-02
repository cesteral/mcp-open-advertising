// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect } from "vitest";
import { assertGovernedEffectDryRun } from "../../src/index.js";
import type { EffectDryRunResult } from "../../src/index.js";

const ok: EffectDryRunResult = {
  wouldSucceed: true,
  validationErrors: [],
  validationSource: "symbolic",
  expectedEffectSource: "symbolic",
  expectedEffect: { effectKind: "asset_created", summary: { assetId: "a1" } },
};

describe("assertGovernedEffectDryRun", () => {
  it("returns a symbolic-validated, simulated effect dry-run unchanged", () => {
    expect(
      assertGovernedEffectDryRun(ok, "meta_upload_image", {
        requiresValidation: true,
        requiresSimulation: true,
      })
    ).toEqual(ok);
  });

  it("throws when requiresValidation but validationSource is none", () => {
    const r: EffectDryRunResult = { ...ok, validationSource: "none" };
    expect(() =>
      assertGovernedEffectDryRun(r, "meta_upload_image", {
        requiresValidation: true,
        requiresSimulation: false,
      })
    ).toThrow(/validate/i);
  });

  it("throws when requiresSimulation but expectedEffect is missing", () => {
    const r: EffectDryRunResult = {
      wouldSucceed: true,
      validationErrors: [],
      validationSource: "symbolic",
      expectedEffectSource: "none",
    };
    expect(() =>
      assertGovernedEffectDryRun(r, "meta_upload_image", {
        requiresValidation: true,
        requiresSimulation: true,
      })
    ).toThrow(/effect/i);
  });

  it("does NOT throw when the contract honestly promises neither", () => {
    const r: EffectDryRunResult = {
      wouldSucceed: true,
      validationErrors: [],
      validationSource: "none",
      expectedEffectSource: "none",
    };
    expect(
      assertGovernedEffectDryRun(r, "meta_upload_video", {
        requiresValidation: false,
        requiresSimulation: false,
      })
    ).toEqual(r);
  });
});
