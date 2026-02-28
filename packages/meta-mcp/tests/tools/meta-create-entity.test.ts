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
  createEntityLogic,
  createEntityResponseFormatter,
  CreateEntityInputSchema,
} from "../../src/mcp-server/tools/definitions/create-entity.tool.js";

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

describe("createEntityLogic", () => {
  let mockMetaService: { createEntity: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    mockMetaService = {
      createEntity: vi.fn().mockResolvedValue({
        id: "new-1",
        name: "New Campaign",
      }),
    };

    mockResolveSessionServices.mockReturnValue({
      metaService: mockMetaService,
    });
  });

  it("creates entity and returns result", async () => {
    const result = await createEntityLogic(
      {
        entityType: "campaign" as any,
        adAccountId: "act_123",
        data: { name: "New Campaign", objective: "OUTCOME_TRAFFIC" },
      },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.entity).toEqual({ id: "new-1", name: "New Campaign" });
    expect(result.entityType).toBe("campaign");
    expect(result.timestamp).toBeDefined();
  });

  it("passes entityType, adAccountId, and data to service", async () => {
    const data = { name: "Test Ad Set", campaign_id: "123" };
    await createEntityLogic(
      {
        entityType: "adSet" as any,
        adAccountId: "act_456",
        data,
      },
      createMockContext(),
      createMockSdkContext()
    );

    expect(mockMetaService.createEntity).toHaveBeenCalledOnce();
    const [entityType, adAccountId, passedData] = mockMetaService.createEntity.mock.calls[0];
    expect(entityType).toBe("adSet");
    expect(adAccountId).toBe("act_456");
    expect(passedData).toEqual(data);
  });

  it("throws when resolveSessionServices fails (no session)", async () => {
    mockResolveSessionServices.mockImplementation(() => {
      throw new Error("No session ID available.");
    });

    await expect(
      createEntityLogic(
        {
          entityType: "campaign" as any,
          adAccountId: "act_123",
          data: { name: "Test" },
        },
        createMockContext(),
        undefined
      )
    ).rejects.toThrow("No session ID available.");
  });
});

describe("createEntityResponseFormatter", () => {
  it("shows created entity", () => {
    const result = {
      entity: { id: "new-1", name: "New Campaign" },
      entityType: "campaign",
      timestamp: new Date().toISOString(),
    };

    const content = createEntityResponseFormatter(result);

    expect(content).toHaveLength(1);
    expect((content[0] as any).type).toBe("text");
    expect((content[0] as any).text).toContain("campaign created successfully");
    expect((content[0] as any).text).toContain('"id": "new-1"');
  });
});

describe("CreateEntityInputSchema validation", () => {
  it("requires adAccountId", () => {
    const result = CreateEntityInputSchema.safeParse({
      entityType: "campaign",
      data: { name: "Test" },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("adAccountId"))).toBe(true);
    }
  });

  it("requires data", () => {
    const result = CreateEntityInputSchema.safeParse({
      entityType: "campaign",
      adAccountId: "act_123",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("data"))).toBe(true);
    }
  });

  it("requires entityType", () => {
    const result = CreateEntityInputSchema.safeParse({
      adAccountId: "act_123",
      data: { name: "Test" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid input", () => {
    const result = CreateEntityInputSchema.safeParse({
      entityType: "campaign",
      adAccountId: "act_123",
      data: { name: "Summer Sale", objective: "OUTCOME_TRAFFIC", special_ad_categories: [] },
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid entityType", () => {
    const result = CreateEntityInputSchema.safeParse({
      entityType: "invalidType",
      adAccountId: "act_123",
      data: { name: "Test" },
    });
    expect(result.success).toBe(false);
  });
});
