import { describe, it, expect } from "vitest";
import { SearchFieldsInputSchema } from "../../src/mcp-server/tools/definitions/search-fields.tool.js";

describe("SearchFieldsInputSchema", () => {
  it("accepts valid query", () => {
    const result = SearchFieldsInputSchema.safeParse({
      query: "SELECT name FROM searchAds360Fields WHERE name LIKE 'campaign.%'",
    });
    expect(result.success).toBe(true);
  });

  it("requires query", () => {
    const result = SearchFieldsInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects empty query", () => {
    const result = SearchFieldsInputSchema.safeParse({ query: "" });
    expect(result.success).toBe(false);
  });

  it("defaults pageSize to 100", () => {
    const result = SearchFieldsInputSchema.parse({
      query: "SELECT name FROM searchAds360Fields",
    });
    expect(result.pageSize).toBe(100);
  });

  it("accepts custom pageSize", () => {
    const result = SearchFieldsInputSchema.safeParse({
      query: "SELECT name FROM searchAds360Fields",
      pageSize: 200,
    });
    expect(result.success).toBe(true);
  });

  it("rejects pageSize over 1000", () => {
    const result = SearchFieldsInputSchema.safeParse({
      query: "SELECT name FROM searchAds360Fields",
      pageSize: 1001,
    });
    expect(result.success).toBe(false);
  });

  it("rejects pageSize less than 1", () => {
    const result = SearchFieldsInputSchema.safeParse({
      query: "SELECT name FROM searchAds360Fields",
      pageSize: 0,
    });
    expect(result.success).toBe(false);
  });
});
