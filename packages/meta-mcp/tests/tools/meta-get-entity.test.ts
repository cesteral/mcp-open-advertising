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
  getEntityLogic,
  getEntityResponseFormatter,
  GetEntityInputSchema,
} from "../../src/mcp-server/tools/definitions/get-entity.tool.js";

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

describe("getEntityLogic", () => {
  let mockMetaService: { getEntity: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    mockMetaService = {
      getEntity: vi.fn().mockResolvedValue({
        id: "1",
        name: "Test Campaign",
      }),
    };

    mockResolveSessionServices.mockReturnValue({
      metaService: mockMetaService,
    });
  });

  it("returns the retrieved entity", async () => {
    const result = await getEntityLogic(
      { entityType: "campaign" as any, entityId: "1" },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.entity).toEqual({ id: "1", name: "Test Campaign" });
    expect(result.timestamp).toBeDefined();
  });

  it("passes entityId and entityType to service", async () => {
    await getEntityLogic(
      { entityType: "adSet" as any, entityId: "456" },
      createMockContext(),
      createMockSdkContext()
    );

    expect(mockMetaService.getEntity).toHaveBeenCalledOnce();
    const [entityType, entityId] = mockMetaService.getEntity.mock.calls[0];
    expect(entityType).toBe("adSet");
    expect(entityId).toBe("456");
  });

  it("passes optional fields to service", async () => {
    await getEntityLogic(
      { entityType: "campaign" as any, entityId: "1", fields: ["id", "name", "status"] },
      createMockContext(),
      createMockSdkContext()
    );

    const args = mockMetaService.getEntity.mock.calls[0];
    expect(args[2]).toEqual(["id", "name", "status"]); // fields
  });

  it("throws when resolveSessionServices fails (no session)", async () => {
    mockResolveSessionServices.mockImplementation(() => {
      throw new Error("No session ID available.");
    });

    await expect(
      getEntityLogic(
        { entityType: "campaign" as any, entityId: "1" },
        createMockContext(),
        undefined
      )
    ).rejects.toThrow("No session ID available.");
  });
});

describe("getEntityResponseFormatter", () => {
  it("shows retrieved entity", () => {
    const result = {
      entity: { id: "1", name: "Test Campaign" },
      timestamp: new Date().toISOString(),
    };

    const content = getEntityResponseFormatter(result);

    expect(content).toHaveLength(1);
    expect((content[0] as any).type).toBe("text");
    expect((content[0] as any).text).toContain("Entity retrieved");
    expect((content[0] as any).text).toContain('"id": "1"');
    expect((content[0] as any).text).toContain('"name": "Test Campaign"');
  });
});

describe("GetEntityInputSchema validation", () => {
  it("requires entityId", () => {
    const result = GetEntityInputSchema.safeParse({
      entityType: "campaign",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("entityId"))).toBe(true);
    }
  });

  it("requires entityType", () => {
    const result = GetEntityInputSchema.safeParse({
      entityId: "123",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid input", () => {
    const result = GetEntityInputSchema.safeParse({
      entityType: "campaign",
      entityId: "123456789",
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional fields", () => {
    const result = GetEntityInputSchema.safeParse({
      entityType: "adSet",
      entityId: "123",
      fields: ["id", "name", "status"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty entityId", () => {
    const result = GetEntityInputSchema.safeParse({
      entityType: "campaign",
      entityId: "",
    });
    expect(result.success).toBe(false);
  });
});
