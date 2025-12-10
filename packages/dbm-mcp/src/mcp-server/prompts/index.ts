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
]);

/**
 * All prompts for registration
 */
export const allPrompts = Array.from(promptRegistry.values()).map((def) => def.prompt);
