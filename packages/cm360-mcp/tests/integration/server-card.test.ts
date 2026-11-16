// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describeServerCard } from "@cesteral/shared/testkit";
import { createMcpHttpServer } from "../../src/mcp-server/transports/streamable-http-transport.js";

describeServerCard({
  packageName: "cm360-mcp",
  createServer: createMcpHttpServer,
  platformConfig: {
    port: 3008,
    cm360ApiBaseUrl: "https://dfareporting.googleapis.com/dfareporting/v5",
  },
  // Every tool that can write PLACEMENT_STATUS_PERMANENTLY_ARCHIVED is terminal
  // for that value: update_entity and bulk_update_entities (both PATCH arbitrary
  // fields) and bulk_update_status (#237 triage).
  terminalTools: ["cm360_update_entity", "cm360_bulk_update_entities", "cm360_bulk_update_status"],
});
