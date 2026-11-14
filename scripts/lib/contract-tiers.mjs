// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// The cross-server contract, tiered by server type (#273 decision 5).
//
// docs/CROSS_SERVER_CONTRACT.md used to say every management server MUST ship
// a fixed tool list that three shipped servers did not meet, and nothing
// checked it. Requirements are now MUST or SHOULD per registry `type`:
//
//   - a MUST has no exceptions; a server missing one fails.
//   - a SHOULD may be missing only with an entry in that server's registry
//     `contract.exceptions` giving the reason.
//   - an exception for a requirement the server now meets fails too, so the
//     list only shrinks.
//
// Requirements are matched on the tool name after the server's `tool_prefix`.
// Static: reads registry.json only (its `tools` lists are kept equal to the
// live servers by check:registry-tools and check:registry-runtime).

/** Tool-name suffixes (after `<tool_prefix>_`) that satisfy a requirement. */
const REQUIREMENTS = {
  list_entities: { suffixes: ["list_entities"] },
  get_entity: { suffixes: ["get_entity"] },
  create_entity: { suffixes: ["create_entity"] },
  update_entity: { suffixes: ["update_entity"] },
  delete_entity: { suffixes: ["delete_entity", "remove_entity"] },
  bulk_update_status: { suffixes: ["bulk_update_status"] },
  validate_entity: { suffixes: ["validate_entity"] },
  pacing: { suffixes: ["get_pacing_status"] },
  duplicate_entity: { suffixes: ["duplicate_entity"] },
  bid_adjustment: { suffixes: ["adjust_bids", "adjust_line_item_bids"] },
  account_discovery: {
    suffixes: ["list_accounts", "list_ad_accounts", "list_advertisers", "list_user_profiles"],
  },
  search_tools: { suffixes: ["search_tools"] },
  reporting: {
    suffixes: ["get_report", "submit_report", "get_insights", "get_analytics", "run_custom_query"],
  },
  conversion_upload: { suffixes: ["insert_conversions"] },
};

export const SERVER_TYPES = {
  management: {
    must: [
      "list_entities",
      "get_entity",
      "create_entity",
      "update_entity",
      "delete_entity",
      "bulk_update_status",
      "validate_entity",
      "pacing",
    ],
    should: [
      "duplicate_entity",
      "bid_adjustment",
      "account_discovery",
      "search_tools",
      "reporting",
    ],
  },
  reporting: {
    must: ["reporting", "pacing"],
    should: ["search_tools"],
  },
  reporting_conversions: {
    must: ["list_entities", "get_entity", "reporting", "conversion_upload", "pacing"],
    should: ["search_tools"],
  },
};

const MIN_REASON_LENGTH = 20;

/** Whether `server` ships a tool satisfying `requirement`. */
export function meets(server, requirement) {
  const prefix = `${server.tool_prefix}_`;
  const suffixes = new Set(
    (server.tools ?? []).filter((t) => t.startsWith(prefix)).map((t) => t.slice(prefix.length))
  );
  return REQUIREMENTS[requirement].suffixes.some((s) => suffixes.has(s));
}

/** Every violation, as a line naming the server and what to change. */
export function checkContractTiers(registry) {
  const violations = [];
  for (const server of registry.servers) {
    const pkg = server.package;
    const tier = SERVER_TYPES[server.type];
    if (!tier) {
      violations.push(
        `${pkg}: registry \`type\` must be one of ${Object.keys(SERVER_TYPES).join(", ")}`
      );
      continue;
    }
    const exceptions = server.contract?.exceptions ?? [];
    const excepted = new Map(exceptions.map((e) => [e.requirement, e]));
    if (excepted.size !== exceptions.length) {
      violations.push(`${pkg}: contract.exceptions lists a requirement twice`);
    }

    for (const req of tier.must) {
      if (!meets(server, req)) {
        const names = REQUIREMENTS[req].suffixes.map((s) => `${server.tool_prefix}_${s}`);
        violations.push(
          `${pkg}: MUST ship ${names.join(" or ")} (${server.type}); a MUST cannot be excepted`
        );
      }
    }
    for (const req of tier.should) {
      if (!meets(server, req) && !excepted.has(req)) {
        const names = REQUIREMENTS[req].suffixes.map((s) => `${server.tool_prefix}_${s}`);
        violations.push(
          `${pkg}: SHOULD ship ${names.join(" or ")}; add it, or record why not in registry contract.exceptions`
        );
      }
    }
    for (const e of exceptions) {
      if (!tier.should.includes(e.requirement)) {
        violations.push(
          `${pkg}: contract exception "${e.requirement}" is not a SHOULD for type ${server.type}`
        );
      } else if (meets(server, e.requirement)) {
        violations.push(
          `${pkg}: contract exception "${e.requirement}" is no longer needed; remove it from registry.json`
        );
      }
      if (typeof e.reason !== "string" || e.reason.length < MIN_REASON_LENGTH) {
        violations.push(
          `${pkg}: contract exception "${e.requirement}" needs a reason (${MIN_REASON_LENGTH}+ chars)`
        );
      }
    }
  }
  return violations;
}
