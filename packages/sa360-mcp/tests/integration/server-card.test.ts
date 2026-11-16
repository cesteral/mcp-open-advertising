// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describeServerCard } from "@cesteral/shared/testkit";
import { createMcpHttpServer } from "../../src/mcp-server/transports/streamable-http-transport.js";

describeServerCard({
  packageName: "sa360-mcp",
  createServer: createMcpHttpServer,
  platformConfig: {
    port: 3010,
    sa360ApiBaseUrl: "https://searchads360.googleapis.com/v0",
    sa360V2ApiBaseUrl: "https://www.googleapis.com/doubleclicksearch/v2",
  },
});
