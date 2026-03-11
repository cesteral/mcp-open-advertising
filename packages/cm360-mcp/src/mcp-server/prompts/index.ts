import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export interface PromptDefinition {
  prompt: Prompt;
  generateMessage: (args?: Record<string, string>) => string;
}

/**
 * CM360 prompt registry — empty for now.
 * Add workflow prompts here as needed.
 */
export const promptRegistry: Map<string, PromptDefinition> = new Map();
