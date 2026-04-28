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
  listEntitiesLogic,
  listEntitiesResponseFormatter,
  ListEntitiesInputSchema,
} from "../../src/mcp-server/tools/definitions/list-entities.tool.js";

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

describe("listEntitiesLogic", () => {
  let mockMetaService: { listEntities: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    mockMetaService = {
      listEntities: vi.fn().mockResolvedValue({
        entities: [
          { id: "1", name: "Campaign 1" },
          { id: "2", name: "Campaign 2" },
        ],
        nextCursor: undefined,
      }),
    };

    mockResolveSessionServices.mockReturnValue({
      metaService: mockMetaService,
    });
  });

  it("returns entity list with correct structure", async () => {
    const result = await listEntitiesLogic(
      { entityType: "campaign" as any, adAccountId: "act_123" },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.entities).toHaveLength(2);
    expect(result.entities[0]).toEqual({ id: "1", name: "Campaign 1" });
    expect(result.entities[1]).toEqual({ id: "2", name: "Campaign 2" });
    expect(result.pagination.pageSize).toBe(2);
    expect(result.pagination.nextCursor).toBeNull();
    expect(result.pagination.hasMore).toBe(false);
    expect(result.pagination.nextPageInputKey).toBe("after");
    expect(result.timestamp).toBeDefined();
  });

  it("passes adAccountId and entityType to service", async () => {
    await listEntitiesLogic(
      { entityType: "adSet" as any, adAccountId: "act_456" },
      createMockContext(),
      createMockSdkContext()
    );

    expect(mockMetaService.listEntities).toHaveBeenCalledOnce();
    const [entityType, adAccountId] = mockMetaService.listEntities.mock.calls[0];
    expect(entityType).toBe("adSet");
    expect(adAccountId).toBe("act_456");
  });

  it("passes pagination params to service", async () => {
    await listEntitiesLogic(
      {
        entityType: "campaign" as any,
        adAccountId: "act_123",
        limit: 50,
        after: "cursor_abc",
      },
      createMockContext(),
      createMockSdkContext()
    );

    expect(mockMetaService.listEntities).toHaveBeenCalledOnce();
    const args = mockMetaService.listEntities.mock.calls[0];
    // listEntities(entityType, adAccountId, fields, filtering, limit, after, context)
    expect(args[4]).toBe(50); // limit
    expect(args[5]).toBe("cursor_abc"); // after
  });

  it("passes fields and filtering to service", async () => {
    const filtering = [{ field: "status", operator: "IN", value: ["ACTIVE"] }];
    await listEntitiesLogic(
      {
        entityType: "campaign" as any,
        adAccountId: "act_123",
        fields: ["id", "name"],
        filtering,
      },
      createMockContext(),
      createMockSdkContext()
    );

    const args = mockMetaService.listEntities.mock.calls[0];
    expect(args[2]).toEqual(["id", "name"]); // fields
    expect(args[3]).toEqual(filtering); // filtering
  });

  it("throws when resolveSessionServices fails (no session)", async () => {
    mockResolveSessionServices.mockImplementation(() => {
      throw new Error("No session ID available.");
    });

    await expect(
      listEntitiesLogic(
        { entityType: "campaign" as any, adAccountId: "act_123" },
        createMockContext(),
        undefined
      )
    ).rejects.toThrow("No session ID available.");
  });
});

describe("listEntitiesResponseFormatter", () => {
  function pagination(nextCursor: string | null, pageSize: number) {
    return {
      nextCursor,
      hasMore: nextCursor !== null,
      pageSize,
      nextPageInputKey: "after",
    };
  }

  it("shows entity count", () => {
    const result = {
      entities: [{ id: "1" }, { id: "2" }],
      pagination: pagination(null, 2),
      timestamp: new Date().toISOString(),
    };

    const content = listEntitiesResponseFormatter(result);

    expect(content).toHaveLength(1);
    expect((content[0] as any).type).toBe("text");
    expect((content[0] as any).text).toContain("Found 2 entities");
  });

  it("shows cursor when present", () => {
    const result = {
      entities: [{ id: "1" }],
      pagination: pagination("abc_cursor", 1),
      timestamp: new Date().toISOString(),
    };

    const content = listEntitiesResponseFormatter(result);

    expect((content[0] as any).text).toContain("More results available");
    expect((content[0] as any).text).toContain("abc_cursor");
    expect((content[0] as any).text).toContain("after");
  });

  it("does not show pagination info when no cursor", () => {
    const result = {
      entities: [{ id: "1" }],
      pagination: pagination(null, 1),
      timestamp: new Date().toISOString(),
    };

    const content = listEntitiesResponseFormatter(result);

    expect((content[0] as any).text).not.toContain("More results available");
  });

  it("shows 'No entities found' when there are zero entities", () => {
    const result = {
      entities: [],
      pagination: pagination(null, 0),
      timestamp: new Date().toISOString(),
    };

    const content = listEntitiesResponseFormatter(result);

    expect((content[0] as any).text).toContain("No entities found");
  });
});

describe("ListEntitiesInputSchema validation", () => {
  it("requires adAccountId", () => {
    const result = ListEntitiesInputSchema.safeParse({
      entityType: "campaign",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("adAccountId"))).toBe(true);
    }
  });

  it("accepts valid input with entityType and adAccountId", () => {
    const result = ListEntitiesInputSchema.safeParse({
      entityType: "campaign",
      adAccountId: "act_123456789",
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional fields and filtering", () => {
    const result = ListEntitiesInputSchema.safeParse({
      entityType: "adSet",
      adAccountId: "act_123",
      fields: ["id", "name"],
      filtering: [{ field: "status", operator: "IN", value: ["ACTIVE"] }],
      limit: 25,
      after: "cursor_abc",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid entityType", () => {
    const result = ListEntitiesInputSchema.safeParse({
      entityType: "invalidType",
      adAccountId: "act_123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects limit above 100", () => {
    const result = ListEntitiesInputSchema.safeParse({
      entityType: "campaign",
      adAccountId: "act_123",
      limit: 101,
    });
    expect(result.success).toBe(false);
  });
});
