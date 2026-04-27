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
  deleteEntityLogic,
  deleteEntityResponseFormatter,
  DeleteEntityInputSchema,
} from "../../src/mcp-server/tools/definitions/delete-entity.tool.js";

const mockContext = { requestId: "test-req" } as any;

describe("deleteEntityLogic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls cm360Service.deleteEntity with correct args", async () => {
    mockState.cm360Service.deleteEntity.mockResolvedValue(undefined);

    await deleteEntityLogic(
      {
        profileId: "prof-1",
        entityType: "floodlightActivity",
        entityId: "entity-1",
      },
      mockContext
    );

    expect(mockState.cm360Service.deleteEntity).toHaveBeenCalledWith(
      "floodlightActivity",
      "prof-1",
      "entity-1",
      mockContext
    );
  });

  it("returns {deleted: true, entityId}", async () => {
    mockState.cm360Service.deleteEntity.mockResolvedValue(undefined);

    const result = await deleteEntityLogic(
      {
        profileId: "prof-1",
        entityType: "floodlightActivity",
        entityId: "entity-1",
      },
      mockContext
    );

    expect(result.deleted).toBe(true);
    expect(result.entityId).toBe("entity-1");
    expect(result.timestamp).toBeDefined();
    expect(new Date(result.timestamp).getTime()).not.toBeNaN();
  });

  it("propagates service errors", async () => {
    mockState.cm360Service.deleteEntity.mockRejectedValue(new Error("Not found"));

    await expect(
      deleteEntityLogic(
        {
          profileId: "prof-1",
          entityType: "floodlightActivity",
          entityId: "entity-1",
        },
        mockContext
      )
    ).rejects.toThrow("Not found");
  });
});

describe("deleteEntityResponseFormatter", () => {
  it("includes entityId in success message", () => {
    const result = deleteEntityResponseFormatter({
      deleted: true,
      entityId: "entity-42",
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(result[0].text).toContain("entity-42");
    expect(result[0].text).toContain("deleted successfully");
  });
});

describe("DeleteEntityInputSchema", () => {
  it("accepts floodlightActivity", () => {
    const result = DeleteEntityInputSchema.safeParse({
      profileId: "123",
      entityType: "floodlightActivity",
      entityId: "456",
    });
    expect(result.success).toBe(true);
  });

  it("rejects campaign (not deletable)", () => {
    const result = DeleteEntityInputSchema.safeParse({
      profileId: "123",
      entityType: "campaign",
      entityId: "456",
    });
    expect(result.success).toBe(false);
  });

  it("rejects ad (not deletable)", () => {
    const result = DeleteEntityInputSchema.safeParse({
      profileId: "123",
      entityType: "ad",
      entityId: "456",
    });
    expect(result.success).toBe(false);
  });

  it("requires profileId and entityId", () => {
    const missingProfileId = DeleteEntityInputSchema.safeParse({
      entityType: "floodlightActivity",
      entityId: "456",
    });
    expect(missingProfileId.success).toBe(false);

    const missingEntityId = DeleteEntityInputSchema.safeParse({
      profileId: "123",
      entityType: "floodlightActivity",
    });
    expect(missingEntityId.success).toBe(false);
  });
});
