// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describeServerCard } from "@cesteral/shared/testkit";
import { createMcpHttpServer } from "../../src/mcp-server/transports/streamable-http-transport.js";

describeServerCard({
  packageName: "snapchat-mcp",
  createServer: createMcpHttpServer,
  platformConfig: {
    port: 3009,
    snapchatApiBaseUrl: "https://adsapi.snapchat.com",
  },
});
