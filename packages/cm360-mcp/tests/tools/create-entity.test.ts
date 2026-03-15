import { describe, it, expect } from "vitest";
import { CreateEntityInputSchema } from "../../src/mcp-server/tools/definitions/create-entity.tool.js";

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
