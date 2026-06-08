// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, expectTypeOf, it } from "vitest";
import type { z } from "zod";

import type {
  CesteralAnnotation,
  CesteralToolAnnotations,
  CesteralWriteOperation,
  DryRunResult,
  NormalizedEntitySnapshot,
} from "../src/index.js";
import {
  cesteralAnnotationSchema,
  dryRunResultSchema,
  normalizedEntitySnapshotSchema,
  writeOperationSchema,
} from "../src/index.js";

/**
 * The two faces of the contract surface — the strict TS authoring types and the
 * loose Zod validation schemas — must stay in lockstep. These compile-time
 * assertions are the pin: a value built to the strict authoring type is always
 * assignable to the schema-inferred type (authoring ⊆ schema), and the dry-run /
 * snapshot TS interfaces are structurally identical to their Zod mirrors.
 */
describe("authoring types are assignable to the validation schema", () => {
  it("CesteralToolAnnotations ⊆ inferred CesteralAnnotation", () => {
    expectTypeOf<CesteralToolAnnotations>().toMatchTypeOf<CesteralAnnotation>();
    expectTypeOf<CesteralAnnotation>().toEqualTypeOf<z.infer<typeof cesteralAnnotationSchema>>();
  });

  it("CesteralWriteOperation equals the Zod enum", () => {
    expectTypeOf<CesteralWriteOperation>().toEqualTypeOf<z.infer<typeof writeOperationSchema>>();
  });
});

describe("dry-run / snapshot TS interfaces match their Zod mirrors", () => {
  it("DryRunResult ≡ z.infer<dryRunResultSchema>", () => {
    expectTypeOf<DryRunResult>().toEqualTypeOf<z.infer<typeof dryRunResultSchema>>();
  });

  it("NormalizedEntitySnapshot ≡ z.infer<normalizedEntitySnapshotSchema>", () => {
    expectTypeOf<NormalizedEntitySnapshot>().toEqualTypeOf<
      z.infer<typeof normalizedEntitySnapshotSchema>
    >();
  });
});
