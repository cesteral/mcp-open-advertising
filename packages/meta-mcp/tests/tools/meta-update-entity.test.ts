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
  updateEntityLogic,
  updateEntityResponseFormatter,
  UpdateEntityInputSchema,
} from "../../src/mcp-server/tools/definitions/update-entity.tool.js";

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

describe("updateEntityLogic", () => {
  let mockMetaService: { updateEntity: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    mockMetaService = {
      updateEntity: vi.fn().mockResolvedValue({ success: true }),
    };

    mockResolveSessionServices.mockReturnValue({
      metaService: mockMetaService,
    });
  });

  it("updates entity and returns success", async () => {
    const result = await updateEntityLogic(
      {
        entityType: "campaign" as any,
        entityId: "123",
        data: { status: "PAUSED" },
      },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.success).toBe(true);
    expect(result.entityId).toBe("123");
    expect(result.entityType).toBe("campaign");
    expect(result.timestamp).toBeDefined();
  });

  it("passes entityId and data to service", async () => {
    const data = { daily_budget: 10000 };
    await updateEntityLogic(
      {
        entityType: "adSet" as any,
        entityId: "456",
        data,
      },
      createMockContext(),
      createMockSdkContext()
    );

    expect(mockMetaService.updateEntity).toHaveBeenCalledOnce();
    const [entityId, passedData] = mockMetaService.updateEntity.mock.calls[0];
    expect(entityId).toBe("456");
    expect(passedData).toEqual(data);
  });

  it("returns success false when API response has no success flag", async () => {
    mockMetaService.updateEntity.mockResolvedValue({ error: "something went wrong" });

    const result = await updateEntityLogic(
      {
        entityType: "campaign" as any,
        entityId: "123",
        data: { status: "PAUSED" },
      },
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
      updateEntityLogic(
        {
          entityType: "campaign" as any,
          entityId: "123",
          data: { status: "PAUSED" },
        },
        createMockContext(),
        undefined
      )
    ).rejects.toThrow("No session ID available.");
  });
});

describe("updateEntityResponseFormatter", () => {
  it("shows success message", () => {
    const result = {
      success: true,
      entityId: "123",
      entityType: "campaign",
      timestamp: new Date().toISOString(),
    };

    const content = updateEntityResponseFormatter(result);

    expect(content).toHaveLength(1);
    expect((content[0] as any).type).toBe("text");
    expect((content[0] as any).text).toContain("campaign 123 updated successfully");
  });

  it("shows unexpected response message on failure", () => {
    const result = {
      success: false,
      entityId: "123",
      entityType: "campaign",
      timestamp: new Date().toISOString(),
    };

    const content = updateEntityResponseFormatter(result);

    expect((content[0] as any).text).toContain("update returned unexpected response");
  });
});

describe("UpdateEntityInputSchema validation", () => {
  it("requires entityId", () => {
    const result = UpdateEntityInputSchema.safeParse({
      entityType: "campaign",
      data: { status: "PAUSED" },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("entityId"))).toBe(true);
    }
  });

  it("requires data", () => {
    const result = UpdateEntityInputSchema.safeParse({
      entityType: "campaign",
      entityId: "123",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("data"))).toBe(true);
    }
  });

  it("accepts valid input", () => {
    const result = UpdateEntityInputSchema.safeParse({
      entityType: "campaign",
      entityId: "123",
      data: { status: "PAUSED" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty entityId", () => {
    const result = UpdateEntityInputSchema.safeParse({
      entityType: "campaign",
      entityId: "",
      data: { status: "PAUSED" },
    });
    expect(result.success).toBe(false);
  });
});
