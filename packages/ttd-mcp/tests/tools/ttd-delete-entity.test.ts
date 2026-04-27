import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import {
  DeleteEntityInputSchema,
  deleteEntityLogic,
  deleteEntityResponseFormatter,
} from "../../src/mcp-server/tools/definitions/delete-entity.tool.js";

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

describe("deleteEntityLogic", () => {
  let mockTtdService: { deleteEntity: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockTtdService = {
      deleteEntity: vi.fn().mockResolvedValue(undefined),
    };

    mockResolveSessionServices.mockReturnValue({
      ttdService: mockTtdService,
    });
  });

  it("deletes an entity and returns success metadata", async () => {
    const result = await deleteEntityLogic(
      {
        entityType: "campaign" as any,
        entityId: "cmp-001",
        advertiserId: "adv-123",
      },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.success).toBe(true);
    expect(result.entityType).toBe("campaign");
    expect(result.entityId).toBe("cmp-001");
    expect(mockTtdService.deleteEntity).toHaveBeenCalledWith(
      "campaign",
      "cmp-001",
      expect.any(Object)
    );
  });
});

describe("DeleteEntityInputSchema", () => {
  it("requires advertiserId for campaign deletes", () => {
    const parsed = DeleteEntityInputSchema.safeParse({
      entityType: "campaign",
      entityId: "cmp-001",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain(
        'Missing required parent identifier(s) for entity type "campaign"'
      );
    }
  });
});

describe("deleteEntityResponseFormatter", () => {
  it("renders delete confirmation", () => {
    const text = deleteEntityResponseFormatter({
      success: true,
      entityType: "campaign",
      entityId: "cmp-001",
      timestamp: new Date().toISOString(),
    })[0].text;

    expect(text).toContain("Entity deleted: campaign cmp-001");
  });
});
