import { describe, it, expect } from "vitest";
import { createEntityTool } from "../src/mcp-server/tools/definitions/create-entity.tool.js";
import { updateEntityTool } from "../src/mcp-server/tools/definitions/update-entity.tool.js";
import { graphqlQueryTool } from "../src/mcp-server/tools/definitions/graphql-query.tool.js";
import { adjustBidsTool } from "../src/mcp-server/tools/definitions/adjust-bids.tool.js";

const toolsWithExamples = [
  createEntityTool,
  updateEntityTool,
  graphqlQueryTool,
  adjustBidsTool,
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
