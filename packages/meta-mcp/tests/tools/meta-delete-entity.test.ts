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
  deleteEntityLogic,
  deleteEntityResponseFormatter,
  DeleteEntityInputSchema,
} from "../../src/mcp-server/tools/definitions/delete-entity.tool.js";

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

describe("deleteEntityLogic", () => {
  let mockMetaService: { deleteEntity: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    mockMetaService = {
      deleteEntity: vi.fn().mockResolvedValue({ success: true }),
    };

    mockResolveSessionServices.mockReturnValue({
      metaService: mockMetaService,
    });
  });

  it("deletes entity and returns success metadata", async () => {
    const result = await deleteEntityLogic(
      { entityType: "adCreative" as any, entityId: "creative-001" },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.success).toBe(true);
    expect(result.entityId).toBe("creative-001");
    expect(result.entityType).toBe("adCreative");
    expect(result.timestamp).toBeDefined();
  });

  it("passes entityId to service", async () => {
    await deleteEntityLogic(
      { entityType: "campaign" as any, entityId: "123" },
      createMockContext(),
      createMockSdkContext()
    );

    expect(mockMetaService.deleteEntity).toHaveBeenCalledOnce();
    const [entityId] = mockMetaService.deleteEntity.mock.calls[0];
    expect(entityId).toBe("123");
  });

  it("returns success false when API response has no success flag", async () => {
    mockMetaService.deleteEntity.mockResolvedValue({ error: "not found" });

    const result = await deleteEntityLogic(
      { entityType: "campaign" as any, entityId: "123" },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.success).toBe(false);
  });

  it("throws when resolveSessionServices fails (no session)", async () => {
    mockResolveSessionServices.mockImplementation(() => {
      throw new Error("No session ID available.");
    });

    await expect(
      deleteEntityLogic(
        { entityType: "campaign" as any, entityId: "123" },
        createMockContext(),
        undefined
      )
    ).rejects.toThrow("No session ID available.");
  });
});

describe("deleteEntityResponseFormatter", () => {
  it("shows success message", () => {
    const result = {
      success: true,
      entityId: "123",
      entityType: "campaign",
      timestamp: new Date().toISOString(),
    };

    const content = deleteEntityResponseFormatter(result);

    expect(content).toHaveLength(1);
    expect((content[0] as any).type).toBe("text");
    expect((content[0] as any).text).toContain("campaign 123 deleted successfully");
  });

  it("shows unexpected response message on failure", () => {
    const result = {
      success: false,
      entityId: "123",
      entityType: "campaign",
      timestamp: new Date().toISOString(),
    };

    const content = deleteEntityResponseFormatter(result);

    expect((content[0] as any).text).toContain("deletion returned unexpected response");
  });
});

describe("DeleteEntityInputSchema validation", () => {
  it("requires entityId", () => {
    const result = DeleteEntityInputSchema.safeParse({
      entityType: "campaign",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("entityId"))).toBe(true);
    }
  });

  it("requires entityType", () => {
    const result = DeleteEntityInputSchema.safeParse({
      entityId: "123",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid input", () => {
    const result = DeleteEntityInputSchema.safeParse({
      entityType: "adCreative",
      entityId: "123456789",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty entityId", () => {
    const result = DeleteEntityInputSchema.safeParse({
      entityType: "campaign",
      entityId: "",
    });
    expect(result.success).toBe(false);
  });
});
