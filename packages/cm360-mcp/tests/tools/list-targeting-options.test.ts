import { describe, it, expect, vi, beforeEach } from "vitest";

const mockState = vi.hoisted(() => ({
  cm360Service: {
    getEntity: vi.fn(),
    createEntity: vi.fn(),
    updateEntity: vi.fn(),
    deleteEntity: vi.fn(),
    listEntities: vi.fn(),
    listUserProfiles: vi.fn(),
    listTargetingOptions: vi.fn(),
  },
  cm360ReportingService: {
    runReport: vi.fn(),
    createReport: vi.fn(),
    checkReportFile: vi.fn(),
    downloadReportFile: vi.fn(),
  },
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: vi.fn(() => mockState),
}));

vi.mock("../../src/mcp-server/tools/utils/entity-mapping.js", () => ({
  getEntityTypeEnum: () => [
    "campaign",
    "placement",
    "ad",
    "creative",
    "site",
    "advertiser",
    "floodlightActivity",
    "floodlightConfiguration",
  ],
  getDeletableEntityTypeEnum: () => ["floodlightActivity"],
}));

import {
  listTargetingOptionsLogic,
  listTargetingOptionsResponseFormatter,
  ListTargetingOptionsInputSchema,
} from "../../src/mcp-server/tools/definitions/list-targeting-options.tool.js";

const mockContext = { requestId: "test-req" } as any;

describe("listTargetingOptionsLogic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns options array and totalCount matching length", async () => {
    const options = [
      { id: "1", name: "Chrome" },
      { id: "2", name: "Firefox" },
    ];
    mockState.cm360Service.listTargetingOptions.mockResolvedValue({ options });

    const result = await listTargetingOptionsLogic(
      { profileId: "123", targetingType: "browsers" },
      mockContext
    );

    expect(result.options).toEqual(options);
    expect(result.pagination.pageSize).toBe(2);
    expect(result.pagination.nextCursor).toBeNull();
    expect(result.pagination.nextPageInputKey).toBe("pageToken");
    expect(result.timestamp).toBeDefined();
  });

  it("passes through nextPageToken", async () => {
    mockState.cm360Service.listTargetingOptions.mockResolvedValue({
      options: [{ id: "1" }],
      nextPageToken: "abc123",
    });

    const result = await listTargetingOptionsLogic(
      { profileId: "123", targetingType: "countries" },
      mockContext
    );

    expect(result.pagination.nextCursor).toBe("abc123");
    expect(result.pagination.hasMore).toBe(true);
  });

  it("returns null nextCursor when no token present", async () => {
    mockState.cm360Service.listTargetingOptions.mockResolvedValue({
      options: [],
    });

    const result = await listTargetingOptionsLogic(
      { profileId: "123", targetingType: "languages" },
      mockContext
    );

    expect(result.pagination.nextCursor).toBeNull();
    expect(result.pagination.hasMore).toBe(false);
  });

  it("calls cm360Service.listTargetingOptions with all params", async () => {
    mockState.cm360Service.listTargetingOptions.mockResolvedValue({ options: [] });

    await listTargetingOptionsLogic(
      {
        profileId: "prof1",
        targetingType: "metros",
        filters: { countryDartIds: "2840" },
        pageToken: "token1",
        maxResults: 50,
      },
      mockContext
    );

    expect(mockState.cm360Service.listTargetingOptions).toHaveBeenCalledWith(
      "prof1",
      "metros",
      { countryDartIds: "2840" },
      "token1",
      50,
      mockContext
    );
  });

  it("propagates service errors", async () => {
    mockState.cm360Service.listTargetingOptions.mockRejectedValue(new Error("API error"));

    await expect(
      listTargetingOptionsLogic({ profileId: "123", targetingType: "browsers" }, mockContext)
    ).rejects.toThrow("API error");
  });
});

describe("listTargetingOptionsResponseFormatter", () => {
  function pagination(nextCursor: string | null, pageSize: number) {
    return {
      nextCursor,
      hasMore: nextCursor !== null,
      pageSize,
      nextPageInputKey: "pageToken",
    };
  }

  it("shows count and options", () => {
    const result = listTargetingOptionsResponseFormatter({
      options: [{ id: "1", name: "Chrome" }],
      pagination: pagination(null, 1),
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(result).toHaveLength(1);
    expect(result[0].text).toContain("Found 1 targeting options");
    expect(result[0].text).toContain("Chrome");
  });

  it("shows pagination hint when nextPageToken present", () => {
    const result = listTargetingOptionsResponseFormatter({
      options: [{ id: "1" }],
      pagination: pagination("next-page", 1),
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(result[0].text).toContain("More results available");
    expect(result[0].text).toContain("next-page");
    expect(result[0].text).toContain("pageToken");
  });

  it("shows 'No options found' when empty", () => {
    const result = listTargetingOptionsResponseFormatter({
      options: [],
      pagination: pagination(null, 0),
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(result[0].text).toContain("No options found");
  });
});

describe("ListTargetingOptionsInputSchema", () => {
  it("accepts all 13 targeting types", () => {
    const types = [
      "browsers",
      "connectionTypes",
      "contentCategories",
      "countries",
      "languages",
      "metros",
      "mobileCarriers",
      "operatingSystemVersions",
      "operatingSystems",
      "platformTypes",
      "postalCodes",
      "regions",
      "cities",
    ];

    for (const targetingType of types) {
      const result = ListTargetingOptionsInputSchema.safeParse({
        profileId: "123",
        targetingType,
      });
      expect(result.success, `Expected ${targetingType} to be valid`).toBe(true);
    }
  });

  it("rejects invalid targeting type", () => {
    const result = ListTargetingOptionsInputSchema.safeParse({
      profileId: "123",
      targetingType: "invalidType",
    });
    expect(result.success).toBe(false);
  });

  it("requires profileId and targetingType", () => {
    expect(ListTargetingOptionsInputSchema.safeParse({}).success).toBe(false);
    expect(ListTargetingOptionsInputSchema.safeParse({ profileId: "123" }).success).toBe(false);
    expect(ListTargetingOptionsInputSchema.safeParse({ targetingType: "browsers" }).success).toBe(
      false
    );
  });

  it("accepts optional filters, pageToken, maxResults", () => {
    const result = ListTargetingOptionsInputSchema.safeParse({
      profileId: "123",
      targetingType: "metros",
      filters: { countryDartIds: "2840" },
      pageToken: "abc",
      maxResults: 100,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filters).toEqual({ countryDartIds: "2840" });
      expect(result.data.pageToken).toBe("abc");
      expect(result.data.maxResults).toBe(100);
    }
  });
});
