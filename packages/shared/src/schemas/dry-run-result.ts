// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Re-export shim. The Zod validation schemas for governed write response
 * shapes are owned by `@cesteral/contract-schema` (shared with the governance
 * layer). This file preserves the historical `@cesteral/shared` schema names
 * (PascalCase) that connectors compose into tool `outputSchema`s.
 */

export {
  dryRunValidationErrorSchema as DryRunValidationErrorSchema,
  dryRunResultSchema as DryRunResultSchema,
  normalizedEntitySnapshotSchema as NormalizedEntitySnapshotSchema,
  dispatchedCapabilitySchema as DispatchedCapabilitySchema,
  effectResultSchema as EffectResultSchema,
  effectDryRunResultSchema as EffectDryRunResultSchema,
} from "@cesteral/contract-schema";
