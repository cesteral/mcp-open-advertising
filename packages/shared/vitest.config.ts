import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/index.ts", "src/config/**", "dist/**"],
      thresholds: { lines: 70, branches: 60, functions: 70, statements: 70 },
    },
  },
});
