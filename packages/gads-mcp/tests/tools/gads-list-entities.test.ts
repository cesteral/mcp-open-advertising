import { describe, it, expect } from "vitest";
import { ListEntitiesInputSchema } from "../../src/mcp-server/tools/definitions/list-entities.tool.js";

describe("ListEntitiesInputSchema", () => {
  it("accepts valid list entities input", () => {
    const result = ListEntitiesInputSchema.safeParse({
      entityType: "campaign",
      customerId: "1234567890",
    });
    expect(result.success).toBe(true);
  });

  it("defaults pageSize to 100", () => {
    const result = ListEntitiesInputSchema.parse({
      entityType: "campaign",
      customerId: "1234567890",
    });
    expect(result.pageSize).toBe(100);
  });

  it("rejects empty customerId", () => {
    const result = ListEntitiesInputSchema.safeParse({
      entityType: "campaign",
      customerId: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid entity type", () => {
    const result = ListEntitiesInputSchema.safeParse({
      entityType: "invalidType",
      customerId: "1234567890",
    });
    expect(result.success).toBe(false);
  });

  it("rejects pageSize over 10000", () => {
    const result = ListEntitiesInputSchema.safeParse({
      entityType: "campaign",
      customerId: "1234567890",
      pageSize: 10001,
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional filters", () => {
    const result = ListEntitiesInputSchema.safeParse({
      entityType: "campaign",
      customerId: "1234567890",
      filters: { "campaign.status": "= 'ENABLED'" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional orderBy", () => {
    const result = ListEntitiesInputSchema.safeParse({
      entityType: "campaign",
      customerId: "1234567890",
      orderBy: "campaign.name ASC",
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional pageToken", () => {
    const result = ListEntitiesInputSchema.safeParse({
      entityType: "campaign",
      customerId: "1234567890",
      pageToken: "nextPageToken123",
    });
    expect(result.success).toBe(true);
  });
});
