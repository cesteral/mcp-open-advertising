// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect, expectTypeOf } from "vitest";
import * as shared from "../../src/index.js";
import type {
  DecisionTokenVerdict,
  DecisionTokenReason,
  TokenMode,
  JtiStore,
  FirestoreLike,
  EffectResult,
  EffectDryRunResult,
  CesteralEntityWriteToolAnnotations,
  CesteralEffectWriteToolAnnotations,
  CesteralWriteOperation,
} from "../../src/index.js";

/** Locks the public governance API surface so an accidental export removal breaks the build. */
describe("governance public exports", () => {
  it("exports the runtime governance API from @cesteral/shared", () => {
    const runtime = [
      "verifyDecisionToken",
      "resolveTokenMode",
      "InMemoryJtiStore",
      "FirestoreJtiStore",
      "selectJtiStore",
      "logDecisionTokenVerdict",
      "recordDecisionTokenVerification",
      "assertGovernedDryRunResult",
      "assertGovernedEffectDryRun",
      "isEntityWrite",
      "isEffectWrite",
      "EffectResultSchema",
      "EffectDryRunResultSchema",
      "DispatchedCapabilitySchema",
    ] as const;
    for (const name of runtime) {
      expect(shared[name as keyof typeof shared], `missing export: ${name}`).toBeDefined();
    }
  });

  it("exports the governance type surface", () => {
    expectTypeOf<DecisionTokenVerdict>().toBeObject();
    expectTypeOf<DecisionTokenReason>().not.toBeNever();
    expectTypeOf<TokenMode>().not.toBeNever();
    expectTypeOf<JtiStore>().toBeObject();
    expectTypeOf<FirestoreLike>().toBeObject();
    expectTypeOf<EffectResult>().toBeObject();
    expectTypeOf<EffectDryRunResult>().toBeObject();
    expectTypeOf<CesteralEntityWriteToolAnnotations>().toBeObject();
    expectTypeOf<CesteralEffectWriteToolAnnotations>().toBeObject();
    expectTypeOf<CesteralWriteOperation>().not.toBeNever();
  });
});
