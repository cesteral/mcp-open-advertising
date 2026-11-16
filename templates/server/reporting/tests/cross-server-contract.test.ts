// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describeCrossServerContract } from "@cesteral/shared/testkit";
import { allTools } from "../src/mcp-server/tools/index.js";

describeCrossServerContract({
  tools: allTools,
  prefix: "{{key}}_",
  requiredTools: ["list_accounts", "get_report", "get_pacing_status"],
});
