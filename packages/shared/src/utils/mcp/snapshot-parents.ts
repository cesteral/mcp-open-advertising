// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { SnapshotParent, SnapshotParentKind } from "@cesteral/contract-schema";

/**
 * Builds a snapshot's `parents` list from the ancestor fields a platform's
 * read-back carries.
 *
 * ABSENT means unknown, never "has none": an ancestor whose id the read-back
 * does not name (missing, empty, or not a string / number) is skipped, and when
 * none remain the result is `undefined` so the caller omits the key instead of
 * sending an empty list. A name is kept only when the read-back carried one.
 * One entry per kind, in the order given (a repeat keeps the first).
 *
 * Callers pass the id in the form the connector uses as `platformEntityId` for
 * that ancestor, so a consumer can compare it with a control scoped to it.
 */
export function buildSnapshotParents(
  candidates: ReadonlyArray<{ kind: SnapshotParentKind; id: unknown; name?: unknown }>
): SnapshotParent[] | undefined {
  const parents: SnapshotParent[] = [];
  const seen = new Set<SnapshotParentKind>();
  for (const { kind, id, name } of candidates) {
    if (seen.has(kind)) continue;
    const cleanId = typeof id === "string" ? id.trim() : typeof id === "number" ? String(id) : "";
    if (!cleanId) continue;
    seen.add(kind);
    const cleanName = typeof name === "string" ? name.trim() : "";
    parents.push(cleanName ? { kind, id: cleanId, name: cleanName } : { kind, id: cleanId });
  }
  return parents.length > 0 ? parents : undefined;
}
