import { describe, it, expect } from "vitest";
import { runCustomQueryTool } from "../src/mcp-server/tools/definitions/run-custom-query.tool.js";

const toolsWithExamples = [
  runCustomQueryTool,
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
