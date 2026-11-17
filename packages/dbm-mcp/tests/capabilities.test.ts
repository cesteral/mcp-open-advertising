import { describe, expect, it } from "vitest";
import { allResources } from "../src/mcp-server/resources/definitions/index.js";
import { allTools } from "../src/mcp-server/tools/index.js";

describe("DBM capabilities overview", () => {
  const expectedToolNames = allTools.map((tool) => tool.name);
  const capabilitiesResource = allResources.find(
    (resource) => resource.uri === "server-capabilities://dbm-mcp/overview"
  );

  it("registers the DBM capabilities overview resource", () => {
    expect(capabilitiesResource).toBeDefined();
  });

  it("includes every DBM tool", () => {
    const content = JSON.parse(capabilitiesResource!.getContent() as string);
    const groupedNames = Object.values(content.toolGroups).flat() as string[];
    const uniqueGroupedNames = [...new Set(groupedNames)].sort();

    expect(content.toolCount).toBe(expectedToolNames.length);
    expect(content.ungroupedTools).toEqual([]);
    expect(groupedNames).toHaveLength(uniqueGroupedNames.length);
    expect(uniqueGroupedNames).toEqual([...expectedToolNames].sort());
  });
});
