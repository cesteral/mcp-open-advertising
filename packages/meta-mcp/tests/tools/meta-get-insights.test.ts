import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted() ensures these are available when vi.mock factories run
// ---------------------------------------------------------------------------

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import {
  getInsightsLogic,
  getInsightsResponseFormatter,
  GetInsightsInputSchema,
} from "../../src/mcp-server/tools/definitions/get-insights.tool.js";

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getInsightsLogic", () => {
  let mockMetaInsightsService: { getInsights: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    mockMetaInsightsService = {
      getInsights: vi.fn().mockResolvedValue({
        data: [{ impressions: "100", clicks: "10", spend: "5.00" }],
        nextCursor: undefined,
        summary: { impressions: "100" },
      }),
    };

    mockResolveSessionServices.mockReturnValue({
      metaInsightsService: mockMetaInsightsService,
    });
  });

  it("returns insights data with correct structure", async () => {
    const result = await getInsightsLogic(
      { entityId: "123456789" },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.mode).toBe("summary");
    expect(result.previewRows).toHaveLength(1);
    expect(result.previewRows?.[0]).toEqual({ impressions: "100", clicks: "10", spend: "5.00" });
    expect(result.totalCount).toBe(1);
    expect(result.returnedRows).toBe(1);
    expect(result.summary).toEqual({ impressions: "100" });
    expect(result.nextCursor).toBeUndefined();
    expect(result.timestamp).toBeDefined();
  });

  it("passes options to service", async () => {
    await getInsightsLogic(
      {
        entityId: "123",
        fields: ["impressions", "clicks"],
        datePreset: "last_7d",
        timeIncrement: "1",
        level: "campaign",
        limit: 100,
        after: "cursor_abc",
      },
      createMockContext(),
      createMockSdkContext()
    );

    expect(mockMetaInsightsService.getInsights).toHaveBeenCalledOnce();
    const [entityId, options] = mockMetaInsightsService.getInsights.mock.calls[0];
    expect(entityId).toBe("123");
    expect(options.fields).toEqual(["impressions", "clicks"]);
    expect(options.datePreset).toBe("last_7d");
    expect(options.timeIncrement).toBe("1");
    expect(options.level).toBe("campaign");
    expect(options.limit).toBe(100);
    expect(options.after).toBe("cursor_abc");
  });

  it("passes custom timeRange to service", async () => {
    await getInsightsLogic(
      {
        entityId: "123",
        timeRange: { since: "2026-01-01", until: "2026-01-31" },
      },
      createMockContext(),
      createMockSdkContext()
    );

    const [, options] = mockMetaInsightsService.getInsights.mock.calls[0];
    expect(options.timeRange).toEqual({ since: "2026-01-01", until: "2026-01-31" });
  });

  it("returns nextCursor when present", async () => {
    mockMetaInsightsService.getInsights.mockResolvedValue({
      data: [{ impressions: "50" }],
      nextCursor: "next_page_cursor",
      summary: undefined,
    });

    const result = await getInsightsLogic(
      { entityId: "123" },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.nextCursor).toBe("next_page_cursor");
  });

  it("throws when resolveSessionServices fails (no session)", async () => {
    mockResolveSessionServices.mockImplementation(() => {
      throw new Error("No session ID available.");
    });

    await expect(
      getInsightsLogic({ entityId: "123" }, createMockContext(), undefined)
    ).rejects.toThrow("No session ID available.");
  });
});

describe("getInsightsResponseFormatter", () => {
  function baseResult(overrides: Partial<any> = {}) {
    return {
      totalRows: 1,
      returnedRows: 1,
      truncated: false,
      nextOffset: null,
      headers: ["impressions"],
      selectedColumns: ["impressions"],
      mode: "summary" as const,
      previewRows: [{ impressions: "100" }],
      warnings: [],
      totalCount: 1,
      has_more: false,
      timestamp: new Date().toISOString(),
      ...overrides,
    };
  }

  it("shows insight row count", () => {
    const content = getInsightsResponseFormatter(baseResult());

    expect(content).toHaveLength(1);
    expect((content[0] as any).type).toBe("text");
    expect((content[0] as any).text).toContain("Retrieved 1 insight row(s)");
  });

  it("shows zero-row summary when empty", () => {
    const content = getInsightsResponseFormatter(
      baseResult({ totalRows: 0, returnedRows: 0, previewRows: [], totalCount: 0 })
    );

    expect((content[0] as any).text).toContain("Retrieved 0 insight row(s)");
  });

  it("shows cursor when present", () => {
    const content = getInsightsResponseFormatter(
      baseResult({ nextCursor: "next_cursor_123", has_more: true })
    );

    expect((content[0] as any).text).toContain("More results available");
    expect((content[0] as any).text).toContain("next_cursor_123");
  });

  it("does not show pagination info when no cursor", () => {
    const content = getInsightsResponseFormatter(baseResult());

    expect((content[0] as any).text).not.toContain("More results available");
  });
});

describe("GetInsightsInputSchema validation", () => {
  it("requires entityId", () => {
    const result = GetInsightsInputSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("entityId"))).toBe(true);
    }
  });

  it("rejects empty entityId", () => {
    const result = GetInsightsInputSchema.safeParse({
      entityId: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts minimal valid input", () => {
    const result = GetInsightsInputSchema.safeParse({
      entityId: "123456789",
    });
    expect(result.success).toBe(true);
  });

  it("accepts full input with all optional fields", () => {
    const result = GetInsightsInputSchema.safeParse({
      entityId: "act_123456789",
      fields: ["impressions", "clicks", "spend"],
      datePreset: "last_7d",
      timeIncrement: "1",
      level: "campaign",
      limit: 100,
      after: "cursor",
    });
    expect(result.success).toBe(true);
  });

  it("accepts input with custom timeRange", () => {
    const result = GetInsightsInputSchema.safeParse({
      entityId: "123",
      timeRange: { since: "2026-01-01", until: "2026-01-31" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects limit above 500", () => {
    const result = GetInsightsInputSchema.safeParse({
      entityId: "123",
      limit: 501,
    });
    expect(result.success).toBe(false);
  });
});
