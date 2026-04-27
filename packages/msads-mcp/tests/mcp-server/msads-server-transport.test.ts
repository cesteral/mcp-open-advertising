import { describe, it, expect, vi } from "vitest";

// Mock config to avoid env var requirements at import time
vi.mock("../../src/config/index.js", () => ({
  mcpConfig: {
    serviceName: "msads-mcp",
    port: 3013,
    host: "0.0.0.0",
    otelServiceName: "msads-mcp",
    mcpAuthMode: "none",
    msadsCampaignApiBaseUrl: "https://campaign.api.bingads.microsoft.com/CampaignManagement/v13",
    msadsReportingApiBaseUrl: "https://reporting.api.bingads.microsoft.com/Reporting/v13",
    msadsCustomerApiBaseUrl:
      "https://clientcenter.api.bingads.microsoft.com/CustomerManagement/v13",
    msadsRateLimitPerMinute: 100,
    msadsReportPollIntervalMs: 3000,
    msadsReportMaxPollAttempts: 30,
  },
  appConfig: {
    serviceName: "msads-mcp",
    port: 3013,
  },
}));

vi.mock("../../src/utils/security/rate-limiter.js", () => ({
  rateLimiter: {
    consume: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
  },
  RateLimiter: vi.fn(),
}));

// Mock the resources module to avoid createToolExamplesResource calling into shared at import time
vi.mock("../../src/mcp-server/resources/index.js", () => ({
  allResources: [],
}));

describe("msads-mcp server", () => {
  // Dynamic imports pull in the whole telemetry/Zod/pino graph through
  // vitest's transform pipeline; under heavy parallel test load this can
  // exceed 15s on some machines. 60s gives the transformer headroom.
  it("can import createMcpServer", async () => {
    const { createMcpServer } = await import("../../src/mcp-server/server.js");
    expect(createMcpServer).toBeTypeOf("function");
  }, 60_000);

  it("can import runStdioServer", async () => {
    const { runStdioServer } = await import("../../src/mcp-server/server.js");
    expect(runStdioServer).toBeTypeOf("function");
  }, 60_000);

  it("can import transport functions", async () => {
    const { createMcpHttpServer, startHttpServer } = await import(
      "../../src/mcp-server/transports/streamable-http-transport.js"
    );
    expect(createMcpHttpServer).toBeTypeOf("function");
    expect(startHttpServer).toBeTypeOf("function");
  }, 60_000);
});
