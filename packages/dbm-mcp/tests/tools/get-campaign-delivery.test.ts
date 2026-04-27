import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted() ensures these are available when vi.mock factories run
// ---------------------------------------------------------------------------

const { mockResolveSessionServices, mockCalculateCTR, mockCalculateCPM, mockFormatMetricValue } =
  vi.hoisted(() => ({
    mockResolveSessionServices: vi.fn(),
    mockCalculateCTR: vi.fn().mockReturnValue(2.0),
    mockCalculateCPM: vi.fn().mockReturnValue(50.0),
    mockFormatMetricValue: vi.fn().mockImplementation((_type: string, val: number) => {
      if (_type === "ctr") return `${val.toFixed(2)}%`;
      if (_type === "cpm") return `$${val.toFixed(2)}`;
      return val.toFixed(2);
    }),
  }));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

vi.mock("../../src/utils/metrics.js", () => ({
  calculateCTR: mockCalculateCTR,
  calculateCPM: mockCalculateCPM,
  formatMetricValue: mockFormatMetricValue,
}));

import {
  getCampaignDeliveryLogic,
  getCampaignDeliveryResponseFormatter,
  type GetCampaignDeliveryInput,
  type GetCampaignDeliveryOutput,
} from "../../src/mcp-server/tools/definitions/get-campaign-delivery.tool.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockContext() {
  return {
    requestId: "req-123",
    timestamp: new Date().toISOString(),
    operation: "test",
  } as any;
}

function createMockSdkContext(sessionId = "session-123") {
  return { sessionId } as any;
}

function createDefaultInput(): GetCampaignDeliveryInput {
  return {
    advertiserId: "adv-001",
    campaignId: "camp-001",
    startDate: "2025-01-01",
    endDate: "2025-01-31",
  };
}

function createMockDeliveryMetrics() {
  return {
    impressions: 100000,
    clicks: 2000,
    spend: 5000,
    conversions: 50,
    revenue: 15000,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getCampaignDeliveryLogic", () => {
  let mockBidManagerService: { getDeliveryMetrics: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    mockBidManagerService = {
      getDeliveryMetrics: vi.fn().mockResolvedValue(createMockDeliveryMetrics()),
    };

    mockResolveSessionServices.mockReturnValue({
      bidManagerService: mockBidManagerService,
    });
  });

  it("returns delivery metrics with correct structure", async () => {
    const input = createDefaultInput();
    const result = await getCampaignDeliveryLogic(
      input,
      createMockContext(),
      createMockSdkContext()
    );

    expect(result).toMatchObject({
      advertiserId: "adv-001",
      campaignId: "camp-001",
      dateRange: {
        startDate: "2025-01-01",
        endDate: "2025-01-31",
      },
      metrics: {
        impressions: 100000,
        clicks: 2000,
        spend: 5000,
        conversions: 50,
        revenue: 15000,
      },
    });
    expect(result.timestamp).toBeDefined();
    // Verify it's a valid ISO timestamp
    expect(() => new Date(result.timestamp)).not.toThrow();
  });

  it("passes correct params to bidManagerService.getDeliveryMetrics", async () => {
    const input = createDefaultInput();
    await getCampaignDeliveryLogic(input, createMockContext(), createMockSdkContext());

    expect(mockBidManagerService.getDeliveryMetrics).toHaveBeenCalledOnce();
    expect(mockBidManagerService.getDeliveryMetrics).toHaveBeenCalledWith({
      advertiserId: "adv-001",
      campaignId: "camp-001",
      startDate: "2025-01-01",
      endDate: "2025-01-31",
    });
  });

  it("throws when resolveSessionServices fails (no session)", async () => {
    mockResolveSessionServices.mockImplementation(() => {
      throw new Error(
        "No session ID available. Credentials must be provided via HTTP headers at connection time."
      );
    });

    await expect(
      getCampaignDeliveryLogic(createDefaultInput(), createMockContext(), undefined)
    ).rejects.toThrow("No session ID available");
  });

  it("throws when getDeliveryMetrics fails", async () => {
    mockBidManagerService.getDeliveryMetrics.mockRejectedValue(
      new Error("Bid Manager API error: 403 Forbidden")
    );

    await expect(
      getCampaignDeliveryLogic(createDefaultInput(), createMockContext(), createMockSdkContext())
    ).rejects.toThrow("Bid Manager API error: 403 Forbidden");
  });
});

describe("getCampaignDeliveryResponseFormatter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCalculateCTR.mockReturnValue(2.0);
    mockCalculateCPM.mockReturnValue(50.0);
    mockFormatMetricValue.mockImplementation((_type: string, val: number) => {
      if (_type === "ctr") return `${val.toFixed(2)}%`;
      if (_type === "cpm") return `$${val.toFixed(2)}`;
      return val.toFixed(2);
    });
  });

  it("includes CTR and CPM calculations", () => {
    const result: GetCampaignDeliveryOutput = {
      advertiserId: "adv-001",
      campaignId: "camp-001",
      dateRange: { startDate: "2025-01-01", endDate: "2025-01-31" },
      metrics: {
        impressions: 100000,
        clicks: 2000,
        spend: 5000,
        conversions: 50,
        revenue: 15000,
      },
      timestamp: new Date().toISOString(),
    };
    const input = createDefaultInput();

    getCampaignDeliveryResponseFormatter(result, input);

    // Verify CTR calculation was called with clicks and impressions
    expect(mockCalculateCTR).toHaveBeenCalledWith(2000, 100000);
    // Verify CPM calculation was called with spend and impressions
    expect(mockCalculateCPM).toHaveBeenCalledWith(5000, 100000);
    // Verify formatMetricValue was called for both
    expect(mockFormatMetricValue).toHaveBeenCalledWith("ctr", 2.0);
    expect(mockFormatMetricValue).toHaveBeenCalledWith("cpm", 50.0);
  });

  it("produces text content with correct structure", () => {
    const result: GetCampaignDeliveryOutput = {
      advertiserId: "adv-001",
      campaignId: "camp-001",
      dateRange: { startDate: "2025-01-01", endDate: "2025-01-31" },
      metrics: {
        impressions: 100000,
        clicks: 2000,
        spend: 5000,
        conversions: 50,
        revenue: 15000,
      },
      timestamp: new Date().toISOString(),
    };
    const input = createDefaultInput();

    const content = getCampaignDeliveryResponseFormatter(result, input);

    expect(content).toHaveLength(1);
    expect(content[0].type).toBe("text");
    expect(content[0].text).toContain("Campaign camp-001 Delivery");
    expect(content[0].text).toContain("2025-01-01 to 2025-01-31");
    expect(content[0].text).toContain("Impressions: 100,000");
    expect(content[0].text).toContain("Clicks: 2,000");
    expect(content[0].text).toContain("Spend: $5000.00");
    expect(content[0].text).toContain("Revenue: $15000.00");
    expect(content[0].text).toContain("Conversions: 50");
  });
});
