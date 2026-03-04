/**
 * LinkedIn MCP Prompts Registry
 */

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";
import {
  linkedInCampaignSetupWorkflowPrompt,
  getLinkedInCampaignSetupWorkflowMessage,
} from "./definitions/campaign-setup-workflow.prompt.js";
import {
  linkedInBulkOperationsWorkflowPrompt,
  getLinkedInBulkOperationsWorkflowMessage,
} from "./definitions/bulk-operations-workflow.prompt.js";

export interface PromptDefinition {
  prompt: Prompt;
  generateMessage: (args?: Record<string, string>) => string;
}

export const promptRegistry: Map<string, PromptDefinition> = new Map([
  [
    linkedInCampaignSetupWorkflowPrompt.name,
    {
      prompt: linkedInCampaignSetupWorkflowPrompt,
      generateMessage: getLinkedInCampaignSetupWorkflowMessage,
    },
  ],
  [
    linkedInBulkOperationsWorkflowPrompt.name,
    {
      prompt: linkedInBulkOperationsWorkflowPrompt,
      generateMessage: getLinkedInBulkOperationsWorkflowMessage,
    },
  ],
]);

export function getAllPrompts(): Prompt[] {
  return Array.from(promptRegistry.values()).map((def) => def.prompt);
}

export function getPromptDefinition(name: string): PromptDefinition | undefined {
  return promptRegistry.get(name);
}
