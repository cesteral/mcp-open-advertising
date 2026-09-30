// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * The create body `pinterest_duplicate_entity` sends for a copy. Shared by the
 * service (execute) and the dry run, so the projected copy is the one that
 * would be created.
 *
 * Pinterest v5 has no copy endpoint, so a duplicate is a read of the source
 * followed by a create. The copy is always created `PAUSED`, as dv360 and
 * msads do: duplicating an ACTIVE campaign must never produce a copy that
 * spends before someone deliberately activates it. A `status` in `options` is
 * ignored. Forcing the status also avoids sending a status create does not
 * accept for a new entity (`ARCHIVED`, `DELETED_DRAFT`).
 */

import type { PinterestEntityType } from "./entity-mapping.js";
import { READ_ONLY_FIELDS } from "./pinterest-fields.js";

/** The status every duplicate is created with. */
export const PINTEREST_DUPLICATE_COPY_STATUS = "PAUSED";

/**
 * Fields never copied: the entity's read-only fields (`READ_ONLY_FIELDS`,
 * from the v5 OpenAPI) plus `ad_account_id`, which comes from the tool's
 * `adAccountId`, and two Pin/board counters.
 */
const ALWAYS_STRIPPED = ["ad_account_id", "pin_count", "view_tags"] as const;

export interface PinterestDuplicateCopy {
  body: Record<string, unknown>;
  /** The `status` the caller asked for in `options`, when it was not PAUSED and so was ignored. */
  ignoredStatus?: unknown;
}

export function buildPinterestDuplicateCopy(
  entityType: PinterestEntityType,
  source: Record<string, unknown>,
  options?: Record<string, unknown>
): PinterestDuplicateCopy {
  const stripped = new Set<string>([...READ_ONLY_FIELDS[entityType], ...ALWAYS_STRIPPED]);
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!stripped.has(key)) body[key] = value;
  }
  for (const [key, value] of Object.entries(options ?? {})) {
    if (!stripped.has(key) && key !== "status") body[key] = value;
  }
  body.status = PINTEREST_DUPLICATE_COPY_STATUS;

  const requested = options?.status;
  return requested !== undefined && requested !== PINTEREST_DUPLICATE_COPY_STATUS
    ? { body, ignoredStatus: requested }
    : { body };
}
