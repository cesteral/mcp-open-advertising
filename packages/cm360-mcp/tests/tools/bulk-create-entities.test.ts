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
  bulkCreateEntitiesLogic,
  bulkCreateEntitiesResponseFormatter,
  BulkCreateEntitiesInputSchema,
} from "../../src/mcp-server/tools/definitions/bulk-create-entities.tool.js";

const mockContext = { requestId: "test-req" } as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("bulkCreateEntitiesLogic", () => {
  it("all succeed: created equals items.length, failed is 0", async () => {
    mockState.cm360Service.createEntity.mockResolvedValue({ id: "new-1" });

    const result = await bulkCreateEntitiesLogic(
      {
        profileId: "p1",
        entityType: "campaign",
        items: [{ name: "A" }, { name: "B" }, { name: "C" }],
      },
      mockContext
    );

    expect(result.created).toBe(3);
    expect(result.failed).toBe(0);
    result.results.forEach((r) => expect(r.success).toBe(true));
  });

  it("partial failure: first succeeds, second fails", async () => {
    mockState.cm360Service.createEntity
      .mockResolvedValueOnce({ id: "new-1" })
      .mockRejectedValueOnce(new Error("API error"));

    const result = await bulkCreateEntitiesLogic(
      {
        profileId: "p1",
        entityType: "campaign",
        items: [{ name: "A" }, { name: "B" }],
      },
      mockContext
    );

    expect(result.results[0].success).toBe(true);
    expect(result.results[1].success).toBe(false);
    expect(result.results[1].error).toBe("API error");
    expect(result.created).toBe(1);
    expect(result.failed).toBe(1);
  });

  it("all fail: created is 0, failed equals items.length", async () => {
    mockState.cm360Service.createEntity.mockRejectedValue(new Error("fail"));

    const result = await bulkCreateEntitiesLogic(
      {
        profileId: "p1",
        entityType: "campaign",
        items: [{ name: "A" }, { name: "B" }],
      },
      mockContext
    );

    expect(result.created).toBe(0);
    expect(result.failed).toBe(2);
  });

  it("captures error message for non-Error thrown value", async () => {
    mockState.cm360Service.createEntity.mockRejectedValue("string error");

    const result = await bulkCreateEntitiesLogic(
      { profileId: "p1", entityType: "campaign", items: [{ name: "A" }] },
      mockContext
    );

    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toBe("string error");
  });

  it("calls cm360Service.createEntity with correct args for each item", async () => {
    mockState.cm360Service.createEntity.mockResolvedValue({ id: "new" });

    const items = [{ name: "First" }, { name: "Second" }];
    await bulkCreateEntitiesLogic(
      { profileId: "p1", entityType: "placement", items },
      mockContext
    );

    expect(mockState.cm360Service.createEntity).toHaveBeenCalledTimes(2);
    expect(mockState.cm360Service.createEntity).toHaveBeenNthCalledWith(
      1, "placement", "p1", { name: "First" }, mockContext
    );
    expect(mockState.cm360Service.createEntity).toHaveBeenNthCalledWith(
      2, "placement", "p1", { name: "Second" }, mockContext
    );
  });
});

describe("bulkCreateEntitiesResponseFormatter", () => {
  it("shows success and failure counts", () => {
    const output = bulkCreateEntitiesResponseFormatter({
      created: 2,
      failed: 1,
      results: [
        { index: 0, success: true, entity: {} },
        { index: 1, success: true, entity: {} },
        { index: 2, success: false, error: "err" },
      ],
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(output[0].text).toContain("2 succeeded");
    expect(output[0].text).toContain("1 failed");
  });

  it("shows failure details with item index", () => {
    const output = bulkCreateEntitiesResponseFormatter({
      created: 0,
      failed: 1,
      results: [{ index: 0, success: false, error: "Quota exceeded" }],
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(output[0].text).toContain("Item 0");
    expect(output[0].text).toContain("Quota exceeded");
  });

  it("no failure section when all succeed", () => {
    const output = bulkCreateEntitiesResponseFormatter({
      created: 2,
      failed: 0,
      results: [
        { index: 0, success: true, entity: {} },
        { index: 1, success: true, entity: {} },
      ],
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(output[0].text).not.toContain("Failures:");
  });
});

describe("BulkCreateEntitiesInputSchema", () => {
  it("requires profileId, entityType, items", () => {
    const result = BulkCreateEntitiesInputSchema.safeParse({
      profileId: "p1",
      entityType: "campaign",
      items: [{ name: "Test" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty items array", () => {
    const result = BulkCreateEntitiesInputSchema.safeParse({
      profileId: "p1",
      entityType: "campaign",
      items: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 50 items", () => {
    const items = Array.from({ length: 51 }, (_, i) => ({ name: `Item ${i}` }));
    const result = BulkCreateEntitiesInputSchema.safeParse({
      profileId: "p1",
      entityType: "campaign",
      items,
    });
    expect(result.success).toBe(false);
  });
});
