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
    "campaign", "placement", "ad", "creative", "site",
    "advertiser", "floodlightActivity", "floodlightConfiguration",
  ],
  getDeletableEntityTypeEnum: () => ["floodlightActivity"],
}));

import {
  bulkUpdateStatusLogic,
  bulkUpdateStatusResponseFormatter,
  BulkUpdateStatusInputSchema,
} from "../../src/mcp-server/tools/definitions/bulk-update-status.tool.js";

const mockContext = { requestId: "test-req" } as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("bulkUpdateStatusLogic", () => {
  it("calls getEntity then updateEntity for each entityId", async () => {
    mockState.cm360Service.getEntity.mockResolvedValue({ id: "1", name: "Camp", archived: false });
    mockState.cm360Service.updateEntity.mockResolvedValue({});

    await bulkUpdateStatusLogic(
      { profileId: "p1", entityType: "campaign", entityIds: ["1", "2"], status: "ARCHIVED" },
      mockContext
    );

    expect(mockState.cm360Service.getEntity).toHaveBeenCalledTimes(2);
    expect(mockState.cm360Service.updateEntity).toHaveBeenCalledTimes(2);
  });

  it("preserves existing entity fields in update", async () => {
    mockState.cm360Service.getEntity.mockResolvedValue({ id: "1", name: "Test", budget: 100 });
    mockState.cm360Service.updateEntity.mockResolvedValue({});

    await bulkUpdateStatusLogic(
      { profileId: "p1", entityType: "campaign", entityIds: ["1"], status: "ARCHIVED" },
      mockContext
    );

    expect(mockState.cm360Service.updateEntity).toHaveBeenCalledWith(
      "campaign",
      "p1",
      { id: "1", name: "Test", budget: 100, archived: true },
      mockContext
    );
  });

  it("maps ad ACTIVE to active=true and archived=false", async () => {
    mockState.cm360Service.getEntity.mockResolvedValue({ id: "1", name: "Ad", active: false, archived: true });
    mockState.cm360Service.updateEntity.mockResolvedValue({});

    await bulkUpdateStatusLogic(
      { profileId: "p1", entityType: "ad", entityIds: ["1"], status: "ACTIVE" },
      mockContext
    );

    expect(mockState.cm360Service.updateEntity).toHaveBeenCalledWith(
      "ad",
      "p1",
      { id: "1", name: "Ad", active: true, archived: false },
      mockContext
    );
  });

  it("maps placement INACTIVE to activeStatus", async () => {
    mockState.cm360Service.getEntity.mockResolvedValue({ id: "1", name: "Placement" });
    mockState.cm360Service.updateEntity.mockResolvedValue({});

    await bulkUpdateStatusLogic(
      { profileId: "p1", entityType: "placement", entityIds: ["1"], status: "INACTIVE" },
      mockContext
    );

    expect(mockState.cm360Service.updateEntity).toHaveBeenCalledWith(
      "placement",
      "p1",
      { id: "1", name: "Placement", activeStatus: "PLACEMENT_STATUS_INACTIVE" },
      mockContext
    );
  });

  it("handles GET failure for one entity while others succeed", async () => {
    mockState.cm360Service.getEntity
      .mockRejectedValueOnce(new Error("Not found"))
      .mockResolvedValueOnce({ id: "2", name: "OK" });
    mockState.cm360Service.updateEntity.mockResolvedValue({});

    const result = await bulkUpdateStatusLogic(
      { profileId: "p1", entityType: "campaign", entityIds: ["1", "2"], status: "ARCHIVED" },
      mockContext
    );

    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toContain("Not found");
    expect(result.results[1].success).toBe(true);
  });

  it("handles PUT failure for one entity while others succeed", async () => {
    mockState.cm360Service.getEntity.mockResolvedValue({ id: "1", name: "Camp", archived: false });
    mockState.cm360Service.updateEntity
      .mockRejectedValueOnce(new Error("Permission denied"))
      .mockResolvedValueOnce({});

    const result = await bulkUpdateStatusLogic(
      { profileId: "p1", entityType: "campaign", entityIds: ["1", "2"], status: "ACTIVE" },
      mockContext
    );

    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toContain("Permission denied");
    expect(result.results[1].success).toBe(true);
  });

  it("all succeed: updated equals entityIds.length, failed is 0", async () => {
    mockState.cm360Service.getEntity.mockResolvedValue({ id: "x", archived: false });
    mockState.cm360Service.updateEntity.mockResolvedValue({});

    const result = await bulkUpdateStatusLogic(
      { profileId: "p1", entityType: "campaign", entityIds: ["1", "2", "3"], status: "ACTIVE" },
      mockContext
    );

    expect(result.updated).toBe(3);
    expect(result.failed).toBe(0);
  });

  it("all fail: updated is 0, failed equals entityIds.length", async () => {
    mockState.cm360Service.getEntity.mockRejectedValue(new Error("fail"));

    const result = await bulkUpdateStatusLogic(
      { profileId: "p1", entityType: "campaign", entityIds: ["1", "2"], status: "ARCHIVED" },
      mockContext
    );

    expect(result.updated).toBe(0);
    expect(result.failed).toBe(2);
  });

  it("fails fast per entity for unsupported entity types", async () => {
    mockState.cm360Service.getEntity.mockResolvedValue({ id: "1", name: "Site" });

    const result = await bulkUpdateStatusLogic(
      { profileId: "p1", entityType: "site", entityIds: ["1"], status: "ARCHIVED" },
      mockContext
    );

    expect(result.updated).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.results[0].error).toContain("not supported");
  });
});

describe("bulkUpdateStatusResponseFormatter", () => {
  it("shows success and failure counts", () => {
    const output = bulkUpdateStatusResponseFormatter({
      updated: 2,
      failed: 1,
      results: [
        { entityId: "1", success: true },
        { entityId: "2", success: true },
        { entityId: "3", success: false, error: "err" },
      ],
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(output[0].text).toContain("2 succeeded");
    expect(output[0].text).toContain("1 failed");
  });

  it("shows entityId in failure details", () => {
    const output = bulkUpdateStatusResponseFormatter({
      updated: 0,
      failed: 1,
      results: [{ entityId: "abc-123", success: false, error: "Not found" }],
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(output[0].text).toContain("abc-123");
    expect(output[0].text).toContain("Not found");
  });

  it("no failure section when all succeed", () => {
    const output = bulkUpdateStatusResponseFormatter({
      updated: 2,
      failed: 0,
      results: [
        { entityId: "1", success: true },
        { entityId: "2", success: true },
      ],
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(output[0].text).not.toContain("Failures:");
  });
});

describe("BulkUpdateStatusInputSchema", () => {
  it("requires profileId, entityType, entityIds, status", () => {
    const result = BulkUpdateStatusInputSchema.safeParse({
      profileId: "p1",
      entityType: "campaign",
      entityIds: ["1"],
      status: "ARCHIVED",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty entityIds", () => {
    const result = BulkUpdateStatusInputSchema.safeParse({
      profileId: "p1",
      entityType: "campaign",
      entityIds: [],
      status: "ARCHIVED",
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 50 entityIds", () => {
    const ids = Array.from({ length: 51 }, (_, i) => String(i));
    const result = BulkUpdateStatusInputSchema.safeParse({
      profileId: "p1",
      entityType: "campaign",
      entityIds: ids,
      status: "ARCHIVED",
    });
    expect(result.success).toBe(false);
  });
});
