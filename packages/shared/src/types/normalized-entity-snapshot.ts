// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Re-export shim. The canonical pre/post-write entity snapshot types are owned
 * by `@cesteral/contract-schema` (shared with the governance layer). This file
 * preserves the historical `@cesteral/shared` import path.
 */

export type {
  NormalizedEntitySnapshot,
  CanonicalEntityKind,
  CanonicalStatus,
  StatusSnapshot,
  ScheduleSnapshot,
  BudgetSnapshot,
  BudgetSegmentSnapshot,
  MoneyAmount,
} from "@cesteral/contract-schema";
