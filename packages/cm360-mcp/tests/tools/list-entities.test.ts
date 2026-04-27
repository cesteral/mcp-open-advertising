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
  ListEntitiesInputSchema,
  listEntitiesLogic,
  listEntitiesResponseFormatter,
} from "../../src/mcp-server/tools/definitions/list-entities.tool.js";

const mockContext = { requestId: "test-req" } as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ListEntitiesInputSchema", () => {
  it("accepts valid input with required fields", () => {
    const result = ListEntitiesInputSchema.safeParse({
      profileId: "123456",
      entityType: "campaign",
    });
    expect(result.success).toBe(true);
  });

  it("accepts all supported entity types", () => {
    const types = [
      "campaign",
      "placement",
      "ad",
      "creative",
      "site",
      "advertiser",
      "floodlightActivity",
      "floodlightConfiguration",
    ];

    for (const entityType of types) {
      const result = ListEntitiesInputSchema.safeParse({
        profileId: "123456",
        entityType,
      });
      expect(result.success, `Expected ${entityType} to be valid`).toBe(true);
    }
  });

  it("rejects invalid entity type", () => {
    const result = ListEntitiesInputSchema.safeParse({
      profileId: "123456",
      entityType: "invalidType",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty profileId", () => {
    const result = ListEntitiesInputSchema.safeParse({
      profileId: "",
      entityType: "campaign",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing profileId", () => {
    const result = ListEntitiesInputSchema.safeParse({
      entityType: "campaign",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing entityType", () => {
    const result = ListEntitiesInputSchema.safeParse({
      profileId: "123456",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional filters", () => {
    const result = ListEntitiesInputSchema.safeParse({
      profileId: "123456",
      entityType: "campaign",
      filters: { advertiserId: "789", searchString: "test" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filters).toEqual({ advertiserId: "789", searchString: "test" });
    }
  });

  it("accepts optional pageToken", () => {
    const result = ListEntitiesInputSchema.safeParse({
      profileId: "123456",
      entityType: "campaign",
      pageToken: "abc123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pageToken).toBe("abc123");
    }
  });

  it("accepts optional maxResults within range", () => {
    const result = ListEntitiesInputSchema.safeParse({
      profileId: "123456",
      entityType: "campaign",
      maxResults: 50,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxResults).toBe(50);
    }
  });

  it("rejects maxResults below 1", () => {
    const result = ListEntitiesInputSchema.safeParse({
      profileId: "123456",
      entityType: "campaign",
      maxResults: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects maxResults above 1000", () => {
    const result = ListEntitiesInputSchema.safeParse({
      profileId: "123456",
      entityType: "campaign",
      maxResults: 1001,
    });
    expect(result.success).toBe(false);
  });

  it("accepts maxResults at boundaries (1 and 1000)", () => {
    const min = ListEntitiesInputSchema.safeParse({
      profileId: "123456",
      entityType: "campaign",
      maxResults: 1,
    });
    expect(min.success).toBe(true);

    const max = ListEntitiesInputSchema.safeParse({
      profileId: "123456",
      entityType: "campaign",
      maxResults: 1000,
    });
    expect(max.success).toBe(true);
  });
});

describe("listEntitiesLogic", () => {
  it("calls cm360Service.listEntities with correct args", async () => {
    mockState.cm360Service.listEntities.mockResolvedValue({
      entities: [{ id: "1" }],
      nextPageToken: undefined,
    });

    const input = {
      profileId: "123",
      entityType: "campaign" as const,
      filters: { advertiserId: "456" },
      pageToken: "tok",
      maxResults: 10,
    };
    await listEntitiesLogic(input, mockContext);

    expect(mockState.cm360Service.listEntities).toHaveBeenCalledWith(
      "campaign",
      "123",
      { advertiserId: "456" },
      "tok",
      10,
      mockContext
    );
  });

  it("returns entities array, totalCount matching length", async () => {
    const entities = [{ id: "1" }, { id: "2" }, { id: "3" }];
    mockState.cm360Service.listEntities.mockResolvedValue({ entities, nextPageToken: undefined });

    const result = await listEntitiesLogic(
      { profileId: "123", entityType: "campaign" as const },
      mockContext
    );

    expect(result.entities).toEqual(entities);
    expect(result.totalCount).toBe(3);
  });

  it("sets has_more to true when nextPageToken present", async () => {
    mockState.cm360Service.listEntities.mockResolvedValue({
      entities: [{ id: "1" }],
      nextPageToken: "next-page",
    });

    const result = await listEntitiesLogic(
      { profileId: "123", entityType: "campaign" as const },
      mockContext
    );

    expect(result.has_more).toBe(true);
    expect(result.nextPageToken).toBe("next-page");
  });

  it("sets has_more to false when nextPageToken absent", async () => {
    mockState.cm360Service.listEntities.mockResolvedValue({
      entities: [{ id: "1" }],
      nextPageToken: undefined,
    });

    const result = await listEntitiesLogic(
      { profileId: "123", entityType: "campaign" as const },
      mockContext
    );

    expect(result.has_more).toBe(false);
  });

  it("propagates service errors", async () => {
    mockState.cm360Service.listEntities.mockRejectedValue(new Error("Service down"));

    await expect(
      listEntitiesLogic({ profileId: "123", entityType: "campaign" as const }, mockContext)
    ).rejects.toThrow("Service down");
  });
});

describe("listEntitiesResponseFormatter", () => {
  it("includes entity count", () => {
    const result = listEntitiesResponseFormatter({
      entities: [{ id: "1" }, { id: "2" }],
      totalCount: 2,
      has_more: false,
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    expect(result[0].text).toContain("Found 2 entities");
  });

  it("shows pagination hint when nextPageToken present", () => {
    const result = listEntitiesResponseFormatter({
      entities: [{ id: "1" }],
      totalCount: 1,
      has_more: true,
      nextPageToken: "abc123",
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    expect(result[0].text).toContain("More results available");
    expect(result[0].text).toContain("abc123");
  });

  it("shows 'No entities found' when empty", () => {
    const result = listEntitiesResponseFormatter({
      entities: [],
      totalCount: 0,
      has_more: false,
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    expect(result[0].text).toContain("No entities found");
  });
});
