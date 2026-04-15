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

  // ── Date range validation ──

  it("accepts preset dateRange", () => {
    const result = GetInsightsInputSchema.safeParse({
      customerId: "1234567890",
      entityType: "campaign",
      dateRange: "LAST_30_DAYS",
    });
    expect(result.success).toBe(true);
  });

  it("accepts custom startDate + endDate", () => {
    const result = GetInsightsInputSchema.safeParse({
      customerId: "1234567890",
      entityType: "campaign",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
    expect(result.success).toBe(true);
  });

  it("rejects both dateRange and custom dates", () => {
    const result = GetInsightsInputSchema.safeParse({
      customerId: "1234567890",
      entityType: "campaign",
      dateRange: "LAST_30_DAYS",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
    expect(result.success).toBe(false);
  });

  it("rejects neither dateRange nor custom dates", () => {
    const result = GetInsightsInputSchema.safeParse({
      customerId: "1234567890",
      entityType: "campaign",
    });
    expect(result.success).toBe(false);
  });

  it("rejects startDate without endDate", () => {
    const result = GetInsightsInputSchema.safeParse({
      customerId: "1234567890",
      entityType: "campaign",
      startDate: "2026-01-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects endDate without startDate", () => {
    const result = GetInsightsInputSchema.safeParse({
      customerId: "1234567890",
      entityType: "campaign",
      endDate: "2026-01-31",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid date format", () => {
    const result = GetInsightsInputSchema.safeParse({
      customerId: "1234567890",
      entityType: "campaign",
      startDate: "01/01/2026",
      endDate: "01/31/2026",
    });
    expect(result.success).toBe(false);
  });

  // ── Entity ID validation ──

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

  // ── Metrics validation ──

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

  // ── Computed metrics ──

  it("accepts includeComputedMetrics flag", () => {
    const result = GetInsightsInputSchema.safeParse({
      customerId: "1234567890",
      entityType: "campaign",
      dateRange: "LAST_30_DAYS",
      includeComputedMetrics: true,
    });
    expect(result.success).toBe(true);
  });

  it("adds computedMetrics to results when includeComputedMetrics=true", async () => {
    mockGaqlSearch.mockResolvedValue({
      results: [
        {
          campaign: { id: "1", name: "Test" },
          metrics: {
            cost_micros: "5000000",
            conversions: "10",
            conversions_value: "100",
            impressions: "1000",
          },
        },
      ],
    });

    const output = await getInsightsLogic(
      {
        customerId: "1234567890",
        entityType: "campaign",
        dateRange: "LAST_30_DAYS",
        includeComputedMetrics: true,
        limit: 50,
      } as any,
      {} as any,
      { sessionId: "test-session" } as any
    );

    const firstRow = output.previewRows?.[0] as any;
    expect(firstRow).toHaveProperty("computedMetrics");
    expect(firstRow.computedMetrics.cpa).toBe(0.5);
    expect(firstRow.computedMetrics.roas).toBe(20);
    expect(firstRow.computedMetrics.cpm).toBe(5);
  });

  it("does not add computedMetrics when includeComputedMetrics=false", async () => {
    mockGaqlSearch.mockResolvedValue({
      results: [
        {
          campaign: { id: "1", name: "Test" },
          metrics: { cost_micros: "5000000" },
        },
      ],
    });

    const output = await getInsightsLogic(
      {
        customerId: "1234567890",
        entityType: "campaign",
        dateRange: "LAST_30_DAYS",
        includeComputedMetrics: false,
        limit: 50,
      } as any,
      {} as any,
      { sessionId: "test-session" } as any
    );

    expect(output.previewRows?.[0]).not.toHaveProperty("computedMetrics");
  });

  it("uses BETWEEN clause for custom date range", async () => {
    mockGaqlSearch.mockResolvedValue({ results: [] });

    await getInsightsLogic(
      {
        customerId: "1234567890",
        entityType: "campaign",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        limit: 50,
      } as any,
      {} as any,
      { sessionId: "test-session" } as any
    );

    const calledQuery = mockGaqlSearch.mock.calls[0][1] as string;
    expect(calledQuery).toContain("BETWEEN '2026-01-01' AND '2026-01-31'");
  });
});
