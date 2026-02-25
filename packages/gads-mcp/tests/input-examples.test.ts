import { describe, it, expect } from "vitest";
import { bulkUpdateStatusTool } from "../src/mcp-server/tools/definitions/bulk-update-status.tool.js";
import { getEntityTool } from "../src/mcp-server/tools/definitions/get-entity.tool.js";
import { listAccountsTool } from "../src/mcp-server/tools/definitions/list-accounts.tool.js";
import { listEntitiesTool } from "../src/mcp-server/tools/definitions/list-entities.tool.js";
import { removeEntityTool } from "../src/mcp-server/tools/definitions/remove-entity.tool.js";

const toolsWithExamples = [
  bulkUpdateStatusTool,
  getEntityTool,
  listAccountsTool,
  listEntitiesTool,
  removeEntityTool,
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
