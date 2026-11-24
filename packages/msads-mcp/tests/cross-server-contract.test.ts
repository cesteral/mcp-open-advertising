import { describe, it, expect } from "vitest";
import { CROSS_PLATFORM_PROMPTS } from "@cesteral/shared";
import { describeCrossServerContract } from "@cesteral/shared/testkit";
import { productionTools } from "../src/mcp-server/tools/definitions/index.js";
import { promptRegistry } from "../src/mcp-server/prompts/index.js";

describeCrossServerContract({
  tools: productionTools,
  prefix: "msads_",
  requiredTools: [
    "list_entities",
    "get_entity",
    "create_entity",
    "update_entity",
    "delete_entity",
    "list_accounts",
    "get_report",
    "submit_report",
    "check_report_status",
    "download_report",
    "bulk_create_entities",
    "bulk_update_entities",
    "bulk_update_status",
    "adjust_bids",
    "manage_ad_extensions",
    "manage_criterions",
    "get_ad_details",
    "validate_entity",
    "import_from_google",
    "search_targeting",
  ],
});

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

  it("all prompt names follow msads_ prefix convention, except the fleet-wide shared ones", () => {
    // The cross-platform prompts come from @cesteral/shared and are registered
    // under the same name on every server (#235).
    const shared = new Set(CROSS_PLATFORM_PROMPTS.map((p) => p.prompt.name));
    for (const [name] of promptRegistry) {
      if (shared.has(name)) continue;
      expect(name).toMatch(/^msads_/);
    }
  });

  it("registers both fleet-wide cross-platform prompts", () => {
    for (const { prompt } of CROSS_PLATFORM_PROMPTS) {
      expect(promptRegistry.get(prompt.name)?.prompt).toBe(prompt);
    }
  });

  it("exports 28 tools", () => {
    expect(productionTools).toHaveLength(28);
  });

  it("exports at least 5 prompts", () => {
    expect(promptRegistry.size).toBeGreaterThanOrEqual(5);
  });
});
