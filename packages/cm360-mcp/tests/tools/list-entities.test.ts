import { describe, it, expect } from "vitest";
import { ListEntitiesInputSchema } from "../../src/mcp-server/tools/definitions/list-entities.tool.js";

describe("ListEntitiesInputSchema", () => {
  it("accepts valid input with required fields", () => {
    const result = ListEntitiesInputSchema.safeParse({
      profileId: "123456",
      entityType: "campaign",
    });
    expect(result.success).toBe(true);
  });

  it("accepts all supported entity types", () => {
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
      const result = ListEntitiesInputSchema.safeParse({
        profileId: "123456",
        entityType,
      });
      expect(result.success, `Expected ${entityType} to be valid`).toBe(true);
    }
  });

  it("rejects invalid entity type", () => {
    const result = ListEntitiesInputSchema.safeParse({
      profileId: "123456",
      entityType: "invalidType",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty profileId", () => {
    const result = ListEntitiesInputSchema.safeParse({
      profileId: "",
      entityType: "campaign",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing profileId", () => {
    const result = ListEntitiesInputSchema.safeParse({
      entityType: "campaign",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing entityType", () => {
    const result = ListEntitiesInputSchema.safeParse({
      profileId: "123456",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional filters", () => {
    const result = ListEntitiesInputSchema.safeParse({
      profileId: "123456",
      entityType: "campaign",
      filters: { advertiserId: "789", searchString: "test" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filters).toEqual({ advertiserId: "789", searchString: "test" });
    }
  });

  it("accepts optional pageToken", () => {
    const result = ListEntitiesInputSchema.safeParse({
      profileId: "123456",
      entityType: "campaign",
      pageToken: "abc123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pageToken).toBe("abc123");
    }
  });

  it("accepts optional maxResults within range", () => {
    const result = ListEntitiesInputSchema.safeParse({
      profileId: "123456",
      entityType: "campaign",
      maxResults: 50,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxResults).toBe(50);
    }
  });

  it("rejects maxResults below 1", () => {
    const result = ListEntitiesInputSchema.safeParse({
      profileId: "123456",
      entityType: "campaign",
      maxResults: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects maxResults above 1000", () => {
    const result = ListEntitiesInputSchema.safeParse({
      profileId: "123456",
      entityType: "campaign",
      maxResults: 1001,
    });
    expect(result.success).toBe(false);
  });

  it("accepts maxResults at boundaries (1 and 1000)", () => {
    const min = ListEntitiesInputSchema.safeParse({
      profileId: "123456",
      entityType: "campaign",
      maxResults: 1,
    });
    expect(min.success).toBe(true);

    const max = ListEntitiesInputSchema.safeParse({
      profileId: "123456",
      entityType: "campaign",
      maxResults: 1000,
    });
    expect(max.success).toBe(true);
  });
});
