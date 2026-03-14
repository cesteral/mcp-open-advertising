import { describe, it, expect } from "vitest";
import { productionTools } from "../../src/mcp-server/tools/definitions/index.js";

describe("msads-mcp tool definitions coverage", () => {
  it("exports 19 production tools", () => {
    expect(productionTools).toHaveLength(19);
  });

  it("all tools have required fields", () => {
    for (const tool of productionTools) {
      expect(tool.name, `${tool.name} missing name`).toBeTruthy();
      expect(tool.description, `${tool.name} missing description`).toBeTruthy();
      expect(tool.inputSchema, `${tool.name} missing inputSchema`).toBeTruthy();
      expect(tool.outputSchema, `${tool.name} missing outputSchema`).toBeTruthy();
      expect(tool.logic, `${tool.name} missing logic`).toBeTypeOf("function");
      expect(tool.responseFormatter, `${tool.name} missing responseFormatter`).toBeTypeOf("function");
    }
  });

  it("all tools have annotations", () => {
    for (const tool of productionTools) {
      expect(tool.annotations, `${tool.name} missing annotations`).toBeDefined();
      expect(typeof tool.annotations.readOnlyHint).toBe("boolean");
      expect(typeof tool.annotations.destructiveHint).toBe("boolean");
    }
  });

  it("all tools have inputExamples", () => {
    for (const tool of productionTools) {
      expect(tool.inputExamples, `${tool.name} missing inputExamples`).toBeDefined();
      expect(Array.isArray(tool.inputExamples)).toBe(true);
      expect(tool.inputExamples.length).toBeGreaterThan(0);
    }
  });

  it("all tools have unique names", () => {
    const names = productionTools.map((t) => t.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it("read-only tools are annotated correctly", () => {
    const readOnlyTools = [
      "msads_list_entities",
      "msads_get_entity",
      "msads_list_accounts",
      "msads_get_report",
      "msads_submit_report",
      "msads_check_report_status",
      "msads_download_report",
      "msads_get_ad_preview",
      "msads_validate_entity",
    ];

    for (const name of readOnlyTools) {
      const tool = productionTools.find((t) => t.name === name);
      expect(tool, `${name} not found`).toBeDefined();
      expect(tool!.annotations.readOnlyHint, `${name} should be readOnly`).toBe(true);
      expect(tool!.annotations.destructiveHint, `${name} should not be destructive`).toBe(false);
    }
  });

  it("delete tool is marked destructive", () => {
    const deleteTool = productionTools.find((t) => t.name === "msads_delete_entity");
    expect(deleteTool).toBeDefined();
    expect(deleteTool!.annotations.destructiveHint).toBe(true);
  });
});
