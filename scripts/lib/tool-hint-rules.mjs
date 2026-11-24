// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// The fleet's rule set for MCP tool annotations (readOnlyHint, destructiveHint,
// idempotentHint, openWorldHint), derived from what a tool DOES, not from what
// its neighbours happened to ship. One definition, two consumers:
// tool-hints.test.mjs (the ratchet) and docs/architecture/tool-hints.md.
//
// The 2026-09 fleet review (_cross-fleet.md #11, #12) found the same operation
// carrying different hints on different servers, and its proposed canon (create,
// duplicate and upload destructive=false; every tool openWorld=true) was never
// applied. This is the rule set the owner approved in its place (#235, #248).
//
// MCP's definitions, which these rules follow literally:
//   destructiveHint  "may perform destructive updates (deleting or overwriting)";
//                    false means "only additive updates". Only meaningful when
//                    readOnlyHint is false.
//   idempotentHint   "calling repeatedly with the same arguments has no additional
//                    effect". Only meaningful when readOnlyHint is false.
//   openWorldHint    the tool "interacts with an open world of external
//                    entities". Here: it reaches an external system (the ad
//                    platform). False only for a tool that never leaves the process.
//
// These hints do NOT drive the destructive-op confirmation prompt (#244/#396).
// Each handler asks for confirmation itself (elicit*Confirmation in
// @cesteral/shared); nothing in the transport or the factory reads an annotation.

/**
 * What a write does to the platform. Each class fixes destructiveHint and
 * idempotentHint; the reason is the behaviour, not the verb.
 */
export const WRITE_CLASSES = {
  // Adds something that was not there; never deletes or overwrites. A retry adds
  // a second one (a second entity, asset, report job or schedule).
  additive: { destructiveHint: false, idempotentHint: false },
  // Sets existing state to the values it is given, and can overwrite what was
  // there (including a status that is a one-way door). Absolute values, so the
  // same call twice leaves the same state.
  overwrite: { destructiveHint: true, idempotentHint: true },
  // Removes, archives or cancels. The second call finds nothing left to do.
  remove: { destructiveHint: true, idempotentHint: true },
  // One tool, several actions: it can create (a retry duplicates) and also
  // overwrite or delete, so the strictest answer on both axes.
  multi: { destructiveHint: true, idempotentHint: false },
};

/** Tool name without the server prefix -> write class. */
export const WRITE_SUFFIX_CLASS = {
  // additive
  create_entity: "additive",
  bulk_create_entities: "additive",
  duplicate_entity: "additive",
  upload_image: "additive",
  upload_video: "additive",
  attach_creative: "additive",
  submit_report: "additive",
  create_report_schedule: "additive",
  create_template_schedule: "additive",
  create_report_template: "additive",
  rerun_report_schedule: "additive",
  execute_entity_report: "additive",
  graphql_query_bulk: "additive",
  create_commitment: "additive",
  create_smart_plus_entity: "additive",
  create_assigned_targeting: "additive",
  create_custom_bidding_algorithm: "additive",
  insert_conversions: "additive",
  import_from_google: "additive",
  manage_budget_schedule: "additive", // create or list only
  // overwrite
  update_entity: "overwrite",
  bulk_update_entities: "overwrite",
  bulk_update_status: "overwrite",
  bulk_manage_bid_lists: "overwrite", // batch get or batch update
  adjust_bids: "overwrite", // absolute bids, so a retry is a no-op
  adjust_line_item_bids: "overwrite",
  update_commitment: "overwrite",
  update_smart_plus_entity: "overwrite",
  update_report_template: "overwrite",
  update_report_schedule: "overwrite",
  update_conversions: "overwrite",
  // remove
  delete_entity: "remove",
  remove_entity: "remove",
  delete_report_schedule: "remove",
  delete_assigned_targeting: "remove",
  archive_entities: "remove",
  update_smart_plus_status: "remove", // enable, pause or delete
  cancel_report_execution: "remove",
  graphql_cancel_bulk_job: "remove",
  // multi
  manage_bid_list: "multi",
  manage_seed: "multi",
  manage_custom_bidding_script: "multi",
  manage_custom_bidding_rules: "multi",
  manage_ad_extensions: "multi",
  manage_criterions: "multi",
  bulk_mutate: "multi",
  graphql_query: "multi", // passthrough: query or mutation
  graphql_mutation_bulk: "multi",
};

/**
 * Tools that never leave the process, so `openWorldHint: false`. Either a
 * suffix every server shares, or one named tool. Every other tool, read or
 * write, reaches the platform and is `true`.
 */
export const LOCAL_SUFFIXES = new Set([
  "get_pacing_status", // client-side calculator
  "validate_entity", // field-rule tables
  "validate_conversion",
  "search_tools", // this server's registry
]);
export const LOCAL_TOOLS = new Set([
  "msads_search_targeting", // fixed enums, served locally
  "msads_get_targeting_options",
  "meta_get_available_metrics", // static catalog
  "sa360_get_change_history", // unavailable on Reporting API v0: errors without a call
  "msads_create_report_schedule", // unsupported: always fails without a call
  "msads_delete_report_schedule",
]);

/**
 * What the hints of `tool` must be, or a reason it cannot be classified.
 * `readOnlyHint` is read from the tool itself (a write is never inferred to be
 * a read), `prefix` is the server's tool prefix including the trailing `_`.
 *
 * @returns {{ ok: true, expected: Record<string, boolean>, kind: string } | { ok: false, reason: string }}
 */
export function expectedHints(tool, prefix) {
  const suffix = tool.name.startsWith(prefix) ? tool.name.slice(prefix.length) : tool.name;
  const openWorldHint = !(LOCAL_SUFFIXES.has(suffix) || LOCAL_TOOLS.has(tool.name));
  const writeClass = WRITE_SUFFIX_CLASS[suffix];
  if (writeClass) {
    return {
      ok: true,
      kind: writeClass,
      expected: { readOnlyHint: false, ...WRITE_CLASSES[writeClass], openWorldHint },
    };
  }
  if (tool.annotations?.readOnlyHint === true) {
    return {
      ok: true,
      kind: "read",
      expected: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint,
      },
    };
  }
  return {
    ok: false,
    reason: `${tool.name} is a write (readOnlyHint is not true) with no entry in WRITE_SUFFIX_CLASS: classify what it does in scripts/lib/tool-hint-rules.mjs`,
  };
}
