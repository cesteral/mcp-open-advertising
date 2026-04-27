import { describe, it, expect } from "vitest";
import { allTools } from "../src/mcp-server/tools/definitions/index.js";
import { getToolSchemaExplorationMessage } from "../src/mcp-server/prompts/definitions/tool-schema-exploration.prompt.js";
import { allResources } from "../src/mcp-server/resources/definitions/index.js";

/**
 * Extract tool names from the "Available Tools Summary" section of the prompt.
 * Only matches tool names from that section to avoid picking up prompt names
 * referenced elsewhere in the text.
 */
function extractToolNamesFromPrompt(promptText: string, prefix: string): string[] {
  const summaryMatch = promptText.match(/## Available Tools Summary[\s\S]*?(?=\n## |$)/);
  if (!summaryMatch) return [];
  const summarySection = summaryMatch[0];
  return [
    ...new Set(
      [...summarySection.matchAll(new RegExp(`\`(${prefix}[a-z_]+)\``, "g"))].map((m) => m[1])
    ),
  ];
}

// Conformance tools are infrastructure, not business tools — exclude from prompt consistency
const CONFORMANCE_TOOL_NAMES = new Set([
  "echo",
  "test_simple_text",
  "test_tool_with_logging",
  "test_elicitation",
  "test_elicitation_sep1034_defaults",
  "test_elicitation_sep1330_enums",
]);

describe("Tool consistency: prompt ↔ allTools", () => {
  const registeredNames = allTools.map((t) => t.name).filter((n) => !CONFORMANCE_TOOL_NAMES.has(n));
  const promptText = getToolSchemaExplorationMessage();
  const PREFIX = "ttd_";
  const promptNames = extractToolNamesFromPrompt(promptText, PREFIX);

  it("every registered tool is mentioned in the exploration prompt", () => {
    const missing = registeredNames.filter((n) => !promptNames.includes(n));
    expect(missing).toEqual([]);
  });

  it("every tool in the prompt exists in allTools", () => {
    const extra = promptNames.filter((n) => !registeredNames.includes(n));
    expect(extra).toEqual([]);
  });

  it("prompt tool count matches allTools.length", () => {
    const countMatch = promptText.match(/\((\d+) tools\)/);
    if (countMatch) {
      expect(parseInt(countMatch[1], 10)).toBe(registeredNames.length);
    }
  });
});

describe("Tool consistency: server capabilities resource ↔ allTools", () => {
  const registeredNames = allTools.map((t) => t.name).filter((n) => !CONFORMANCE_TOOL_NAMES.has(n));
  const capabilitiesResource = allResources.find(
    (resource) => resource.uri === "server-capabilities://ttd-mcp/overview"
  );

  it("registers the TTD capabilities overview resource", () => {
    expect(capabilitiesResource).toBeDefined();
  });

  it("groups every registered TTD tool for progressive discovery", () => {
    const content = JSON.parse(capabilitiesResource!.getContent() as string);
    const groupedNames = Object.values(content.toolGroups).flat() as string[];
    const uniqueGroupedNames = [...new Set(groupedNames)].sort();

    expect(content.toolCount).toBe(registeredNames.length);
    expect(content.ungroupedTools).toEqual([]);
    expect(groupedNames).toHaveLength(uniqueGroupedNames.length);
    expect(uniqueGroupedNames).toEqual([...registeredNames].sort());
  });

  it("does not reference unknown tools in the capabilities overview", () => {
    const content = JSON.parse(capabilitiesResource!.getContent() as string);
    const groupedNames = Object.values(content.toolGroups).flat() as string[];
    const unknownNames = groupedNames.filter((name) => !registeredNames.includes(name));

    expect(unknownNames).toEqual([]);
  });

  it("keeps group summaries consistent with group membership", () => {
    const content = JSON.parse(capabilitiesResource!.getContent() as string);

    for (const [groupName, tools] of Object.entries(content.toolGroups)) {
      expect(content.toolGroupSummaries[groupName].toolCount).toBe((tools as string[]).length);
      expect(content.toolGroupSummaries[groupName].tools).toEqual(tools);
    }
  });

  it("uses a registered tool as the startHere entry point", () => {
    const content = JSON.parse(capabilitiesResource!.getContent() as string);
    expect(registeredNames).toContain(content.startHere);
  });
});
