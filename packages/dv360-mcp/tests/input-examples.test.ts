import { describe, it, expect } from "vitest";
import { createEntityTool } from "../src/mcp-server/tools/definitions/create-entity.tool.js";
import { updateEntityTool } from "../src/mcp-server/tools/definitions/update-entity.tool.js";
import { createAssignedTargetingTool } from "../src/mcp-server/tools/definitions/create-assigned-targeting.tool.js";
import { adjustLineItemBidsTool } from "../src/mcp-server/tools/definitions/adjust-line-item-bids.tool.js";

const toolsWithExamples = [
  createEntityTool,
  updateEntityTool,
  createAssignedTargetingTool,
  adjustLineItemBidsTool,
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
