import { describe, it, expect } from "vitest";
import { bulkUpdateStatusTool } from "../src/mcp-server/tools/definitions/bulk-update-status.tool.js";
import { createCustomBiddingAlgorithmTool } from "../src/mcp-server/tools/definitions/create-custom-bidding-algorithm.tool.js";
import { deleteAssignedTargetingTool } from "../src/mcp-server/tools/definitions/delete-assigned-targeting.tool.js";
import { getAssignedTargetingTool } from "../src/mcp-server/tools/definitions/get-assigned-targeting.tool.js";
import { listAssignedTargetingTool } from "../src/mcp-server/tools/definitions/list-assigned-targeting.tool.js";
import { deleteEntityTool } from "../src/mcp-server/tools/definitions/delete-entity.tool.js";
import { getEntityTool } from "../src/mcp-server/tools/definitions/get-entity.tool.js";
import { listEntitiesTool } from "../src/mcp-server/tools/definitions/list-entities.tool.js";
import { listCustomBiddingAlgorithmsTool } from "../src/mcp-server/tools/definitions/list-custom-bidding-algorithms.tool.js";
import { manageCustomBiddingRulesTool } from "../src/mcp-server/tools/definitions/manage-custom-bidding-rules.tool.js";
import { manageCustomBiddingScriptTool } from "../src/mcp-server/tools/definitions/manage-custom-bidding-script.tool.js";
import { validateTargetingConfigTool } from "../src/mcp-server/tools/definitions/validate-targeting-config.tool.js";

const toolsWithExamples = [
  bulkUpdateStatusTool,
  createCustomBiddingAlgorithmTool,
  deleteAssignedTargetingTool,
  getAssignedTargetingTool,
  listAssignedTargetingTool,
  deleteEntityTool,
  getEntityTool,
  listEntitiesTool,
  listCustomBiddingAlgorithmsTool,
  manageCustomBiddingRulesTool,
  manageCustomBiddingScriptTool,
  validateTargetingConfigTool,
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
