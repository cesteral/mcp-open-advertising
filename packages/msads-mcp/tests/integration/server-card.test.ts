// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describeServerCard } from "@cesteral/shared/testkit";
import { createMcpHttpServer } from "../../src/mcp-server/transports/streamable-http-transport.js";

describeServerCard({
  packageName: "msads-mcp",
  createServer: createMcpHttpServer,
  platformConfig: {
    port: 3013,
    msadsCampaignApiBaseUrl: "https://campaign.api.bingads.microsoft.com",
    msadsReportingApiBaseUrl: "https://reporting.api.bingads.microsoft.com",
    msadsCustomerApiBaseUrl: "https://clientcenter.api.bingads.microsoft.com",
  },
});
