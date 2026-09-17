import { defineConfig } from "vitest/config";

// Tests for repo tooling under scripts/, plus the routing evals under evals/.
// Package-level tests run via `turbo run test`; this is a separate root-level
// suite.
//
// evals/ is included here rather than given its own runner because the ranking
// evals (#205) boot servers through scripts/lib/boot-server.mjs, exactly as the
// other root-level suites do — a second config would duplicate that wiring for
// no benefit. Model-based cross-server evals (#205 Part 2) cost model calls and
// belong on a schedule, so they must NOT be added to this include.
export default defineConfig({
  test: {
    include: ["scripts/**/*.test.mjs", "evals/**/*.test.mjs"],
  },
});
