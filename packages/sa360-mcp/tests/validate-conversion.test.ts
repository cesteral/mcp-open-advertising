import { describe, it, expect } from "vitest";
import { validateConversionLogic } from "../src/mcp-server/tools/definitions/validate-conversion.tool.js";
import type { RequestContext } from "@cesteral/shared";

const mockContext: RequestContext = {
  requestId: "test-req-1",
  operation: "test",
  startTime: Date.now(),
};

describe("SA360 Validate Conversion", () => {
  describe("insert mode", () => {
    it("should pass for a valid insert conversion with gclid", async () => {
      const result = await validateConversionLogic(
        {
          mode: "insert",
          conversion: {
            gclid: "EAIaIQobChMI...",
            conversionTimestamp: "1700000000000",
            revenueMicros: "5000000",
            segmentationType: "FLOODLIGHT",
            floodlightActivityId: "11111",
            type: "TRANSACTION",
          },
        },
        mockContext
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should pass for a valid insert conversion with clickId", async () => {
      const result = await validateConversionLogic(
        {
          mode: "insert",
          conversion: {
            clickId: "abc123",
            conversionTimestamp: "1700000000000",
            segmentationType: "FLOODLIGHT",
            segmentationName: "My Floodlight Activity",
          },
        },
        mockContext
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should fail when neither clickId nor gclid is provided", async () => {
      const result = await validateConversionLogic(
        {
          mode: "insert",
          conversion: {
            conversionTimestamp: "1700000000000",
            segmentationType: "FLOODLIGHT",
            floodlightActivityId: "11111",
          },
        },
        mockContext
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining("clickId")
      );
    });

    it("should fail when conversionTimestamp is missing", async () => {
      const result = await validateConversionLogic(
        {
          mode: "insert",
          conversion: {
            gclid: "EAIaIQobChMI...",
            segmentationType: "FLOODLIGHT",
            floodlightActivityId: "11111",
          },
        },
        mockContext
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining("conversionTimestamp")
      );
    });

    it("should fail when conversionTimestamp is not numeric", async () => {
      const result = await validateConversionLogic(
        {
          mode: "insert",
          conversion: {
            gclid: "EAIaIQobChMI...",
            conversionTimestamp: "2024-01-15T10:00:00Z",
            segmentationType: "FLOODLIGHT",
            floodlightActivityId: "11111",
          },
        },
        mockContext
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining("numeric string")
      );
    });

    it("should fail when segmentationType is missing", async () => {
      const result = await validateConversionLogic(
        {
          mode: "insert",
          conversion: {
            gclid: "EAIaIQobChMI...",
            conversionTimestamp: "1700000000000",
            floodlightActivityId: "11111",
          },
        },
        mockContext
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining("segmentationType")
      );
    });

    it("should fail when neither segmentationName nor floodlightActivityId is provided", async () => {
      const result = await validateConversionLogic(
        {
          mode: "insert",
          conversion: {
            gclid: "EAIaIQobChMI...",
            conversionTimestamp: "1700000000000",
            segmentationType: "FLOODLIGHT",
          },
        },
        mockContext
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining("segmentationName")
      );
    });

    it("should fail when revenueMicros is not numeric", async () => {
      const result = await validateConversionLogic(
        {
          mode: "insert",
          conversion: {
            gclid: "EAIaIQobChMI...",
            conversionTimestamp: "1700000000000",
            revenueMicros: "five dollars",
            segmentationType: "FLOODLIGHT",
            floodlightActivityId: "11111",
          },
        },
        mockContext
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining("revenueMicros")
      );
    });

    it("should fail when state is invalid", async () => {
      const result = await validateConversionLogic(
        {
          mode: "insert",
          conversion: {
            gclid: "EAIaIQobChMI...",
            conversionTimestamp: "1700000000000",
            segmentationType: "FLOODLIGHT",
            floodlightActivityId: "11111",
            state: "INVALID_STATE",
          },
        },
        mockContext
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining("state")
      );
    });

    it("should warn when conversionId is set in insert mode", async () => {
      const result = await validateConversionLogic(
        {
          mode: "insert",
          conversion: {
            gclid: "EAIaIQobChMI...",
            conversionTimestamp: "1700000000000",
            conversionId: "conv_abc123",
            segmentationType: "FLOODLIGHT",
            floodlightActivityId: "11111",
          },
        },
        mockContext
      );
      expect(result.valid).toBe(true);
      expect(result.warnings).toContainEqual(
        expect.stringContaining("conversionId")
      );
    });

    it("should warn when conversionTimestamp looks like seconds instead of millis", async () => {
      const result = await validateConversionLogic(
        {
          mode: "insert",
          conversion: {
            gclid: "EAIaIQobChMI...",
            conversionTimestamp: "946684799999",
            segmentationType: "FLOODLIGHT",
            floodlightActivityId: "11111",
          },
        },
        mockContext
      );
      expect(result.warnings).toContainEqual(
        expect.stringContaining("before year 2000")
      );
    });

    it("should warn for non-ISO 4217 currencyCode", async () => {
      const result = await validateConversionLogic(
        {
          mode: "insert",
          conversion: {
            gclid: "EAIaIQobChMI...",
            conversionTimestamp: "1700000000000",
            currencyCode: "dollars",
            segmentationType: "FLOODLIGHT",
            floodlightActivityId: "11111",
          },
        },
        mockContext
      );
      expect(result.warnings).toContainEqual(
        expect.stringContaining("ISO 4217")
      );
    });
  });

  describe("update mode", () => {
    it("should pass for a valid update conversion", async () => {
      const result = await validateConversionLogic(
        {
          mode: "update",
          conversion: {
            gclid: "EAIaIQobChMI...",
            conversionId: "conv_abc123",
            conversionTimestamp: "1700000000000",
            revenueMicros: "10000000",
            segmentationType: "FLOODLIGHT",
            floodlightActivityId: "11111",
          },
        },
        mockContext
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should fail when conversionId is missing in update mode", async () => {
      const result = await validateConversionLogic(
        {
          mode: "update",
          conversion: {
            gclid: "EAIaIQobChMI...",
            conversionTimestamp: "1700000000000",
            segmentationType: "FLOODLIGHT",
            floodlightActivityId: "11111",
          },
        },
        mockContext
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining("conversionId")
      );
    });

    it("should allow state REMOVED for update mode", async () => {
      const result = await validateConversionLogic(
        {
          mode: "update",
          conversion: {
            gclid: "EAIaIQobChMI...",
            conversionId: "conv_abc123",
            conversionTimestamp: "1700000000000",
            segmentationType: "FLOODLIGHT",
            floodlightActivityId: "11111",
            state: "REMOVED",
          },
        },
        mockContext
      );
      expect(result.valid).toBe(true);
    });
  });
});
