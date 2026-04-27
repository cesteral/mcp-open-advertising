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
  searchTargetingLogic,
  searchTargetingResponseFormatter,
  SearchTargetingInputSchema,
} from "../../src/mcp-server/tools/definitions/search-targeting.tool.js";

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

describe("searchTargetingLogic", () => {
  let mockMetaTargetingService: { searchTargeting: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    mockMetaTargetingService = {
      searchTargeting: vi.fn().mockResolvedValue({
        data: [
          { id: "6003139266461", name: "Running", audience_size_lower_bound: 1000000 },
          { id: "6003107902433", name: "Marathon", audience_size_lower_bound: 500000 },
        ],
      }),
    };

    mockResolveSessionServices.mockReturnValue({
      metaTargetingService: mockMetaTargetingService,
    });
  });

  it("returns targeting options with correct structure", async () => {
    const result = await searchTargetingLogic(
      { type: "adinterest", query: "running" },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toEqual({
      id: "6003139266461",
      name: "Running",
      audience_size_lower_bound: 1000000,
    });
    expect(result.totalCount).toBe(2);
    expect(result.timestamp).toBeDefined();
  });

  it("passes type and query to service", async () => {
    await searchTargetingLogic(
      { type: "adgeolocation", query: "New York" },
      createMockContext(),
      createMockSdkContext()
    );

    expect(mockMetaTargetingService.searchTargeting).toHaveBeenCalledOnce();
    const [type, query] = mockMetaTargetingService.searchTargeting.mock.calls[0];
    expect(type).toBe("adgeolocation");
    expect(query).toBe("New York");
  });

  it("passes optional limit to service", async () => {
    await searchTargetingLogic(
      { type: "adinterest", query: "fitness", limit: 10 },
      createMockContext(),
      createMockSdkContext()
    );

    const [, , limit] = mockMetaTargetingService.searchTargeting.mock.calls[0];
    expect(limit).toBe(10);
  });

  it("handles empty results", async () => {
    mockMetaTargetingService.searchTargeting.mockResolvedValue({ data: [] });

    const result = await searchTargetingLogic(
      { type: "adinterest", query: "xyznonexistent" },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.results).toHaveLength(0);
    expect(result.totalCount).toBe(0);
  });

  it("handles response with no data key", async () => {
    mockMetaTargetingService.searchTargeting.mockResolvedValue({});

    const result = await searchTargetingLogic(
      { type: "adinterest", query: "test" },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.results).toHaveLength(0);
    expect(result.totalCount).toBe(0);
  });

  it("throws when resolveSessionServices fails (no session)", async () => {
    mockResolveSessionServices.mockImplementation(() => {
      throw new Error("No session ID available.");
    });

    await expect(
      searchTargetingLogic({ type: "adinterest", query: "running" }, createMockContext(), undefined)
    ).rejects.toThrow("No session ID available.");
  });
});

describe("searchTargetingResponseFormatter", () => {
  it("shows targeting option count", () => {
    const result = {
      results: [
        { id: "1", name: "Running" },
        { id: "2", name: "Marathon" },
      ],
      totalCount: 2,
      timestamp: new Date().toISOString(),
    };

    const content = searchTargetingResponseFormatter(result);

    expect(content).toHaveLength(1);
    expect((content[0] as any).type).toBe("text");
    expect((content[0] as any).text).toContain("Found 2 targeting option(s)");
  });

  it("shows 'No matching targeting options' when empty", () => {
    const result = {
      results: [],
      totalCount: 0,
      timestamp: new Date().toISOString(),
    };

    const content = searchTargetingResponseFormatter(result);

    expect((content[0] as any).text).toContain("No matching targeting options found");
  });
});

describe("SearchTargetingInputSchema validation", () => {
  it("requires type", () => {
    const result = SearchTargetingInputSchema.safeParse({
      query: "running",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("type"))).toBe(true);
    }
  });

  it("requires query", () => {
    const result = SearchTargetingInputSchema.safeParse({
      type: "adinterest",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("query"))).toBe(true);
    }
  });

  it("rejects empty query", () => {
    const result = SearchTargetingInputSchema.safeParse({
      type: "adinterest",
      query: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid input", () => {
    const result = SearchTargetingInputSchema.safeParse({
      type: "adinterest",
      query: "running shoes",
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional limit", () => {
    const result = SearchTargetingInputSchema.safeParse({
      type: "adgeolocation",
      query: "New York",
      limit: 10,
    });
    expect(result.success).toBe(true);
  });

  it("rejects limit above 100", () => {
    const result = SearchTargetingInputSchema.safeParse({
      type: "adinterest",
      query: "running",
      limit: 101,
    });
    expect(result.success).toBe(false);
  });
});
