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
  bulkUpdateEntitiesLogic,
  bulkUpdateEntitiesResponseFormatter,
  BulkUpdateEntitiesInputSchema,
} from "../../src/mcp-server/tools/definitions/bulk-update-entities.tool.js";

const mockContext = { requestId: "test-req" } as any;

describe("bulkUpdateEntitiesLogic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("all succeed: updated === items.length, failed === 0", async () => {
    mockState.cm360Service.updateEntity
      .mockResolvedValueOnce({ id: "1", name: "A" })
      .mockResolvedValueOnce({ id: "2", name: "B" });

    const result = await bulkUpdateEntitiesLogic(
      {
        profileId: "prof-1",
        entityType: "campaign",
        items: [
          { entityId: "1", data: { name: "A" } },
          { entityId: "2", data: { name: "B" } },
        ],
      },
      mockContext
    );

    expect(result.updated).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].success).toBe(true);
    expect(result.results[1].success).toBe(true);
  });

  it("injects entityId as data.id", async () => {
    mockState.cm360Service.updateEntity.mockResolvedValue({ id: "e-1" });

    await bulkUpdateEntitiesLogic(
      {
        profileId: "prof-1",
        entityType: "campaign",
        items: [{ entityId: "e-1", data: { name: "Test" } }],
      },
      mockContext
    );

    expect(mockState.cm360Service.updateEntity).toHaveBeenCalledWith(
      "campaign",
      "prof-1",
      { name: "Test", id: "e-1" },
      mockContext
    );
  });

  it("partial failure handling", async () => {
    mockState.cm360Service.updateEntity
      .mockResolvedValueOnce({ id: "1", name: "OK" })
      .mockRejectedValueOnce(new Error("Update failed"))
      .mockResolvedValueOnce({ id: "3", name: "OK" });

    const result = await bulkUpdateEntitiesLogic(
      {
        profileId: "prof-1",
        entityType: "campaign",
        items: [
          { entityId: "1", data: { name: "A" } },
          { entityId: "2", data: { name: "B" } },
          { entityId: "3", data: { name: "C" } },
        ],
      },
      mockContext
    );

    expect(result.updated).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.results[1].success).toBe(false);
    expect(result.results[1].entityId).toBe("2");
  });

  it("propagates error messages", async () => {
    mockState.cm360Service.updateEntity.mockRejectedValue(new Error("Rate limit exceeded"));

    const result = await bulkUpdateEntitiesLogic(
      {
        profileId: "prof-1",
        entityType: "campaign",
        items: [{ entityId: "1", data: { name: "A" } }],
      },
      mockContext
    );

    expect(result.results[0].error).toBe("Rate limit exceeded");
  });
});

describe("bulkUpdateEntitiesResponseFormatter", () => {
  it("shows success/failure counts", () => {
    const result = bulkUpdateEntitiesResponseFormatter({
      updated: 3,
      failed: 1,
      results: [
        { entityId: "1", success: true },
        { entityId: "2", success: true },
        { entityId: "3", success: true },
        { entityId: "4", success: false, error: "Bad request" },
      ],
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(result[0].text).toContain("3 succeeded");
    expect(result[0].text).toContain("1 failed");
  });

  it("shows entityId in failure details", () => {
    const result = bulkUpdateEntitiesResponseFormatter({
      updated: 0,
      failed: 1,
      results: [
        { entityId: "failing-entity", success: false, error: "API error" },
      ],
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(result[0].text).toContain("failing-entity");
    expect(result[0].text).toContain("API error");
  });
});

describe("BulkUpdateEntitiesInputSchema", () => {
  it("requires items with entityId and data", () => {
    const valid = BulkUpdateEntitiesInputSchema.safeParse({
      profileId: "123",
      entityType: "campaign",
      items: [{ entityId: "1", data: { name: "Test" } }],
    });
    expect(valid.success).toBe(true);
  });

  it("rejects empty items", () => {
    const result = BulkUpdateEntitiesInputSchema.safeParse({
      profileId: "123",
      entityType: "campaign",
      items: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 50 items", () => {
    const items = Array.from({ length: 51 }, (_, i) => ({
      entityId: String(i),
      data: { name: `Item ${i}` },
    }));

    const result = BulkUpdateEntitiesInputSchema.safeParse({
      profileId: "123",
      entityType: "campaign",
      items,
    });
    expect(result.success).toBe(false);
  });
});
