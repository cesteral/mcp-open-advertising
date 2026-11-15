// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describeServerCard } from "@cesteral/shared/testkit";
import { createMcpHttpServer } from "../../src/mcp-server/transports/streamable-http-transport.js";

describeServerCard({
  packageName: "meta-mcp",
  createServer: createMcpHttpServer,
  platformConfig: {
    port: 3005,
    metaApiBaseUrl: "https://graph.facebook.com/v26.0",
    metaApiVersion: "v26.0",
  },
});
