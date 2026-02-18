import { describe, it, expect } from "vitest";
import { BulkUpdateStatusInputSchema } from "../../src/mcp-server/tools/definitions/bulk-update-status.tool.js";

describe("BulkUpdateStatusInputSchema", () => {
  it("accepts valid bulk update status input", () => {
    const result = BulkUpdateStatusInputSchema.safeParse({
      entityType: "campaign",
      customerId: "1234567890",
      entityIds: ["111", "222", "333"],
      status: "PAUSED",
    });
    expect(result.success).toBe(true);
  });

  it("accepts ENABLED status", () => {
    const result = BulkUpdateStatusInputSchema.safeParse({
      entityType: "adGroup",
      customerId: "1234567890",
      entityIds: ["111"],
      status: "ENABLED",
    });
    expect(result.success).toBe(true);
  });

  it("accepts REMOVED status", () => {
    const result = BulkUpdateStatusInputSchema.safeParse({
      entityType: "campaign",
      customerId: "1234567890",
      entityIds: ["111"],
      status: "REMOVED",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status value", () => {
    const result = BulkUpdateStatusInputSchema.safeParse({
      entityType: "campaign",
      customerId: "1234567890",
      entityIds: ["111"],
      status: "ARCHIVED",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty entityIds array", () => {
    const result = BulkUpdateStatusInputSchema.safeParse({
      entityType: "campaign",
      customerId: "1234567890",
      entityIds: [],
      status: "PAUSED",
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 100 entity IDs", () => {
    const ids = Array.from({ length: 101 }, (_, i) => String(i));
    const result = BulkUpdateStatusInputSchema.safeParse({
      entityType: "campaign",
      customerId: "1234567890",
      entityIds: ids,
      status: "PAUSED",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing customerId", () => {
    const result = BulkUpdateStatusInputSchema.safeParse({
      entityType: "campaign",
      entityIds: ["111"],
      status: "PAUSED",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid entity type", () => {
    const result = BulkUpdateStatusInputSchema.safeParse({
      entityType: "invalidType",
      customerId: "1234567890",
      entityIds: ["111"],
      status: "PAUSED",
    });
    expect(result.success).toBe(false);
  });

  it("rejects campaignBudget (no statusField)", () => {
    const result = BulkUpdateStatusInputSchema.safeParse({
      entityType: "campaignBudget",
      customerId: "1234567890",
      entityIds: ["111"],
      status: "PAUSED",
    });
    expect(result.success).toBe(false);
  });

  it("rejects asset (no statusField)", () => {
    const result = BulkUpdateStatusInputSchema.safeParse({
      entityType: "asset",
      customerId: "1234567890",
      entityIds: ["111"],
      status: "ENABLED",
    });
    expect(result.success).toBe(false);
  });

  it("requires composite ID for ad entity type", () => {
    const result = BulkUpdateStatusInputSchema.safeParse({
      entityType: "ad",
      customerId: "1234567890",
      entityIds: ["111"],
      status: "PAUSED",
    });
    expect(result.success).toBe(false);
  });

  it("accepts composite ID for ad entity type", () => {
    const result = BulkUpdateStatusInputSchema.safeParse({
      entityType: "ad",
      customerId: "1234567890",
      entityIds: ["222~111"],
      status: "PAUSED",
    });
    expect(result.success).toBe(true);
  });

  it("rejects malformed composite IDs in entityIds array", () => {
    const malformed = ["~", "123~", "~456", "1~2~3", "abc~def"];
    for (const id of malformed) {
      const result = BulkUpdateStatusInputSchema.safeParse({
        entityType: "ad",
        customerId: "1234567890",
        entityIds: [id],
        status: "PAUSED",
      });
      expect(result.success, `expected "${id}" to be rejected`).toBe(false);
    }
  });
});
