// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describeServerCard } from "@cesteral/shared/testkit";
import { createMcpHttpServer } from "../../src/mcp-server/transports/streamable-http-transport.js";

describeServerCard({
  packageName: "gads-mcp",
  createServer: createMcpHttpServer,
  platformConfig: {
    port: 3004,
    gadsApiBaseUrl: "https://googleads.googleapis.com/v26",
  },
  // Fleet review gads #8: every tool that can remove an entity (a REMOVED
  // status or a `remove` operation) is declared terminal, bulk_mutate included.
  terminalTools: [
    "gads_remove_entity",
    "gads_update_entity",
    "gads_bulk_update_status",
    "gads_bulk_mutate",
  ],
});
