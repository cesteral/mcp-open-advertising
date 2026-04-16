import { describe, it, expect } from "vitest";
import {
  getObjectShape,
  isBoundedReportViewInputSchema,
  getBoundedReportViewOutputMissingKeys,
} from "@cesteral/shared";
import { allTools } from "../src/mcp-server/tools/definitions/index.js";

describe("Cross-server contract compliance", () => {
  const toolNames = allTools.map((t) => t.name);
  const PREFIX = "sa360_";

  describe("required tool categories", () => {
    it("has list_entities tool", () => {
      expect(toolNames).toContain(`${PREFIX}list_entities`);
    });

    it("has get_entity tool", () => {
      expect(toolNames).toContain(`${PREFIX}get_entity`);
    });

    it("has list_accounts tool", () => {
      expect(toolNames).toContain(`${PREFIX}list_accounts`);
    });

    it("has search tool", () => {
      expect(toolNames).toContain(`${PREFIX}search`);
    });

    it("has insert_conversions tool", () => {
      expect(toolNames).toContain(`${PREFIX}insert_conversions`);
    });

    it("has validate_conversion tool", () => {
      expect(toolNames).toContain(`${PREFIX}validate_conversion`);
    });

    // SA360 is read-only for entities — no create/update/delete/bulk tools
  });

  describe("tool structure requirements", () => {
    for (const tool of allTools) {
      describe(tool.name, () => {
        it("has description longer than 10 chars", () => {
          expect(tool.description.length).toBeGreaterThan(10);
        });

        it("has title", () => {
          expect(typeof (tool as any).title).toBe("string");
          expect((tool as any).title.length).toBeGreaterThan(0);
        });

        it("has inputSchema with parse method", () => {
          expect(tool.inputSchema).toBeDefined();
          expect(typeof (tool.inputSchema as any).parse).toBe("function");
        });

        it("has at least 1 inputExample", () => {
          expect((tool as any).inputExamples).toBeDefined();
          expect((tool as any).inputExamples.length).toBeGreaterThanOrEqual(1);
        });

        it("has annotations with readOnlyHint", () => {
          expect((tool as any).annotations).toBeDefined();
          expect(typeof (tool as any).annotations.readOnlyHint).toBe("boolean");
        });

        it("has logic function", () => {
          expect(typeof (tool as any).logic).toBe("function");
        });

        it("has responseFormatter function", () => {
          expect(typeof (tool as any).responseFormatter).toBe("function");
        });

        it("canonical bulk tools expose standard bulk output fields", () => {
          const isCanonicalBulkTool = /_(bulk_update_status|bulk_create_entities|bulk_update_entities)$/.test(
            tool.name
          );
          if (!isCanonicalBulkTool) {
            expect(true).toBe(true);
            return;
          }

          expect((tool as any).outputSchema).toBeDefined();
          const shape = getObjectShape((tool as any).outputSchema);
          expect(shape).not.toBeNull();
          expect(shape).toHaveProperty("results");
          expect(shape).toHaveProperty("successCount");
          expect(shape).toHaveProperty("failureCount");
          expect(shape).toHaveProperty("timestamp");
        });
      });
    }
  });
});


describe("bounded report-view contract", () => {
  const reportTools = allTools.filter((t: any) =>
    isBoundedReportViewInputSchema(t.inputSchema)
  );

  if (reportTools.length === 0) {
    it("has no bounded report-view tools registered", () => {
      expect(reportTools).toEqual([]);
    });
  } else {
    for (const tool of reportTools) {
      it(`${tool.name} output schema includes bounded report-view fields`, () => {
        const missing = getBoundedReportViewOutputMissingKeys((tool as any).outputSchema);
        expect(missing).toEqual([]);
      });
    }
  }
});
