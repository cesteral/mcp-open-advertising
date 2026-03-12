import { describe, it, expect } from "vitest";
import { allTools } from "../src/mcp-server/tools/index.js";

describe("Cross-server contract compliance", () => {
  const toolNames = allTools.map((t) => t.name);
  const PREFIX = "dbm_";

  describe("required reporting tool categories", () => {
    it("has get_campaign_delivery tool", () => {
      expect(toolNames).toContain(`${PREFIX}get_campaign_delivery`);
    });

    it("has get_performance_metrics tool", () => {
      expect(toolNames).toContain(`${PREFIX}get_performance_metrics`);
    });

    it("has get_historical_metrics tool", () => {
      expect(toolNames).toContain(`${PREFIX}get_historical_metrics`);
    });

    it("has get_pacing_status tool", () => {
      expect(toolNames).toContain(`${PREFIX}get_pacing_status`);
    });

    it("has run_custom_query tool", () => {
      expect(toolNames).toContain(`${PREFIX}run_custom_query`);
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
      });
    }
  });
});
