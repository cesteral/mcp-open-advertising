import { describe, it, expect } from "vitest";
import { sa360SearchTool } from "../src/mcp-server/tools/definitions/sa360-search.tool.js";
import { listAccountsTool } from "../src/mcp-server/tools/definitions/list-accounts.tool.js";
import { getEntityTool } from "../src/mcp-server/tools/definitions/get-entity.tool.js";
import { listEntitiesTool } from "../src/mcp-server/tools/definitions/list-entities.tool.js";
import { getInsightsTool } from "../src/mcp-server/tools/definitions/get-insights.tool.js";
import { getInsightsBreakdownsTool } from "../src/mcp-server/tools/definitions/get-insights-breakdowns.tool.js";
import { listCustomColumnsTool } from "../src/mcp-server/tools/definitions/list-custom-columns.tool.js";
import { searchFieldsTool } from "../src/mcp-server/tools/definitions/search-fields.tool.js";
import { insertConversionsTool } from "../src/mcp-server/tools/definitions/insert-conversions.tool.js";
import { updateConversionsTool } from "../src/mcp-server/tools/definitions/update-conversions.tool.js";
import { validateConversionTool } from "../src/mcp-server/tools/definitions/validate-conversion.tool.js";

const toolsWithExamples = [
  sa360SearchTool,
  listAccountsTool,
  getEntityTool,
  listEntitiesTool,
  getInsightsTool,
  getInsightsBreakdownsTool,
  listCustomColumnsTool,
  searchFieldsTool,
  insertConversionsTool,
  updateConversionsTool,
  validateConversionTool,
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
