// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// The one failure a freshly scaffolded server is allowed: its four governed
// write stubs have no wire-request test yet (scripts/lib/wire-request-coverage.test.mjs
// runs one case per package). The scaffold smoke fails on any other failure,
// and on this one if it stops naming exactly these tools.

import { names } from "./entries.mjs";

/** The write stubs the management template generates. */
export function expectedTodoTools(key) {
  return ["create_entity", "update_entity", "delete_entity", "bulk_update_status"].map(
    (t) => `${key}_${t}`
  );
}

/** Full vitest names (describe + test) of the cases that fail until the stubs are implemented. */
export function expectedTodoFailures(key) {
  return [
    "every write tool is exercised by a vendor-sourced wire-request test " +
      `${names(key).package}: uncovered write tools are allowlisted, and only those`,
  ];
}
