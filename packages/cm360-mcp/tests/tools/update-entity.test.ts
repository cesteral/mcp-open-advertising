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
  updateEntityLogic,
  updateEntityResponseFormatter,
  UpdateEntityInputSchema,
} from "../../src/mcp-server/tools/definitions/update-entity.tool.js";

const mockContext = { requestId: "test-req" } as any;

describe("updateEntityLogic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls cm360Service.updateEntity with data that includes id from entityId", async () => {
    const updatedEntity = { id: "entity-1", name: "Updated Campaign" };
    mockState.cm360Service.updateEntity.mockResolvedValue(updatedEntity);

    await updateEntityLogic(
      {
        profileId: "prof-1",
        entityType: "campaign",
        entityId: "entity-1",
        data: { name: "Updated Campaign", advertiserId: "adv-1" },
      },
      mockContext
    );

    expect(mockState.cm360Service.updateEntity).toHaveBeenCalledWith(
      "campaign",
      "prof-1",
      { name: "Updated Campaign", advertiserId: "adv-1", id: "entity-1" },
      mockContext
    );
  });

  it("returns entity and timestamp", async () => {
    const updatedEntity = { id: "entity-1", name: "Updated" };
    mockState.cm360Service.updateEntity.mockResolvedValue(updatedEntity);

    const result = await updateEntityLogic(
      {
        profileId: "prof-1",
        entityType: "campaign",
        entityId: "entity-1",
        data: { name: "Updated" },
      },
      mockContext
    );

    expect(result.entity).toEqual(updatedEntity);
    expect(result.timestamp).toBeDefined();
    expect(new Date(result.timestamp).getTime()).not.toBeNaN();
  });

  it("propagates service errors", async () => {
    mockState.cm360Service.updateEntity.mockRejectedValue(new Error("API error"));

    await expect(
      updateEntityLogic(
        {
          profileId: "prof-1",
          entityType: "campaign",
          entityId: "entity-1",
          data: { name: "Fail" },
        },
        mockContext
      )
    ).rejects.toThrow("API error");
  });
});

describe("updateEntityResponseFormatter", () => {
  it("includes entity JSON in output", () => {
    const result = updateEntityResponseFormatter({
      entity: { id: "123", name: "Test" },
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(result[0].text).toContain('"id": "123"');
    expect(result[0].text).toContain('"name": "Test"');
  });

  it("includes timestamp", () => {
    const result = updateEntityResponseFormatter({
      entity: { id: "123" },
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(result[0].text).toContain("2026-01-01T00:00:00.000Z");
  });
});

describe("UpdateEntityInputSchema", () => {
  it("requires profileId, entityType, entityId, data", () => {
    const valid = UpdateEntityInputSchema.safeParse({
      profileId: "123",
      entityType: "campaign",
      entityId: "456",
      data: { name: "Test" },
    });
    expect(valid.success).toBe(true);
  });

  it("rejects empty profileId", () => {
    const result = UpdateEntityInputSchema.safeParse({
      profileId: "",
      entityType: "campaign",
      entityId: "456",
      data: { name: "Test" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty entityId", () => {
    const result = UpdateEntityInputSchema.safeParse({
      profileId: "123",
      entityType: "campaign",
      entityId: "",
      data: { name: "Test" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid entityType", () => {
    const result = UpdateEntityInputSchema.safeParse({
      profileId: "123",
      entityType: "widget",
      entityId: "456",
      data: { name: "Test" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid entity types", () => {
    const types = [
      "campaign", "placement", "ad", "creative", "site",
      "advertiser", "floodlightActivity", "floodlightConfiguration",
    ];

    for (const entityType of types) {
      const result = UpdateEntityInputSchema.safeParse({
        profileId: "123",
        entityType,
        entityId: "456",
        data: { name: "Test" },
      });
      expect(result.success, `Expected ${entityType} to be valid`).toBe(true);
    }
  });
});
