// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// The failures a freshly scaffolded server is allowed. A read-only server
// (the default) is allowed none. One with governed write stubs (--with-writes,
// --add-write-stubs) fails only scripts/lib/wire-request-coverage.test.mjs's
// case for its package, until each stub has a wire test. The scaffold smoke
// fails on any other failure, and on that one if it stops naming exactly the
// stubs.

import { names } from "./entries.mjs";
import { WRITE_TOOLS } from "./render.mjs";

/** The write stubs whose wire tests are still to come. */
export function expectedTodoTools(key, { writes = false } = {}) {
  return writes ? WRITE_TOOLS(key) : [];
}

/** Full vitest names (describe + test) of the cases that fail until the stubs are implemented. */
export function expectedTodoFailures(key, { writes = false } = {}) {
  if (!writes) return [];
  return [
    "every write tool is exercised by a vendor-sourced wire-request test " +
      `${names(key).package}: uncovered write tools are allowlisted, and only those`,
  ];
}
