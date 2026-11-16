// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it } from "vitest";
import {
  assertSchemaSizesUnderLimit,
  type SchemaSizeGuardOptions,
  type SchemaSizeGuardTool,
} from "../utils/mcp/schema-size-guard.js";

/**
 * The per-server schema-size guard: every tool's `inputSchema` / `outputSchema`
 * stays under its per-tool limit and the aggregates stay under theirs. One call
 * per server, from `tests/schema-size.test.ts`.
 */
export function describeSchemaSizeGuard(
  tools: SchemaSizeGuardTool[],
  options?: SchemaSizeGuardOptions
): void {
  describe("schema size guard", () => {
    it("each tool inputSchema and outputSchema stays under its per-tool limit and the aggregates stay under their limits", () => {
      assertSchemaSizesUnderLimit(tools, options);
    });
  });
}
