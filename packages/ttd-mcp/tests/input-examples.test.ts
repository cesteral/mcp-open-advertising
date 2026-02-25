import { describe, it, expect } from "vitest";
import { archiveEntitiesTool } from "../src/mcp-server/tools/definitions/archive-entities.tool.js";
import { bulkCreateEntitiesTool } from "../src/mcp-server/tools/definitions/bulk-create-entities.tool.js";
import { bulkUpdateEntitiesTool } from "../src/mcp-server/tools/definitions/bulk-update-entities.tool.js";
import { bulkUpdateStatusTool } from "../src/mcp-server/tools/definitions/bulk-update-status.tool.js";
import { deleteEntityTool } from "../src/mcp-server/tools/definitions/delete-entity.tool.js";
import { getEntityTool } from "../src/mcp-server/tools/definitions/get-entity.tool.js";
import { listEntitiesTool } from "../src/mcp-server/tools/definitions/list-entities.tool.js";
import { validateEntityTool } from "../src/mcp-server/tools/definitions/validate-entity.tool.js";
import { downloadReportTool } from "../src/mcp-server/tools/definitions/download-report.tool.js";
import { getReportTool } from "../src/mcp-server/tools/definitions/get-report.tool.js";
import { graphqlBulkJobTool } from "../src/mcp-server/tools/definitions/graphql-bulk-job.tool.js";
import { graphqlCancelBulkJobTool } from "../src/mcp-server/tools/definitions/graphql-cancel-bulk-job.tool.js";
import { graphqlMutationBulkTool } from "../src/mcp-server/tools/definitions/graphql-mutation-bulk.tool.js";
import { graphqlQueryBulkTool } from "../src/mcp-server/tools/definitions/graphql-query-bulk.tool.js";

const toolsWithExamples = [
  archiveEntitiesTool,
  bulkCreateEntitiesTool,
  bulkUpdateEntitiesTool,
  bulkUpdateStatusTool,
  deleteEntityTool,
  getEntityTool,
  listEntitiesTool,
  validateEntityTool,
  downloadReportTool,
  getReportTool,
  graphqlBulkJobTool,
  graphqlCancelBulkJobTool,
  graphqlMutationBulkTool,
  graphqlQueryBulkTool,
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
