import { describe, it, expect } from "vitest";
import { listEntitiesTool } from "../src/mcp-server/tools/definitions/list-entities.tool.js";
import { getEntityTool } from "../src/mcp-server/tools/definitions/get-entity.tool.js";
import { createEntityTool } from "../src/mcp-server/tools/definitions/create-entity.tool.js";
import { updateEntityTool } from "../src/mcp-server/tools/definitions/update-entity.tool.js";
import { deleteEntityTool } from "../src/mcp-server/tools/definitions/delete-entity.tool.js";
import { listAdAccountsTool } from "../src/mcp-server/tools/definitions/list-ad-accounts.tool.js";
import { getInsightsTool } from "../src/mcp-server/tools/definitions/get-insights.tool.js";
import { getInsightsBreakdownsTool } from "../src/mcp-server/tools/definitions/get-insights-breakdowns.tool.js";
import { bulkUpdateStatusTool } from "../src/mcp-server/tools/definitions/bulk-update-status.tool.js";
import { bulkCreateEntitiesTool } from "../src/mcp-server/tools/definitions/bulk-create-entities.tool.js";
import { searchTargetingTool } from "../src/mcp-server/tools/definitions/search-targeting.tool.js";
import { getTargetingOptionsTool } from "../src/mcp-server/tools/definitions/get-targeting-options.tool.js";
import { duplicateEntityTool } from "../src/mcp-server/tools/definitions/duplicate-entity.tool.js";
import { getDeliveryEstimateTool } from "../src/mcp-server/tools/definitions/get-delivery-estimate.tool.js";
import { getAdPreviewTool } from "../src/mcp-server/tools/definitions/get-ad-preview.tool.js";

const toolsWithExamples = [
  listEntitiesTool,
  getEntityTool,
  createEntityTool,
  updateEntityTool,
  deleteEntityTool,
  listAdAccountsTool,
  getInsightsTool,
  getInsightsBreakdownsTool,
  bulkUpdateStatusTool,
  bulkCreateEntitiesTool,
  searchTargetingTool,
  getTargetingOptionsTool,
  duplicateEntityTool,
  getDeliveryEstimateTool,
  getAdPreviewTool,
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
            expect(result.error.issues).toEqual([]);
          }
          expect(result.success).toBe(true);
        });
      }
    });
  }
});
