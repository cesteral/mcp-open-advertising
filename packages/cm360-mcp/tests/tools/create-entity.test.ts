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
  CreateEntityInputSchema,
  createEntityLogic,
  createEntityResponseFormatter,
} from "../../src/mcp-server/tools/definitions/create-entity.tool.js";

const mockContext = { requestId: "test-req" } as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CreateEntityInputSchema", () => {
  it("accepts valid input with all required fields", () => {
    const result = CreateEntityInputSchema.safeParse({
      profileId: "123456",
      entityType: "campaign",
      data: { name: "Test Campaign", advertiserId: "789" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing profileId", () => {
    const result = CreateEntityInputSchema.safeParse({
      entityType: "campaign",
      data: { name: "Test" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty profileId", () => {
    const result = CreateEntityInputSchema.safeParse({
      profileId: "",
      entityType: "campaign",
      data: { name: "Test" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing entityType", () => {
    const result = CreateEntityInputSchema.safeParse({
      profileId: "123456",
      data: { name: "Test" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid entityType", () => {
    const result = CreateEntityInputSchema.safeParse({
      profileId: "123456",
      entityType: "widget",
      data: { name: "Test" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing data", () => {
    const result = CreateEntityInputSchema.safeParse({
      profileId: "123456",
      entityType: "campaign",
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
      const result = CreateEntityInputSchema.safeParse({
        profileId: "123456",
        entityType,
        data: { name: "Test" },
      });
      expect(result.success, `Expected ${entityType} to be valid`).toBe(true);
    }
  });

  it("accepts data with nested objects", () => {
    const result = CreateEntityInputSchema.safeParse({
      profileId: "123456",
      entityType: "placement",
      data: {
        name: "Test Placement",
        campaignId: "111",
        siteId: "222",
        compatibility: "DISPLAY",
        size: { width: 300, height: 250 },
        tagFormats: ["PLACEMENT_TAG_STANDARD"],
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty data object", () => {
    const result = CreateEntityInputSchema.safeParse({
      profileId: "123456",
      entityType: "campaign",
      data: {},
    });
    expect(result.success).toBe(true);
  });

  it("preserves data fields in parsed output", () => {
    const data = { name: "My Campaign", advertiserId: "999", startDate: "2026-01-01" };
    const result = CreateEntityInputSchema.parse({
      profileId: "123456",
      entityType: "campaign",
      data,
    });
    expect(result.data).toEqual(data);
  });
});

describe("createEntityLogic", () => {
  it("calls cm360Service.createEntity with correct args", async () => {
    const mockEntity = { id: "999", name: "New Campaign" };
    mockState.cm360Service.createEntity.mockResolvedValue(mockEntity);

    const input = {
      profileId: "123",
      entityType: "campaign" as const,
      data: { name: "New Campaign" },
    };
    const result = await createEntityLogic(input, mockContext);

    expect(mockState.cm360Service.createEntity).toHaveBeenCalledWith(
      "campaign",
      "123",
      { name: "New Campaign" },
      mockContext
    );
    expect(result.entity).toEqual(mockEntity);
  });

  it("returns entity and timestamp", async () => {
    mockState.cm360Service.createEntity.mockResolvedValue({ id: "1" });

    const result = await createEntityLogic(
      { profileId: "123", entityType: "campaign" as const, data: {} },
      mockContext
    );

    expect(result.entity).toEqual({ id: "1" });
    expect(result.timestamp).toBeDefined();
    expect(() => new Date(result.timestamp)).not.toThrow();
  });

  it("propagates service errors", async () => {
    mockState.cm360Service.createEntity.mockRejectedValue(new Error("API error"));

    await expect(
      createEntityLogic(
        { profileId: "123", entityType: "campaign" as const, data: {} },
        mockContext
      )
    ).rejects.toThrow("API error");
  });
});

describe("createEntityResponseFormatter", () => {
  it("includes 'Entity created successfully' in text", () => {
    const result = createEntityResponseFormatter({
      entity: { id: "1" },
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    expect(result[0].text).toContain("Entity created successfully");
  });

  it("includes entity JSON", () => {
    const entity = { id: "42", name: "Test" };
    const result = createEntityResponseFormatter({
      entity,
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    expect(result[0].text).toContain(JSON.stringify(entity, null, 2));
  });

  it("includes timestamp", () => {
    const ts = "2026-03-15T12:00:00.000Z";
    const result = createEntityResponseFormatter({
      entity: {},
      timestamp: ts,
    });
    expect(result[0].text).toContain(ts);
  });
});
