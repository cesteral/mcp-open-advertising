// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// The failures a freshly scaffolded server is allowed. A read-only server
// (the default) is allowed none. One with governed write stubs (--with-writes,
// --add-write-stubs) fails only scripts/lib/wire-request-coverage.test.mjs's
// case for its package, until each stub has a wire test, and, for a type whose
// stubs include a terminal tool (management: delete_entity, beside the
// destructive update_entity and bulk_update_status),
// scripts/lib/irreversible-confirmation.test.mjs's case, until each stub
// confirms its irreversible path. The scaffold smoke fails on any other
// failure, and on those if they stop naming exactly the stubs.

import { names } from "./entries.mjs";
import { TEMPLATE_TYPES, WRITE_TOOLS } from "./render.mjs";

/** The write stubs whose wire tests are still to come. */
export function expectedTodoTools(key, { type = "management", writes = false } = {}) {
  return writes ? WRITE_TOOLS(key, type) : [];
}

/** Full vitest names (describe + test) of the cases that fail until the stubs are implemented. */
export function expectedTodoFailures(key, { type = "management", writes = false } = {}) {
  if (!writes || WRITE_TOOLS(key, type).length === 0) return [];
  const pkg = names(key).package;
  return [
    "every write tool is exercised by a vendor-sourced wire-request test " +
      `${pkg}: uncovered write tools are allowlisted, and only those`,
    ...(TEMPLATE_TYPES[type].terminalTools.length > 0
      ? [
          "every destructive or terminal tool confirms its irreversible path " +
            `${pkg}: each candidate is covered or exempt, and only those are exempt`,
        ]
      : []),
  ];
}
