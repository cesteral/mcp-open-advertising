import { describe, it, expect } from "vitest";
import { listUserProfilesTool } from "../src/mcp-server/tools/definitions/list-user-profiles.tool.js";
import { listEntitiesTool } from "../src/mcp-server/tools/definitions/list-entities.tool.js";
import { getEntityTool } from "../src/mcp-server/tools/definitions/get-entity.tool.js";
import { createEntityTool } from "../src/mcp-server/tools/definitions/create-entity.tool.js";
import { updateEntityTool } from "../src/mcp-server/tools/definitions/update-entity.tool.js";
import { deleteEntityTool } from "../src/mcp-server/tools/definitions/delete-entity.tool.js";
import { validateEntityTool } from "../src/mcp-server/tools/definitions/validate-entity.tool.js";
import { getReportTool } from "../src/mcp-server/tools/definitions/get-report.tool.js";
import { submitReportTool } from "../src/mcp-server/tools/definitions/submit-report.tool.js";
import { checkReportStatusTool } from "../src/mcp-server/tools/definitions/check-report-status.tool.js";
import { downloadReportTool } from "../src/mcp-server/tools/definitions/download-report.tool.js";
import { bulkUpdateStatusTool } from "../src/mcp-server/tools/definitions/bulk-update-status.tool.js";
import { bulkCreateEntitiesTool } from "../src/mcp-server/tools/definitions/bulk-create-entities.tool.js";
import { bulkUpdateEntitiesTool } from "../src/mcp-server/tools/definitions/bulk-update-entities.tool.js";
import { getAdPreviewTool } from "../src/mcp-server/tools/definitions/get-ad-preview.tool.js";
import { listTargetingOptionsTool } from "../src/mcp-server/tools/definitions/list-targeting-options.tool.js";

const toolsWithExamples = [
  listUserProfilesTool,
  listEntitiesTool,
  getEntityTool,
  createEntityTool,
  updateEntityTool,
  deleteEntityTool,
  validateEntityTool,
  getReportTool,
  submitReportTool,
  checkReportStatusTool,
  downloadReportTool,
  bulkUpdateStatusTool,
  bulkCreateEntitiesTool,
  bulkUpdateEntitiesTool,
  getAdPreviewTool,
  listTargetingOptionsTool,
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
