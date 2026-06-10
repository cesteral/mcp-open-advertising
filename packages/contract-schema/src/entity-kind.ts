// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";

/**
 * Canonical entity kinds the governance layer reasons about. Platform-native
 * entities normalize into exactly one of these (DV360 InsertionOrder →
 * `insertion_order`, Meta AdSet → `ad_set`, Amazon DSP Order → `order`, etc.)
 * so annotations, snapshots, and admission all speak one vocabulary.
 *
 * The Zod enum is the source of truth; {@link CanonicalEntityKind} is its
 * inferred TS type. Enum member ORDER is irrelevant to validation and to the
 * inferred union — do not rely on it.
 */
export type CanonicalEntityKind =
  | "campaign"
  | "ad_set"
  | "insertion_order"
  | "line_item"
  | "ad_group"
  | "ad"
  | "campaign_budget"
  | "order"
  | "commitment";

// Annotated `z.ZodType<CanonicalEntityKind>` so the emitted `.d.ts` exposes the
// plain union, not a zod-version-specific `ZodEnum` — consumers on any zod major
// (the zod-3 fleet, the zod-4 governance layer) resolve a clean type through
// their own peer zod.
export const canonicalEntityKindSchema: z.ZodType<CanonicalEntityKind> = z.enum([
  "campaign",
  "ad_set",
  "insertion_order",
  "line_item",
  "ad_group",
  "ad",
  "campaign_budget",
  "order",
  "commitment",
]);
