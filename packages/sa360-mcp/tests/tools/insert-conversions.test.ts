import { describe, it, expect } from "vitest";
import { InsertConversionsInputSchema } from "../../src/mcp-server/tools/definitions/insert-conversions.tool.js";

describe("InsertConversionsInputSchema", () => {
  const validConversion = {
    clickId: "EAIaIQobChMI...",
    conversionId: "order-1",
    conversionTimestamp: "1700000000000",
    segmentationType: "FLOODLIGHT",
  };

  it("accepts valid insert conversions input", () => {
    const result = InsertConversionsInputSchema.safeParse({
      agencyId: "12345",
      advertiserId: "67890",
      conversions: [validConversion],
    });
    expect(result.success).toBe(true);
  });

  it("requires agencyId", () => {
    const result = InsertConversionsInputSchema.safeParse({
      advertiserId: "67890",
      conversions: [validConversion],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty agencyId", () => {
    const result = InsertConversionsInputSchema.safeParse({
      agencyId: "",
      advertiserId: "67890",
      conversions: [validConversion],
    });
    expect(result.success).toBe(false);
  });

  it("requires advertiserId", () => {
    const result = InsertConversionsInputSchema.safeParse({
      agencyId: "12345",
      conversions: [validConversion],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty advertiserId", () => {
    const result = InsertConversionsInputSchema.safeParse({
      agencyId: "12345",
      advertiserId: "",
      conversions: [validConversion],
    });
    expect(result.success).toBe(false);
  });

  it("requires at least one conversion", () => {
    const result = InsertConversionsInputSchema.safeParse({
      agencyId: "12345",
      advertiserId: "67890",
      conversions: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 200 conversions", () => {
    const conversions = Array.from({ length: 201 }, (_, i) => ({
      clickId: `click-${i}`,
      conversionId: `order-${i}`,
      conversionTimestamp: "1700000000000",
      segmentationType: "FLOODLIGHT",
    }));

    const result = InsertConversionsInputSchema.safeParse({
      agencyId: "12345",
      advertiserId: "67890",
      conversions,
    });
    expect(result.success).toBe(false);
  });

  it("accepts 200 conversions (max)", () => {
    const conversions = Array.from({ length: 200 }, (_, i) => ({
      clickId: `click-${i}`,
      conversionId: `order-${i}`,
      conversionTimestamp: "1700000000000",
      segmentationType: "FLOODLIGHT",
    }));

    const result = InsertConversionsInputSchema.safeParse({
      agencyId: "12345",
      advertiserId: "67890",
      conversions,
    });
    expect(result.success).toBe(true);
  });

  it("requires conversionId on each conversion (advertiser-provided per the v2 schema)", () => {
    const { conversionId: _, ...withoutId } = validConversion;
    const result = InsertConversionsInputSchema.safeParse({
      agencyId: "12345",
      advertiserId: "67890",
      conversions: [withoutId],
    });
    expect(result.success).toBe(false);
  });

  it("requires conversionTimestamp on each conversion", () => {
    const result = InsertConversionsInputSchema.safeParse({
      agencyId: "12345",
      advertiserId: "67890",
      conversions: [
        { clickId: "click-1", conversionId: "order-1", segmentationType: "FLOODLIGHT" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("defaults segmentationType to FLOODLIGHT", () => {
    const result = InsertConversionsInputSchema.parse({
      agencyId: "12345",
      advertiserId: "67890",
      conversions: [
        { clickId: "click-1", conversionId: "order-1", conversionTimestamp: "1700000000000" },
      ],
    });
    expect(result.conversions[0].segmentationType).toBe("FLOODLIGHT");
  });

  it("accepts full conversion row with all optional fields", () => {
    const result = InsertConversionsInputSchema.safeParse({
      agencyId: "12345",
      advertiserId: "67890",
      conversions: [
        {
          clickId: "click-1",
          conversionId: "order-1",
          conversionTimestamp: "1700000000000",
          revenueMicros: "5000000",
          currencyCode: "USD",
          quantityMillis: "1000",
          segmentationType: "FLOODLIGHT",
          segmentationName: "Purchase",
          segmentationId: "11111",
          type: "TRANSACTION",
          state: "ACTIVE",
          customMetric: [{ name: "metric1", value: 42 }],
          customDimension: [{ name: "dim1", value: "val1" }],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid customMetric structure", () => {
    const result = InsertConversionsInputSchema.safeParse({
      agencyId: "12345",
      advertiserId: "67890",
      conversions: [
        {
          clickId: "click-1",
          conversionId: "order-1",
          conversionTimestamp: "1700000000000",
          segmentationType: "FLOODLIGHT",
          customMetric: [{ name: "metric1", value: "not-a-number" }],
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
