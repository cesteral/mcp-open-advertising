// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";

// =============================================================================
// SLUG SHAPE
// =============================================================================

/** Canonical slug shape: lowercase letters, digits, underscores; 1–40 chars. */
export const SLUG_PATTERN = /^[a-z0-9_]{1,40}$/;
export const MAX_SLUG_LENGTH = 40;

export const slugSchema = z
  .string()
  .min(1, "slug must not be empty")
  .max(MAX_SLUG_LENGTH, `slug must be at most ${MAX_SLUG_LENGTH} characters`)
  .regex(SLUG_PATTERN, "slug must match /^[a-z0-9_]{1,40}$/");

export type ContractPlatformSlug = z.infer<typeof slugSchema>;
export type ContractToolSlug = z.infer<typeof slugSchema>;

export const schemaVersionSchema = z
  .number()
  .int("schemaVersion must be an integer")
  .positive("schemaVersion must be positive");

// =============================================================================
// CONTRACT ID DERIVATION
// =============================================================================

/**
 * Canonical contract id: `${platformSlug}.${toolSlug}.v${schemaVersion}`.
 *
 * The single source of truth for how a `contractId` is composed. The
 * governance admission layer rejects any annotation whose declared
 * `contractId` does not equal this for its own slugs/version, so connector
 * authors and governance MUST derive it the same way. Throws (via Zod) on a
 * malformed slug or non-positive integer version.
 */
export function deriveContractId(
  platformSlug: string,
  toolSlug: string,
  schemaVersion: number
): string {
  const p = slugSchema.parse(platformSlug);
  const t = slugSchema.parse(toolSlug);
  const v = schemaVersionSchema.parse(schemaVersion);
  return `${p}.${t}.v${v}`;
}

/**
 * Non-throwing variant of {@link deriveContractId}. Returns the derived id on
 * success or the first failing field's `ZodError` — for call sites that want to
 * surface a validation problem rather than throw.
 */
export function safeDeriveContractId(
  platformSlug: string,
  toolSlug: string,
  schemaVersion: number
): { success: true; data: string } | { success: false; error: z.ZodError } {
  const p = slugSchema.safeParse(platformSlug);
  if (!p.success) return { success: false, error: p.error };
  const t = slugSchema.safeParse(toolSlug);
  if (!t.success) return { success: false, error: t.error };
  const v = schemaVersionSchema.safeParse(schemaVersion);
  if (!v.success) return { success: false, error: v.error };
  return { success: true, data: `${p.data}.${t.data}.v${v.data}` };
}
