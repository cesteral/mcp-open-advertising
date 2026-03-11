/**
 * SA360 MCP Prompts Registry
 *
 * Prompts provide step-by-step workflow guidance for complex multi-step operations.
 */

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export interface PromptDefinition {
  prompt: Prompt;
  generateMessage: (args?: Record<string, string>) => string;
}

export const promptRegistry: Map<string, PromptDefinition> = new Map([
  // No prompts defined yet — SA360 is primarily read-only with simple workflows
]);

export function getAllPrompts(): Prompt[] {
  return Array.from(promptRegistry.values()).map((def) => def.prompt);
}

export function getPromptDefinition(name: string): PromptDefinition | undefined {
  return promptRegistry.get(name);
}
