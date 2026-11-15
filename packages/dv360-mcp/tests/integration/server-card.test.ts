// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describeServerCard } from "@cesteral/shared/testkit";
import { createMcpHttpServer } from "../../src/mcp-server/transports/streamable-http-transport.js";

describeServerCard({
  packageName: "dv360-mcp",
  createServer: createMcpHttpServer,
  platformConfig: {
    port: 3002,
    dv360ApiBaseUrl: "https://displayvideo.googleapis.com/v4",
  },
  // Fleet review dv360 #18: every tool that can set ENTITY_STATUS_ARCHIVED is
  // terminal for that value, bulk_update_entities included.
  terminalTools: ["dv360_update_entity", "dv360_bulk_update_status", "dv360_bulk_update_entities"],
});
