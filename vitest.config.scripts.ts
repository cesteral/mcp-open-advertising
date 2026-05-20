import { defineConfig } from "vitest/config";

// Tests for repo tooling under scripts/. Package-level tests run via
// `turbo run test`; this is a separate root-level suite.
export default defineConfig({
  test: {
    include: ["scripts/**/*.test.mjs"],
  },
});
