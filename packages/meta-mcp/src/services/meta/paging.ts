// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Cursor for the next page of a Graph API edge, or `undefined` when the
 * result set is exhausted.
 *
 * Meta returns `paging.cursors.after` on EVERY page, including the last one;
 * only the presence of `paging.next` means another page exists. Meta's own
 * Business SDK keys its iterator on exactly this
 * (facebook-python-business-sdk `facebook_business/api.py`, `Cursor.load_next_page`:
 * "'after' will always exist even if no more pages are available" — it
 * requires `'next' in response['paging']` before advancing).
 */
export function nextPageCursor(paging: unknown): string | undefined {
  if (!paging || typeof paging !== "object") return undefined;
  const { next, cursors } = paging as { next?: unknown; cursors?: { after?: unknown } };
  if (typeof next !== "string" || next.length === 0) return undefined;
  const after = cursors?.after;
  return typeof after === "string" && after.length > 0 ? after : undefined;
}
