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
