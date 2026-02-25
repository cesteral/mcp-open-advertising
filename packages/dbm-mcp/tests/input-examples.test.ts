import { describe, it, expect } from "vitest";
import { getCampaignDeliveryTool } from "../src/mcp-server/tools/definitions/get-campaign-delivery.tool.js";
import { getPerformanceMetricsTool } from "../src/mcp-server/tools/definitions/get-performance-metrics.tool.js";
import { getHistoricalMetricsTool } from "../src/mcp-server/tools/definitions/get-historical-metrics.tool.js";
import { getPacingStatusTool } from "../src/mcp-server/tools/definitions/get-pacing-status.tool.js";

const toolsWithExamples = [
  getCampaignDeliveryTool,
  getPerformanceMetricsTool,
  getHistoricalMetricsTool,
  getPacingStatusTool,
] as const;

describe("Input examples validation", () => {
  for (const tool of toolsWithExamples) {
    describe(tool.name, () => {
      it("has inputExamples defined", () => {
        expect(tool.inputExamples).toBeDefined();
        expect(tool.inputExamples!.length).toBeGreaterThan(0);
      });

      for (const example of tool.inputExamples ?? []) {
        it(`validates: ${example.label}`, () => {
          const result = tool.inputSchema.safeParse(example.input);
          if (!result.success) {
            // Include Zod errors for debugging
            expect(result.error.issues).toEqual([]);
          }
          expect(result.success).toBe(true);
        });
      }
    });
  }
});
