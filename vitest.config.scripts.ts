import { defineConfig } from "vitest/config";

// Tests for repo tooling under scripts/, plus the routing evals under evals/.
// Package-level tests run via `turbo run test`; this is a separate root-level
// suite.
//
// evals/ is included here rather than given its own runner because the evals
// (#205) read or boot servers through scripts/lib/boot-server.mjs and the fleet
// snapshot, exactly as the other root-level suites do — a second config would
// duplicate that wiring for no benefit. Model-based cross-server evals (#205 Part 2) cost model calls and
// belong on a schedule, so they must NOT be added to this include.
export default defineConfig({
  test: {
    include: ["scripts/**/*.test.mjs", "evals/**/*.test.mjs"],
    // Boots every server once and hands the result to every test file, instead
    // of each file booting its own (scripts/lib/fleet-snapshot.mjs).
    globalSetup: ["scripts/lib/fleet-snapshot-global-setup.mjs"],
    // Four suites still boot servers of their own (see scripts/README.md), and
    // a boot imports a server's whole dist graph: about 2s alone, but several
    // seconds when vitest runs the files in parallel. Under that load it
    // regularly passed the 5s default (the failures moved between runs and
    // files, and passed when run alone), hence the longer limits.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
