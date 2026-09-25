import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createToolSearchTool, searchTools } from "../../src/utils/tool-search.js";
import type { ToolDefinitionForFactory } from "../../src/utils/tool-handler-factory.js";

function makeTool(name: string, description: string, title?: string): ToolDefinitionForFactory {
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

  it("matches a name word by prefix of 3+ characters", () => {
    const out = searchTools(fixtures, { query: "camp" }, "ttd_search_tools");
    expect(out.results[0].name).toBe("ttd_create_campaigns");
  });

  it("does not let a 2-character word match inside a longer name word", () => {
    const tools = [
      makeTool("x_adjust_bids", "Adjust bids"),
      makeTool("x_delete_entity", "Delete an ad group or campaign"),
    ];
    const out = searchTools(tools, { query: "delete an ad group" }, "x_search_tools");
    expect(out.results[0].name).toBe("x_delete_entity");
    expect(out.results.find((r) => r.name === "x_adjust_bids")).toBeUndefined();
  });

  it("finds a tool when the query is that tool's exact name", () => {
    // Names are split on `_`; the query must be too, or `ttd_download_report`
    // is one token that equals no name word.
    const out = searchTools(fixtures, { query: "ttd_download_report" }, "ttd_search_tools");
    expect(out.results[0].name).toBe("ttd_download_report");
  });

  it.each(["constructor", "__proto__", "toString", "hasOwnProperty"])(
    "does not throw on the query word %s",
    (query) => {
      // A bare index into the synonym object reads inherited Object members.
      expect(() => searchTools(fixtures, { query }, "ttd_search_tools")).not.toThrow();
    }
  );

  it("folds '-es' plurals, so 'statuses' matches a 'status' title", () => {
    const tools = [
      makeTool("x_bulk_update", "Change several things", "Update Statuses"),
      makeTool("x_other", "Unrelated"),
    ];
    const out = searchTools(tools, { query: "status" }, "x_search_tools");
    expect(out.results[0]?.name).toBe("x_bulk_update");
  });

  it("reads 'remove' as 'delete'", () => {
    const tools = [
      makeTool("x_get_pacing_status", "Pacing for a campaign"),
      makeTool("x_delete_entity", "Delete an entity"),
    ];
    const out = searchTools(tools, { query: "remove a campaign" }, "x_search_tools");
    expect(out.results[0].name).toBe("x_delete_entity");
    expect(out.results[0].matchedTokens).toEqual(["remove"]);
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
