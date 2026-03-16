import { describe, it, expect } from "vitest";
import { UpdateConversionsInputSchema } from "../../src/mcp-server/tools/definitions/update-conversions.tool.js";

describe("UpdateConversionsInputSchema", () => {
  const validConversion = {
    conversionId: "conv_abc123",
    conversionTimestamp: "1700000000000",
    segmentationType: "FLOODLIGHT",
  };

  it("accepts valid update conversions input", () => {
    const result = UpdateConversionsInputSchema.safeParse({
      agencyId: "12345",
      advertiserId: "67890",
      conversions: [validConversion],
    });
    expect(result.success).toBe(true);
  });

  it("requires agencyId", () => {
    const result = UpdateConversionsInputSchema.safeParse({
      advertiserId: "67890",
      conversions: [validConversion],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty agencyId", () => {
    const result = UpdateConversionsInputSchema.safeParse({
      agencyId: "",
      advertiserId: "67890",
      conversions: [validConversion],
    });
    expect(result.success).toBe(false);
  });

  it("requires advertiserId", () => {
    const result = UpdateConversionsInputSchema.safeParse({
      agencyId: "12345",
      conversions: [validConversion],
    });
    expect(result.success).toBe(false);
  });

  it("requires at least one conversion", () => {
    const result = UpdateConversionsInputSchema.safeParse({
      agencyId: "12345",
      advertiserId: "67890",
      conversions: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 200 conversions", () => {
    const conversions = Array.from({ length: 201 }, (_, i) => ({
      conversionId: `conv-${i}`,
      conversionTimestamp: "1700000000000",
      segmentationType: "FLOODLIGHT",
    }));

    const result = UpdateConversionsInputSchema.safeParse({
      agencyId: "12345",
      advertiserId: "67890",
      conversions,
    });
    expect(result.success).toBe(false);
  });

  it("requires conversionId on each conversion", () => {
    const result = UpdateConversionsInputSchema.safeParse({
      agencyId: "12345",
      advertiserId: "67890",
      conversions: [{ conversionTimestamp: "1700000000000", segmentationType: "FLOODLIGHT" }],
    });
    expect(result.success).toBe(false);
  });

  it("requires conversionTimestamp on each conversion", () => {
    const result = UpdateConversionsInputSchema.safeParse({
      agencyId: "12345",
      advertiserId: "67890",
      conversions: [{ conversionId: "conv-1", segmentationType: "FLOODLIGHT" }],
    });
    expect(result.success).toBe(false);
  });

  it("defaults segmentationType to FLOODLIGHT", () => {
    const result = UpdateConversionsInputSchema.parse({
      agencyId: "12345",
      advertiserId: "67890",
      conversions: [{ conversionId: "conv-1", conversionTimestamp: "1700000000000" }],
    });
    expect(result.conversions[0].segmentationType).toBe("FLOODLIGHT");
  });

  it("accepts full conversion row with optional fields", () => {
    const result = UpdateConversionsInputSchema.safeParse({
      agencyId: "12345",
      advertiserId: "67890",
      conversions: [
        {
          clickId: "click-1",
          gclid: "EAIaIQobChMI...",
          conversionId: "conv-1",
          conversionTimestamp: "1700000000000",
          revenueMicros: "10000000",
          currencyCode: "USD",
          quantityMillis: "2000",
          segmentationType: "FLOODLIGHT",
          segmentationName: "Purchase",
          floodlightActivityId: "11111",
          type: "TRANSACTION",
          state: "ACTIVE",
          customMetric: [{ name: "metric1", value: 42 }],
          customDimension: [{ name: "dim1", value: "val1" }],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts state REMOVED for soft deletion", () => {
    const result = UpdateConversionsInputSchema.safeParse({
      agencyId: "12345",
      advertiserId: "67890",
      conversions: [{ ...validConversion, state: "REMOVED" }],
    });
    expect(result.success).toBe(true);
  });
});
