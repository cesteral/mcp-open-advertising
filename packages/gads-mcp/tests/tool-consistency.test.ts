import { describe, it, expect } from "vitest";
import { allTools } from "../src/mcp-server/tools/definitions/index.js";
import { getToolSchemaExplorationMessage } from "../src/mcp-server/prompts/definitions/tool-schema-exploration.prompt.js";

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
  const PREFIX = "gads_";
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
