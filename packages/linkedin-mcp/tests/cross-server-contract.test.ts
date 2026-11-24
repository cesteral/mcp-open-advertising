// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { ENTITY_CRUD_TOOLS, describeCrossServerContract } from "@cesteral/shared/testkit";
import { allTools } from "../src/mcp-server/tools/definitions/index.js";

describeCrossServerContract({
  tools: allTools,
  prefix: "linkedin_",
  requiredTools: [...ENTITY_CRUD_TOOLS, "list_ad_accounts"],
  destructiveTools: ["update_entity", "delete_entity", "bulk_update_status"],
});
