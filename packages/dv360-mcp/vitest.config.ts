import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/index.ts", "src/config/**", "dist/**", "generated/**"],
      thresholds: { lines: 65, branches: 80, functions: 55, statements: 65 },
    },
  },
});
