import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-non-null-assertion": "warn",
    },
  },
  {
    // contract-hash's cross-repo golden vectors deliberately include a number
    // above 2^53 (9007199254740993) to pin how the canonical hash encodes it;
    // it must stay byte-identical with the governance repo, so the literal is
    // exempted here rather than edited (editing contract-hash src also trips
    // the contract-version guard).
    files: ["**/contract-hash/src/cross-repo-golden.ts"],
    rules: { "no-loss-of-precision": "off" },
  },
  {
    // Generated from vendor specs (Discovery / OpenAPI); vendor description
    // text carries characters like zero-width spaces. Regenerate, don't hand-edit.
    ignores: ["dist/**", "build/**", "node_modules/**", "*.config.js", "**/src/generated/**"],
  }
);
