import { describe, it, expect } from "vitest";
import { productionTools } from "../src/mcp-server/tools/definitions/index.js";
import { promptRegistry } from "../src/mcp-server/prompts/index.js";

describe("msads-mcp cross-server contract", () => {
  it("all tool names follow msads_ prefix convention", () => {
    for (const tool of productionTools) {
      expect(tool.name).toMatch(/^msads_/);
    }
  });

  it("tool names use snake_case", () => {
    for (const tool of productionTools) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("all prompt names follow msads_ prefix convention", () => {
    for (const [name] of promptRegistry) {
      expect(name).toMatch(/^msads_/);
    }
  });

  it("exports 20 tools", () => {
    expect(productionTools).toHaveLength(20);
  });

  it("exports at least 5 prompts", () => {
    expect(promptRegistry.size).toBeGreaterThanOrEqual(5);
  });

  it("expected tool names are present", () => {
    const toolNames = productionTools.map((t) => t.name);
    const expectedTools = [
      "msads_list_entities",
      "msads_get_entity",
      "msads_create_entity",
      "msads_update_entity",
      "msads_delete_entity",
      "msads_list_accounts",
      "msads_get_report",
      "msads_submit_report",
      "msads_check_report_status",
      "msads_download_report",
      "msads_bulk_create_entities",
      "msads_bulk_update_entities",
      "msads_bulk_update_status",
      "msads_adjust_bids",
      "msads_manage_ad_extensions",
      "msads_manage_criterions",
      "msads_get_ad_preview",
      "msads_validate_entity",
      "msads_import_from_google",
      "msads_search_targeting",
    ];

    for (const name of expectedTools) {
      expect(toolNames, `Missing tool: ${name}`).toContain(name);
    }
  });
});
