import { describe, it, expect } from "vitest";
import { gaqlSearchTool } from "../src/mcp-server/tools/definitions/gaql-search.tool.js";
import { createEntityTool } from "../src/mcp-server/tools/definitions/create-entity.tool.js";
import { bulkMutateTool } from "../src/mcp-server/tools/definitions/bulk-mutate.tool.js";

const toolsWithExamples = [
  gaqlSearchTool,
  createEntityTool,
  bulkMutateTool,
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
