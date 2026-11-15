// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describeCrossServerContract } from "@cesteral/shared/testkit";
import { allTools } from "../src/mcp-server/tools/definitions/index.js";

describeCrossServerContract({
  tools: allTools,
  prefix: "sa360_",
  requiredTools: [
    "list_entities",
    "get_entity",
    "list_accounts",
    "gaql_search",
    "insert_conversions",
    "validate_conversion",
  ],
  // SA360 is read-only for entities: no create/update/delete/bulk tools.
});
