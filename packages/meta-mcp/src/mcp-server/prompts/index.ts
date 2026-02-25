/**
 * Meta MCP Prompts Registry
 */

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";
import {
  campaignSetupWorkflowPrompt,
  getCampaignSetupWorkflowMessage,
} from "./definitions/campaign-setup-workflow.prompt.js";
import {
  insightsReportingWorkflowPrompt,
  getInsightsReportingWorkflowMessage,
} from "./definitions/insights-reporting-workflow.prompt.js";
import {
  troubleshootEntityPrompt,
  getTroubleshootEntityMessage,
} from "./definitions/troubleshoot-entity.prompt.js";
import {
  toolSchemaExplorationPrompt,
  getToolSchemaExplorationMessage,
} from "./definitions/tool-schema-exploration.prompt.js";

export interface PromptDefinition {
  prompt: Prompt;
  generateMessage: (args?: Record<string, string>) => string;
}

export const promptRegistry: Map<string, PromptDefinition> = new Map([
  [
    campaignSetupWorkflowPrompt.name,
    {
      prompt: campaignSetupWorkflowPrompt,
      generateMessage: getCampaignSetupWorkflowMessage,
    },
  ],
  [
    insightsReportingWorkflowPrompt.name,
    {
      prompt: insightsReportingWorkflowPrompt,
      generateMessage: getInsightsReportingWorkflowMessage,
    },
  ],
  [
    troubleshootEntityPrompt.name,
    {
      prompt: troubleshootEntityPrompt,
      generateMessage: getTroubleshootEntityMessage,
    },
  ],
  [
    toolSchemaExplorationPrompt.name,
    {
      prompt: toolSchemaExplorationPrompt,
      generateMessage: getToolSchemaExplorationMessage,
    },
  ],
]);

export function getAllPrompts(): Prompt[] {
  return Array.from(promptRegistry.values()).map((def) => def.prompt);
}

export function getPromptDefinition(name: string): PromptDefinition | undefined {
  return promptRegistry.get(name);
}
