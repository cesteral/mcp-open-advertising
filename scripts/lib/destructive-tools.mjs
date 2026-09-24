// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// "Does this tool destroy something?" — one definition, two consumers.
//
// Extracted from terminal-operations.test.mjs (#201) when the cross-server
// routing eval (#205 Part 2) needed the same question answered to decide whether
// a router had guessed a platform for a destructive write. A second copy is
// exactly how the redaction patterns in secret-redaction.ts drifted, and the
// weaker copy is always the one that matters.
//
// WHY BOTH HALVES ARE NEEDED
//
// The obvious rule — "the governance annotation declares operation delete or
// archive" — misses seven of the fleet's sixteen destructive tools.
// `tiktok_delete_entity`, `pinterest_delete_entity`, `snapchat_delete_entity`,
// `msads_delete_entity` and `amazon_dsp_delete_entity` all declare
// `operation: ["bulk_job"]`; `cm360_delete_entity` and
// `dv360_delete_assigned_targeting` declare `["manage"]`. Those are
// `writeClass: "effect"` bulk deletes governed as one batch effect, which is
// correct for governance and useless for identifying destructiveness. Keying a
// safety rule on the annotation alone silently exempts the tools that delete the
// most at once.
//
// WHAT IS DELIBERATELY NOT PART OF IT
//
// `annotations.destructiveHint`. MCP's hint means "this is a mutating write",
// not "this destroys data", and the fleet sets it on 90 of 314 tools — including
// `create_entity` and `upload_video`. Folding it in would classify every write
// as destructive and make any safety metric built on this meaningless.

/**
 * Canonical write operations whose effect cannot be undone by a later call.
 * `archive` is here because archival is irreversible on the platforms that
 * expose it (DV360 has no unarchive), so a client reaching for "the reversible
 * one" finds both are terminal.
 */
export const TERMINAL_OPERATIONS = new Set(["delete", "archive", "delete_schedule"]);

/**
 * Whole-token removal verbs. Underscore-anchored so `undelete` (were one ever
 * added) and `deleted_at` do not match, mirroring the write-coverage ratchet's
 * MUTATION_NAME construction.
 */
export const TERMINAL_NAME = /(^|_)(delete|remove|archive|destroy|purge)(_|$)/;

/** Name pattern OR terminal governance operation. Neither alone is sufficient. */
export function isDestructiveCandidate(tool) {
  if (TERMINAL_NAME.test(tool.name)) return true;
  const ops = tool.annotations?.cesteral?.operation;
  return Array.isArray(ops) && ops.some((op) => TERMINAL_OPERATIONS.has(op));
}

// STATUS-DEPENDENT TERMINALITY
//
// `update_entity` / `bulk_update_status` are not destructive by name or by
// operation, yet on most platforms one status value is a one-way door —
// Google Ads REMOVED, TikTok DELETE, TTD Archived, placement
// PERMANENTLY_ARCHIVED. Nine servers accepted such a value without declaring
// the tool terminal, because the rule above cannot see a value inside an enum.
//
// Kept separate from `isDestructiveCandidate` on purpose: the routing eval
// scores "called a destructive tool" with that function, and a status update is
// not the same act as a delete for that purpose.

/** Status values that are irreversible on the platform that exposes them. */
export const IRREVERSIBLE_STATUS_VALUES = new Set([
  "REMOVED",
  "DELETED",
  "DELETE",
  "ARCHIVED",
  "ENTITY_STATUS_ARCHIVED",
  "CANCELED",
  "CANCELLED",
  "PERMANENTLY_ARCHIVED",
  "PLACEMENT_STATUS_PERMANENTLY_ARCHIVED",
]);

const STATUS_KEY = /status|state|availability/i;

/**
 * Irreversible values a writing tool's input schema offers on a status-like
 * field (walks nested objects, arrays and unions). Empty for read-only tools —
 * a list filter on ARCHIVED destroys nothing.
 */
export function irreversibleStatusOptions(tool) {
  if (tool.annotations?.readOnlyHint === true) return [];
  const found = new Set();
  const walk = (node, key) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((child) => walk(child, key));
      return;
    }
    if (key && STATUS_KEY.test(key) && Array.isArray(node.enum)) {
      for (const value of node.enum) {
        if (typeof value === "string" && IRREVERSIBLE_STATUS_VALUES.has(value.toUpperCase())) {
          found.add(value);
        }
      }
    }
    for (const [childKey, child] of Object.entries(node)) {
      if (childKey === "properties" && child && typeof child === "object") {
        for (const [prop, schema] of Object.entries(child)) walk(schema, prop);
      } else if (childKey !== "enum") {
        walk(child, key);
      }
    }
  };
  walk(tool.inputSchema, undefined);
  return [...found].sort();
}
