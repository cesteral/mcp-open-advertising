// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it } from "vitest";
import { assertSchemaSizesUnderLimit } from "@cesteral/shared";
import { allTools } from "../src/mcp-server/tools/index.js";

describe("schema size guard", () => {
  it("each tool inputSchema stays under the per-tool limit and the aggregate stays under the stdio safety limit", () => {
    assertSchemaSizesUnderLimit(allTools);
  });
});
