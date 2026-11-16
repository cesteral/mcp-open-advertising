// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describeCrossServerContract } from "@cesteral/shared/testkit";
import { allTools } from "../src/mcp-server/tools/index.js";

describeCrossServerContract({
  tools: allTools,
  prefix: "amazon_dsp_",
  requiredTools: [
    "list_entities",
    "get_entity",
    "create_entity",
    "update_entity",
    "delete_entity",
    "list_advertisers",
    "validate_entity",
    "get_ad_preview",
  ],
});
