// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Re-export shim. Governed write response shapes (dry-run, dispatched
 * capability, effect result) are owned by `@cesteral/contract-schema` (shared
 * with the governance layer). This file preserves the historical
 * `@cesteral/shared` import path.
 */

export type {
  DryRunValidationError,
  DryRunResult,
  DispatchedCapability,
  EffectResult,
  EffectDryRunResult,
} from "@cesteral/contract-schema";
