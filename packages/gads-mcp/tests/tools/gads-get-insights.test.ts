import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices, mockGaqlSearch } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
  mockGaqlSearch: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import {
  GetInsightsInputSchema,
  getInsightsLogic,
} from "../../src/mcp-server/tools/definitions/get-insights.tool.js";

describe("gads_get_insights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveSessionServices.mockReturnValue({
      gadsService: {
        gaqlSearch: mockGaqlSearch.mockResolvedValue({ results: [] }),
      },
    });
  });

  it("accepts numeric entityId", () => {
    const result = GetInsightsInputSchema.safeParse({
      customerId: "1234567890",
      entityType: "campaign",
      dateRange: "LAST_30_DAYS",
      entityId: "987654321",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-numeric entityId at schema level", () => {
    const invalidIds = ["abc", "1 OR 1=1", "123;DROP", "123-456"];
    for (const entityId of invalidIds) {
      const result = GetInsightsInputSchema.safeParse({
        customerId: "1234567890",
        entityType: "campaign",
        dateRange: "LAST_30_DAYS",
        entityId,
      });
      expect(result.success, `expected "${entityId}" to be rejected`).toBe(false);
    }
  });

  it("rejects non-numeric entityId at runtime when logic is called directly", async () => {
    await expect(
      getInsightsLogic(
        {
          customerId: "1234567890",
          entityType: "campaign",
          dateRange: "LAST_30_DAYS",
          entityId: "1 OR 1=1",
        } as any,
        {} as any,
        { sessionId: "test-session" } as any
      )
    ).rejects.toThrow("entityId must be numeric");
  });

  it("rejects non-numeric customerId at schema level", () => {
    const invalidCustomerIds = ["123-456", "abc"];
    for (const customerId of invalidCustomerIds) {
      const result = GetInsightsInputSchema.safeParse({
        customerId,
        entityType: "campaign",
        dateRange: "LAST_30_DAYS",
      });
      expect(result.success, `expected "${customerId}" to be rejected`).toBe(false);
    }
  });

  it("accepts safe metrics names at schema level", () => {
    const result = GetInsightsInputSchema.safeParse({
      customerId: "1234567890",
      entityType: "campaign",
      dateRange: "LAST_30_DAYS",
      metrics: ["clicks", "metrics.impressions"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects unsafe metrics at schema level", () => {
    const invalidMetrics = [
      "metrics.clicks FROM campaign",
      "metrics.clicks,segments.date",
      "metrics.clicks;DROP",
    ];
    for (const metric of invalidMetrics) {
      const result = GetInsightsInputSchema.safeParse({
        customerId: "1234567890",
        entityType: "campaign",
        dateRange: "LAST_30_DAYS",
        metrics: [metric],
      });
      expect(result.success, `expected metric "${metric}" to be rejected`).toBe(false);
    }
  });

  it("rejects invalid metric names at runtime when logic is called directly", async () => {
    await expect(
      getInsightsLogic(
        {
          customerId: "1234567890",
          entityType: "campaign",
          dateRange: "LAST_30_DAYS",
          metrics: ["metrics.clicks FROM campaign"],
        } as any,
        {} as any,
        { sessionId: "test-session" } as any
      )
    ).rejects.toThrow("Invalid metric name: metrics.clicks FROM campaign");
  });
});
