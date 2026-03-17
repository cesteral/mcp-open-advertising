import { describe, it, expect } from "vitest";
import { getObjectShape } from "@cesteral/shared";
import { allTools } from "../src/mcp-server/tools/definitions/index.js";

describe("Cross-server contract compliance", () => {
  const toolNames = allTools.map((t) => t.name);
  const PREFIX = "gads_";

  describe("required tool categories", () => {
    it("has list_entities tool", () => {
      expect(toolNames).toContain(`${PREFIX}list_entities`);
    });

    it("has get_entity tool", () => {
      expect(toolNames).toContain(`${PREFIX}get_entity`);
    });

    it("has create_entity tool", () => {
      expect(toolNames).toContain(`${PREFIX}create_entity`);
    });

    it("has update_entity tool", () => {
      expect(toolNames).toContain(`${PREFIX}update_entity`);
    });

    it("has delete or remove entity tool", () => {
      const hasDelete = toolNames.includes(`${PREFIX}delete_entity`);
      const hasRemove = toolNames.includes(`${PREFIX}remove_entity`);
      expect(hasDelete || hasRemove).toBe(true);
    });

    it("has bulk_update_status tool", () => {
      expect(toolNames).toContain(`${PREFIX}bulk_update_status`);
    });

    it("has bid adjustment tool", () => {
      const hasBids = toolNames.some(
        (n) =>
          n.includes("adjust_bids") || n.includes("adjust_line_item_bids")
      );
      expect(hasBids).toBe(true);
    });

    it("has validate_entity tool", () => {
      expect(toolNames).toContain(`${PREFIX}validate_entity`);
    });
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

  describe("mutating tool safety metadata", () => {
    it("marks bulk create as destructive", () => {
      expect(
        allTools.find((tool) => tool.name === "gads_bulk_create_entities")?.annotations.destructiveHint
      ).toBe(true);
    });
  });
});
