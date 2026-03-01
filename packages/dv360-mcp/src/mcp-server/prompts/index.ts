import type { Prompt } from "@modelcontextprotocol/sdk/types.js";
import {
  fullCampaignSetupPrompt,
  getFullCampaignSetupPromptMessage,
} from "./definitions/full-campaign-setup.prompt.js";
import {
  troubleshootUnderdeliveryPrompt,
  getTroubleshootUnderdeliveryPromptMessage,
} from "./definitions/troubleshoot-underdelivery.prompt.js";
import {
  budgetReallocationPrompt,
  getBudgetReallocationPromptMessage,
} from "./definitions/budget-reallocation.prompt.js";
import {
  entityUpdateExecutionPrompt,
  getEntityUpdateExecutionPromptMessage,
} from "./definitions/entity-update-execution.prompt.js";
import {
  toolSchemaExplorationPrompt,
  getToolSchemaExplorationMessage,
} from "./definitions/tool-schema-exploration.prompt.js";
import {
  targetingManagementPrompt,
  getTargetingManagementPromptMessage,
} from "./definitions/targeting-management.prompt.js";
import {
  bulkOperationsPrompt,
  getBulkOperationsPromptMessage,
} from "./definitions/bulk-operations.prompt.js";
import {
  crossPlatformPerformancePrompt,
  getCrossPlatformPerformanceMessage,
} from "./definitions/cross-platform-performance.prompt.js";

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
  [
    troubleshootUnderdeliveryPrompt.name,
    {
      prompt: troubleshootUnderdeliveryPrompt,
      generateMessage: getTroubleshootUnderdeliveryPromptMessage,
    },
  ],
  [
    budgetReallocationPrompt.name,
    {
      prompt: budgetReallocationPrompt,
      generateMessage: getBudgetReallocationPromptMessage,
    },
  ],
  [
    entityUpdateExecutionPrompt.name,
    {
      prompt: entityUpdateExecutionPrompt,
      generateMessage: getEntityUpdateExecutionPromptMessage,
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
    targetingManagementPrompt.name,
    {
      prompt: targetingManagementPrompt,
      generateMessage: getTargetingManagementPromptMessage,
    },
  ],
  [
    bulkOperationsPrompt.name,
    {
      prompt: bulkOperationsPrompt,
      generateMessage: getBulkOperationsPromptMessage,
    },
  ],
  [
    crossPlatformPerformancePrompt.name,
    {
      prompt: crossPlatformPerformancePrompt,
      generateMessage: getCrossPlatformPerformanceMessage,
    },
  ],
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
