import { describe, expect, it } from "vitest";
import { allResources } from "../src/mcp-server/resources/definitions/index.js";
import { allTools } from "../src/mcp-server/tools/definitions/index.js";

const CONFORMANCE_TOOL_NAMES = new Set([
  "echo",
  "test_simple_text",
  "test_tool_with_logging",
  "test_elicitation",
  "test_elicitation_sep1034_defaults",
  "test_elicitation_sep1330_enums",
]);

describe("DV360 capabilities overview", () => {
  const registeredNames = allTools
    .map((tool) => tool.name)
    .filter((name) => !CONFORMANCE_TOOL_NAMES.has(name));
  const capabilitiesResource = allResources.find(
    (resource) => resource.uriTemplate === "server-capabilities://dv360-mcp/overview"
  );

  it("registers the DV360 capabilities overview resource", () => {
    expect(capabilitiesResource).toBeDefined();
  });

  it("groups every registered DV360 tool for progressive discovery", async () => {
    const result = await capabilitiesResource!.read({});
    const content = JSON.parse(result.text);
    const groupedNames = Object.values(content.toolGroups).flat() as string[];
    const uniqueGroupedNames = [...new Set(groupedNames)].sort();

    expect(content.toolCount).toBe(registeredNames.length);
    expect(content.ungroupedTools).toEqual([]);
    expect(groupedNames).toHaveLength(uniqueGroupedNames.length);
    expect(uniqueGroupedNames).toEqual([...registeredNames].sort());
  });

  it("does not reference unknown tools in the capabilities overview", async () => {
    const result = await capabilitiesResource!.read({});
    const content = JSON.parse(result.text);
    const groupedNames = Object.values(content.toolGroups).flat() as string[];
    const unknownNames = groupedNames.filter((name) => !registeredNames.includes(name));

    expect(unknownNames).toEqual([]);
  });

  it("uses a registered tool as the startHere entry point", async () => {
    const result = await capabilitiesResource!.read({});
    const content = JSON.parse(result.text);
    expect(registeredNames).toContain(content.startHere);
  });
});
