// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * The create body `snapchat_duplicate_entity` sends for a copy. Shared by the
 * service (execute) and the dry run, so the projected copy is the one that
 * would be created.
 *
 * Snapchat has no copy endpoint, so a duplicate is a read of the source
 * followed by a create. The copy is always created `PAUSED`, as gads, dv360,
 * msads and pinterest do: duplicating an ACTIVE campaign must never produce a
 * copy that spends before someone deliberately activates it. A `status` in
 * `options` is ignored.
 */

/** The status every duplicate is created with. */
export const SNAPCHAT_DUPLICATE_COPY_STATUS = "PAUSED";

/** System-managed fields the create endpoint rejects or reassigns. */
const SYSTEM_FIELDS: ReadonlySet<string> = new Set([
  "id",
  "created_at",
  "updated_at",
  "ad_account_id",
  "delivery_status",
  "deleted",
]);

export interface SnapchatDuplicateCopy {
  body: Record<string, unknown>;
  /** The `status` the caller asked for in `options`, when it was not PAUSED and so was ignored. */
  ignoredStatus?: unknown;
}

export function buildSnapchatDuplicateCopy(
  source: Record<string, unknown>,
  options?: Record<string, unknown>
): SnapchatDuplicateCopy {
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!SYSTEM_FIELDS.has(key)) body[key] = value;
  }
  // Caller overrides (e.g. a new name) win over the copied fields, except status.
  for (const [key, value] of Object.entries(options ?? {})) {
    if (key !== "status") body[key] = value;
  }
  body.status = SNAPCHAT_DUPLICATE_COPY_STATUS;

  const requested = options?.status;
  return requested !== undefined && requested !== SNAPCHAT_DUPLICATE_COPY_STATUS
    ? { body, ignoredStatus: requested }
    : { body };
}
