import { describe, it, expect } from "vitest";
import {
  validateEntityLogic,
  ValidateEntityInputSchema,
} from "../../src/mcp-server/tools/definitions/validate-entity.tool.js";

const mockContext = { requestId: "test-req" } as any;

describe("validateEntityLogic", () => {
  it("update mode without id returns error", async () => {
    const result = await validateEntityLogic(
      { entityType: "campaign", mode: "update", data: { name: "Test" } },
      mockContext
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining("id field is required for update mode")
    );
  });

  it("create mode with id returns warning", async () => {
    const result = await validateEntityLogic(
      {
        entityType: "campaign",
        mode: "create",
        data: { id: "123", name: "Test", advertiserId: "456" },
      },
      mockContext
    );
    expect(result.warnings).toContainEqual(
      expect.stringContaining("id field is typically auto-generated")
    );
  });

  it("campaign create without advertiserId returns error", async () => {
    const result = await validateEntityLogic(
      { entityType: "campaign", mode: "create", data: { name: "Test" } },
      mockContext
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining("advertiserId is required"));
  });

  it("campaign create with advertiserId is valid", async () => {
    const result = await validateEntityLogic(
      { entityType: "campaign", mode: "create", data: { name: "Test", advertiserId: "456" } },
      mockContext
    );
    expect(result.valid).toBe(true);
  });

  it("placement create without campaignId returns error", async () => {
    const result = await validateEntityLogic(
      { entityType: "placement", mode: "create", data: { name: "Test", siteId: "1" } },
      mockContext
    );
    expect(result.errors).toContainEqual(expect.stringContaining("campaignId is required"));
  });

  it("placement create without siteId returns warning", async () => {
    const result = await validateEntityLogic(
      { entityType: "placement", mode: "create", data: { name: "Test", campaignId: "1" } },
      mockContext
    );
    expect(result.warnings).toContainEqual(expect.stringContaining("siteId is typically required"));
  });

  it("ad create without campaignId returns error", async () => {
    const result = await validateEntityLogic(
      { entityType: "ad", mode: "create", data: { name: "Test" } },
      mockContext
    );
    expect(result.errors).toContainEqual(expect.stringContaining("campaignId is required"));
  });

  it("floodlightActivity create without floodlightConfigurationId returns error", async () => {
    const result = await validateEntityLogic(
      { entityType: "floodlightActivity", mode: "create", data: { name: "Test" } },
      mockContext
    );
    expect(result.errors).toContainEqual(
      expect.stringContaining("floodlightConfigurationId is required")
    );
  });

  it("entities without name get a warning", async () => {
    const typesRequiringName = [
      "campaign",
      "placement",
      "ad",
      "creative",
      "site",
      "floodlightActivity",
    ] as const;

    for (const entityType of typesRequiringName) {
      const result = await validateEntityLogic(
        { entityType, mode: "update", data: { id: "1" } },
        mockContext
      );
      expect(result.warnings).toContainEqual(
        expect.stringContaining("name field is typically required")
      );
    }
  });

  it("valid payload returns no errors or warnings", async () => {
    const result = await validateEntityLogic(
      {
        entityType: "campaign",
        mode: "create",
        data: { name: "Q1 Campaign", advertiserId: "789" },
      },
      mockContext
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("result includes entityType and mode fields", async () => {
    const result = await validateEntityLogic(
      { entityType: "placement", mode: "update", data: { id: "1", name: "Test" } },
      mockContext
    );
    expect(result.entityType).toBe("placement");
    expect(result.mode).toBe("update");
  });
});

describe("ValidateEntityInputSchema", () => {
  it("accepts all entity types", () => {
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
      const result = ValidateEntityInputSchema.safeParse({
        entityType,
        mode: "create",
        data: {},
      });
      expect(result.success, `Expected ${entityType} to be valid`).toBe(true);
    }
  });

  it("rejects invalid entityType", () => {
    const result = ValidateEntityInputSchema.safeParse({
      entityType: "widget",
      mode: "create",
      data: {},
    });
    expect(result.success).toBe(false);
  });

  it("requires mode to be create or update", () => {
    for (const mode of ["create", "update"]) {
      const result = ValidateEntityInputSchema.safeParse({
        entityType: "campaign",
        mode,
        data: {},
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid mode", () => {
    const result = ValidateEntityInputSchema.safeParse({
      entityType: "campaign",
      mode: "delete",
      data: {},
    });
    expect(result.success).toBe(false);
  });

  it("requires data object", () => {
    const result = ValidateEntityInputSchema.safeParse({
      entityType: "campaign",
      mode: "create",
    });
    expect(result.success).toBe(false);
  });
});
