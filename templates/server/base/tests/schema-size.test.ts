// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describeSchemaSizeGuard } from "@cesteral/shared/testkit";
import { allTools } from "../src/mcp-server/tools/index.js";

describeSchemaSizeGuard(allTools);
