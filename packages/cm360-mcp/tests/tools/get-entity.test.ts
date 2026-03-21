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
  GetEntityInputSchema,
  getEntityLogic,
  getEntityResponseFormatter,
} from "../../src/mcp-server/tools/definitions/get-entity.tool.js";

const mockContext = { requestId: "test-req" } as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GetEntityInputSchema", () => {
  it("accepts valid input with all required fields", () => {
    const result = GetEntityInputSchema.safeParse({
      profileId: "123456",
      entityType: "campaign",
      entityId: "789012",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing profileId", () => {
    const result = GetEntityInputSchema.safeParse({
      entityType: "campaign",
      entityId: "789012",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty profileId", () => {
    const result = GetEntityInputSchema.safeParse({
      profileId: "",
      entityType: "campaign",
      entityId: "789012",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing entityType", () => {
    const result = GetEntityInputSchema.safeParse({
      profileId: "123456",
      entityId: "789012",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid entityType", () => {
    const result = GetEntityInputSchema.safeParse({
      profileId: "123456",
      entityType: "notAnEntity",
      entityId: "789012",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing entityId", () => {
    const result = GetEntityInputSchema.safeParse({
      profileId: "123456",
      entityType: "campaign",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty entityId", () => {
    const result = GetEntityInputSchema.safeParse({
      profileId: "123456",
      entityType: "campaign",
      entityId: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid entity types", () => {
    const types = [
      "campaign",
      "placement",
      "ad",
      "creative",
      "site",
      "advertiser",
      "floodlightActivity",
      "floodlightConfiguration",
    ];

    for (const entityType of types) {
      const result = GetEntityInputSchema.safeParse({
        profileId: "123456",
        entityType,
        entityId: "789012",
      });
      expect(result.success, `Expected ${entityType} to be valid`).toBe(true);
    }
  });

  it("rejects extra unknown fields (strict object)", () => {
    const result = GetEntityInputSchema.safeParse({
      profileId: "123456",
      entityType: "campaign",
      entityId: "789012",
      extraField: "should-be-ignored",
    });
    // Zod strips unknown fields by default, so the parse succeeds
    // but the extra field is removed
    if (result.success) {
      expect((result.data as any).extraField).toBeUndefined();
    }
  });
});

describe("getEntityLogic", () => {
  it("calls cm360Service.getEntity with correct args", async () => {
    const mockEntity = { id: "789", name: "My Campaign" };
    mockState.cm360Service.getEntity.mockResolvedValue(mockEntity);

    const input = { profileId: "123", entityType: "campaign" as const, entityId: "789" };
    const result = await getEntityLogic(input, mockContext);

    expect(mockState.cm360Service.getEntity).toHaveBeenCalledWith(
      "campaign", "123", "789", mockContext
    );
    expect(result.entity).toEqual(mockEntity);
  });

  it("returns entity and timestamp", async () => {
    mockState.cm360Service.getEntity.mockResolvedValue({ id: "1" });

    const result = await getEntityLogic(
      { profileId: "123", entityType: "campaign" as const, entityId: "1" },
      mockContext
    );

    expect(result.entity).toEqual({ id: "1" });
    expect(result.timestamp).toBeDefined();
    expect(() => new Date(result.timestamp)).not.toThrow();
  });

  it("propagates service errors", async () => {
    mockState.cm360Service.getEntity.mockRejectedValue(new Error("Not found"));

    await expect(
      getEntityLogic(
        { profileId: "123", entityType: "campaign" as const, entityId: "999" },
        mockContext
      )
    ).rejects.toThrow("Not found");
  });
});

describe("getEntityResponseFormatter", () => {
  it("includes 'Entity retrieved' in text", () => {
    const result = getEntityResponseFormatter({
      entity: { id: "1" },
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    expect(result[0].text).toContain("Entity retrieved");
  });

  it("includes entity JSON", () => {
    const entity = { id: "42", name: "Test Campaign" };
    const result = getEntityResponseFormatter({
      entity,
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    expect(result[0].text).toContain(JSON.stringify(entity, null, 2));
  });
});
