// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describeCrossServerContract } from "@cesteral/shared/testkit";
import { allTools } from "../src/mcp-server/tools/definitions/index.js";

describeCrossServerContract({
  tools: allTools,
  prefix: "cm360_",
  requiredTools: [
    "list_entities",
    "get_entity",
    "create_entity",
    "update_entity",
    "delete_entity",
    "bulk_update_status",
    "validate_entity",
  ],
});
