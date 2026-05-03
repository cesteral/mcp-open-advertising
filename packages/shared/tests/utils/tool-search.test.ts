import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createToolSearchTool, searchTools } from "../../src/utils/tool-search.js";
import type { ToolDefinitionForFactory } from "../../src/utils/tool-handler-factory.js";

function makeTool(
  name: string,
  description: string,
  title?: string
): ToolDefinitionForFactory {
  return {
    name,
    title,
    description,
    inputSchema: z.object({}),
    logic: async () => ({}),
  };
}

const fixtures: ToolDefinitionForFactory[] = [
  makeTool("ttd_create_campaigns", "Create one or many campaigns", "Create Campaigns"),
  makeTool(
    "ttd_download_report",
    "Download a finished report as CSV with optional spill to GCS",
    "Download Report"
  ),
  makeTool("ttd_get_context", "Returns partner IDs accessible with the current credentials"),
  makeTool("ttd_list_entities", "List entities of a given type", "List Entities"),
  makeTool(
    "ttd_validate_entity",
    "Validate an entity payload offline before submission",
    "Validate Entity"
  ),
];

describe("searchTools", () => {
  it("ranks name matches above description matches", () => {
    const out = searchTools(fixtures, { query: "campaign" }, "ttd_search_tools");
    expect(out.results[0].name).toBe("ttd_create_campaigns");
  });

  it("returns empty for queries with no overlap", () => {
    const out = searchTools(fixtures, { query: "blockchain quantum" }, "ttd_search_tools");
    expect(out.results).toHaveLength(0);
    expect(out.totalRegistered).toBe(fixtures.length);
  });

  it("respects limit", () => {
    const out = searchTools(fixtures, { query: "report entity", limit: 2 }, "ttd_search_tools");
    expect(out.results.length).toBeLessThanOrEqual(2);
  });

  it("excludes the search tool itself from results", () => {
    const withSelf = [...fixtures, makeTool("ttd_search_tools", "Search this server's tools")];
    const out = searchTools(withSelf, { query: "search tools" }, "ttd_search_tools");
    expect(out.results.find((r) => r.name === "ttd_search_tools")).toBeUndefined();
  });

  it("falls back to inventory listing for stop-word-only queries", () => {
    const out = searchTools(fixtures, { query: "the and of" }, "ttd_search_tools");
    expect(out.results.length).toBeGreaterThan(0);
    expect(out.results.every((r) => r.score === 0)).toBe(true);
  });

  it("matches partial tokens via substring containment", () => {
    const out = searchTools(fixtures, { query: "camp" }, "ttd_search_tools");
    expect(out.results[0].name).toBe("ttd_create_campaigns");
  });
});

describe("createToolSearchTool", () => {
  it("produces a registry-shaped definition with platform-prefixed name", () => {
    const tool = createToolSearchTool({ platform: "ttd", getTools: () => fixtures });
    expect(tool.name).toBe("ttd_search_tools");
    expect(tool.annotations?.readOnlyHint).toBe(true);
    expect(tool.outputSchema).toBeDefined();
  });

  it("logic resolves tools lazily so it can include itself in the registry", async () => {
    const all: ToolDefinitionForFactory[] = [...fixtures];
    const tool = createToolSearchTool({ platform: "ttd", getTools: () => all });
    all.push(tool); // emulate appending self to allTools

    const result = (await tool.logic({ query: "campaign" }, {} as never)) as {
      results: Array<{ name: string }>;
      totalRegistered: number;
    };
    // totalRegistered counts everything except self
    expect(result.totalRegistered).toBe(fixtures.length);
    expect(result.results.find((r) => r.name === "ttd_search_tools")).toBeUndefined();
  });
});
