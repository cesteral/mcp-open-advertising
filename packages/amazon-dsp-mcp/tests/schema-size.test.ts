// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { assertSchemaSizesUnderLimit } from "@cesteral/shared";
import { allTools } from "../src/mcp-server/tools/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, "..");

describe("schema size guard", () => {
  it("each tool inputSchema stays under the per-tool limit and the aggregate stays under the stdio safety limit", () => {
    assertSchemaSizesUnderLimit(allTools);
  });
});

// Budget check on the generator output. A regression here usually means the
// schema-extraction root-set in config/v1-schema-extraction.config.ts widened
// (more ops or a fatter transitive closure) — investigate before bumping the
// budget. Files are committed alongside the source, so this runs in CI without
// re-running the generator.
describe("v1 generated schema size budget", () => {
  const BUDGET_BYTES = 200 * 1024; // 200 KB per file

  it.each([
    ["src/generated/v1/types.ts", BUDGET_BYTES],
    ["src/generated/v1/zod.ts", BUDGET_BYTES],
  ])("%s stays under the %d-byte budget", async (relPath, budget) => {
    const abs = path.resolve(PACKAGE_ROOT, relPath);
    const stat = await fs.stat(abs);
    expect(stat.size, `${relPath} is ${stat.size} bytes (budget ${budget})`).toBeLessThan(budget);
  });
});
