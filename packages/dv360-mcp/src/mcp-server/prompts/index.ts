import type { Prompt } from "@modelcontextprotocol/sdk/types.js";
import {
  fullCampaignSetupPrompt,
  getFullCampaignSetupPromptMessage,
} from "./full-campaign-setup.prompt.js";

/**
 * Prompt definition with message generator
 */
export interface PromptDefinition {
  prompt: Prompt;
  generateMessage: (args?: Record<string, string>) => string;
}

/**
 * Registry of all available prompts
 */
export const promptRegistry: Map<string, PromptDefinition> = new Map([
  [
    fullCampaignSetupPrompt.name,
    {
      prompt: fullCampaignSetupPrompt,
      generateMessage: getFullCampaignSetupPromptMessage,
    },
  ],
  // Add more prompts here as they're created
]);

/**
 * Get all registered prompts for prompts/list
 */
export function getAllPrompts(): Prompt[] {
  return Array.from(promptRegistry.values()).map((def) => def.prompt);
}

/**
 * Get prompt definition by name
 */
export function getPromptDefinition(name: string): PromptDefinition | undefined {
  return promptRegistry.get(name);
}
