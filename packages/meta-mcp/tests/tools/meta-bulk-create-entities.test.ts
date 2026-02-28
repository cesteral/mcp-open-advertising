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

vi.mock("../../src/mcp-server/tools/utils/entity-mapping.js", () => ({
  getEntityTypeEnum: vi
    .fn()
    .mockReturnValue(["campaign", "adSet", "ad", "adCreative", "customAudience"]),
}));

import {
  bulkCreateEntitiesLogic,
  bulkCreateEntitiesResponseFormatter,
  BulkCreateEntitiesInputSchema,
} from "../../src/mcp-server/tools/definitions/bulk-create-entities.tool.js";

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

describe("bulkCreateEntitiesLogic", () => {
  let mockMetaService: { bulkCreateEntities: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    mockMetaService = {
      bulkCreateEntities: vi.fn().mockResolvedValue({
        results: [
          { success: true, entity: { id: "1", name: "Ad Set 1" } },
          { success: true, entity: { id: "2", name: "Ad Set 2" } },
        ],
      }),
    };

    mockResolveSessionServices.mockReturnValue({
      metaService: mockMetaService,
    });
  });

  it("creates entities in bulk and returns result", async () => {
    const result = await bulkCreateEntitiesLogic(
      {
        entityType: "adSet" as any,
        adAccountId: "act_123",
        items: [
          { name: "Ad Set 1", campaign_id: "c1" },
          { name: "Ad Set 2", campaign_id: "c1" },
        ],
      },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.results).toHaveLength(2);
    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(0);
    expect(result.timestamp).toBeDefined();
  });

  it("returns correct success/failure counts with partial failures", async () => {
    mockMetaService.bulkCreateEntities.mockResolvedValue({
      results: [
        { success: true, entity: { id: "1" } },
        { success: false, error: "Invalid data" },
        { success: true, entity: { id: "3" } },
      ],
    });

    const result = await bulkCreateEntitiesLogic(
      {
        entityType: "campaign" as any,
        adAccountId: "act_123",
        items: [
          { name: "Camp 1" },
          { name: "Camp 2" },
          { name: "Camp 3" },
        ],
      },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(1);
  });

  it("passes entityType, adAccountId, and items to service", async () => {
    const items = [{ name: "Test 1" }, { name: "Test 2" }];
    await bulkCreateEntitiesLogic(
      {
        entityType: "ad" as any,
        adAccountId: "act_789",
        items,
      },
      createMockContext(),
      createMockSdkContext()
    );

    expect(mockMetaService.bulkCreateEntities).toHaveBeenCalledOnce();
    const [entityType, adAccountId, passedItems] =
      mockMetaService.bulkCreateEntities.mock.calls[0];
    expect(entityType).toBe("ad");
    expect(adAccountId).toBe("act_789");
    expect(passedItems).toEqual(items);
  });

  it("throws when resolveSessionServices fails (no session)", async () => {
    mockResolveSessionServices.mockImplementation(() => {
      throw new Error("No session ID available.");
    });

    await expect(
      bulkCreateEntitiesLogic(
        {
          entityType: "campaign" as any,
          adAccountId: "act_123",
          items: [{ name: "Test" }],
        },
        createMockContext(),
        undefined
      )
    ).rejects.toThrow("No session ID available.");
  });
});

describe("bulkCreateEntitiesResponseFormatter", () => {
  it("shows success and failure counts", () => {
    const result = {
      results: [
        { success: true, entity: { id: "1" } },
        { success: false, error: "Invalid" },
      ],
      successCount: 1,
      failureCount: 1,
      timestamp: new Date().toISOString(),
    };

    const content = bulkCreateEntitiesResponseFormatter(result);

    expect(content).toHaveLength(1);
    expect((content[0] as any).type).toBe("text");
    expect((content[0] as any).text).toContain("1 succeeded");
    expect((content[0] as any).text).toContain("1 failed");
  });

  it("shows all successes", () => {
    const result = {
      results: [
        { success: true, entity: { id: "1" } },
        { success: true, entity: { id: "2" } },
      ],
      successCount: 2,
      failureCount: 0,
      timestamp: new Date().toISOString(),
    };

    const content = bulkCreateEntitiesResponseFormatter(result);

    expect((content[0] as any).text).toContain("2 succeeded");
    expect((content[0] as any).text).toContain("0 failed");
  });
});

describe("BulkCreateEntitiesInputSchema validation", () => {
  it("requires items array", () => {
    const result = BulkCreateEntitiesInputSchema.safeParse({
      entityType: "campaign",
      adAccountId: "act_123",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("items"))).toBe(true);
    }
  });

  it("requires at least 1 item", () => {
    const result = BulkCreateEntitiesInputSchema.safeParse({
      entityType: "campaign",
      adAccountId: "act_123",
      items: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 50 items", () => {
    const items = Array.from({ length: 51 }, (_, i) => ({ name: `Item ${i}` }));
    const result = BulkCreateEntitiesInputSchema.safeParse({
      entityType: "campaign",
      adAccountId: "act_123",
      items,
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid input with items array", () => {
    const result = BulkCreateEntitiesInputSchema.safeParse({
      entityType: "adSet",
      adAccountId: "act_123",
      items: [{ name: "Test 1" }, { name: "Test 2" }],
    });
    expect(result.success).toBe(true);
  });

  it("requires adAccountId", () => {
    const result = BulkCreateEntitiesInputSchema.safeParse({
      entityType: "campaign",
      items: [{ name: "Test" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("adAccountId"))).toBe(true);
    }
  });
});
