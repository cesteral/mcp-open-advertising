/**
 * MCP Prompts - Barrel Export
 */

export type { Prompt, PromptArgument, PromptDefinition } from "./types.js";

import {
  customQueryWorkflowPrompt,
  getCustomQueryWorkflowMessage,
} from "./custom-query-workflow.prompt.js";
import {
  troubleshootReportPrompt,
  getTroubleshootReportMessage,
} from "./troubleshoot-report.prompt.js";
import {
  toolSchemaExplorationPrompt,
  getToolSchemaExplorationMessage,
} from "./tool-schema-exploration.prompt.js";
import type { PromptDefinition } from "./types.js";

/**
 * Registry of all available prompts
 */
export const promptRegistry: Map<string, PromptDefinition> = new Map([
  [
    customQueryWorkflowPrompt.name,
    {
      prompt: customQueryWorkflowPrompt,
      generateMessage: getCustomQueryWorkflowMessage,
    },
  ],
  [
    troubleshootReportPrompt.name,
    {
      prompt: troubleshootReportPrompt,
      generateMessage: getTroubleshootReportMessage,
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

/**
 * All prompts for registration
 */
export function getAllPrompts() {
  return Array.from(promptRegistry.values()).map((def) => def.prompt);
}

export function getPromptDefinition(name: string): PromptDefinition | undefined {
  return promptRegistry.get(name);
}
