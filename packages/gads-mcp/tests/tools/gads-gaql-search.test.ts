import { describe, it, expect } from "vitest";
import { GAQLSearchInputSchema } from "../../src/mcp-server/tools/definitions/gaql-search.tool.js";

describe("GAQLSearchInputSchema", () => {
  it("accepts valid GAQL search input", () => {
    const result = GAQLSearchInputSchema.safeParse({
      customerId: "1234567890",
      query: "SELECT campaign.id FROM campaign",
    });
    expect(result.success).toBe(true);
  });

  it("defaults to summary mode without a legacy pageSize", () => {
    const result = GAQLSearchInputSchema.parse({
      customerId: "1234567890",
      query: "SELECT campaign.id FROM campaign",
    });
    expect(result.pageSize).toBeUndefined();
    expect(result.mode).toBe("summary");
  });

  it("rejects empty customerId", () => {
    const result = GAQLSearchInputSchema.safeParse({
      customerId: "",
      query: "SELECT campaign.id FROM campaign",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty query", () => {
    const result = GAQLSearchInputSchema.safeParse({
      customerId: "1234567890",
      query: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects pageSize over 10000", () => {
    const result = GAQLSearchInputSchema.safeParse({
      customerId: "1234567890",
      query: "SELECT campaign.id FROM campaign",
      pageSize: 10001,
    });
    expect(result.success).toBe(false);
  });

  it("accepts pageToken for pagination", () => {
    const result = GAQLSearchInputSchema.safeParse({
      customerId: "1234567890",
      query: "SELECT campaign.id FROM campaign",
      pageToken: "abc123",
    });
    expect(result.success).toBe(true);
  });
});
