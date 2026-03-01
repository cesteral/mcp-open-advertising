/**
 * MCP Prompts - Barrel Export
 */

export type { Prompt, PromptArgument, PromptDefinition } from "./definitions/types.js";

import {
  customQueryWorkflowPrompt,
  getCustomQueryWorkflowMessage,
} from "./definitions/custom-query-workflow.prompt.js";
import {
  troubleshootReportPrompt,
  getTroubleshootReportMessage,
} from "./definitions/troubleshoot-report.prompt.js";
import {
  toolSchemaExplorationPrompt,
  getToolSchemaExplorationMessage,
} from "./definitions/tool-schema-exploration.prompt.js";
import {
  pacingPerformanceAnalysisPrompt,
  getPacingPerformanceAnalysisMessage,
} from "./definitions/pacing-performance-analysis.prompt.js";
import {
  crossPlatformPerformancePrompt,
  getCrossPlatformPerformanceMessage,
} from "./definitions/cross-platform-performance.prompt.js";
import {
  crossPlatformCampaignSetupPrompt,
  getCrossPlatformCampaignSetupMessage,
} from "./definitions/cross-platform-campaign-setup.prompt.js";
import type { PromptDefinition } from "./definitions/types.js";

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
  [
    pacingPerformanceAnalysisPrompt.name,
    {
      prompt: pacingPerformanceAnalysisPrompt,
      generateMessage: getPacingPerformanceAnalysisMessage,
    },
  ],
  [
    crossPlatformPerformancePrompt.name,
    {
      prompt: crossPlatformPerformancePrompt,
      generateMessage: getCrossPlatformPerformanceMessage,
    },
  ],
  [
    crossPlatformCampaignSetupPrompt.name,
    {
      prompt: crossPlatformCampaignSetupPrompt,
      generateMessage: getCrossPlatformCampaignSetupMessage,
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
