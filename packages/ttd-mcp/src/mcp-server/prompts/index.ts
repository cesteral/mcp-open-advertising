/**
 * TTD MCP Prompts Registry
 *
 * Prompts provide step-by-step workflow guidance for complex multi-step operations.
 */

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";
import {
  campaignSetupWorkflowPrompt,
  getCampaignSetupWorkflowMessage,
} from "./definitions/campaign-setup-workflow.prompt.js";
import {
  reportGenerationWorkflowPrompt,
  getReportGenerationWorkflowMessage,
} from "./definitions/report-generation-workflow.prompt.js";
import {
  troubleshootEntityPrompt,
  getTroubleshootEntityMessage,
} from "./definitions/troubleshoot-entity.prompt.js";
import {
  toolSchemaExplorationPrompt,
  getToolSchemaExplorationMessage,
} from "./definitions/tool-schema-exploration.prompt.js";
import {
  crossPlatformPerformancePrompt,
  getCrossPlatformPerformanceMessage,
} from "./definitions/cross-platform-performance.prompt.js";
import {
  bulkOperationsWorkflowPrompt,
  getBulkOperationsWorkflowMessage,
} from "./definitions/bulk-operations-workflow.prompt.js";
import {
  crossPlatformCampaignSetupPrompt,
  getCrossPlatformCampaignSetupMessage,
} from "./definitions/cross-platform-campaign-setup.prompt.js";
import {
  ttdEntityUpdateWorkflowPrompt,
  getTtdEntityUpdateWorkflowMessage,
} from "./definitions/entity-update-workflow.prompt.js";
import {
  ttdEntityDuplicationWorkflowPrompt,
  getTtdEntityDuplicationWorkflowMessage,
} from "./definitions/entity-duplication-workflow.prompt.js";
import {
  ttdTargetingDiscoveryWorkflowPrompt,
  getTtdTargetingDiscoveryWorkflowMessage,
} from "./definitions/targeting-discovery-workflow.prompt.js";
import {
  ttdCreativeSetupWorkflowPrompt,
  getTtdCreativeSetupWorkflowMessage,
} from "./definitions/creative-setup-workflow.prompt.js";

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
    reportGenerationWorkflowPrompt.name,
    {
      prompt: reportGenerationWorkflowPrompt,
      generateMessage: getReportGenerationWorkflowMessage,
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
  [
    crossPlatformPerformancePrompt.name,
    {
      prompt: crossPlatformPerformancePrompt,
      generateMessage: getCrossPlatformPerformanceMessage,
    },
  ],
  [
    bulkOperationsWorkflowPrompt.name,
    {
      prompt: bulkOperationsWorkflowPrompt,
      generateMessage: getBulkOperationsWorkflowMessage,
    },
  ],
  [
    crossPlatformCampaignSetupPrompt.name,
    {
      prompt: crossPlatformCampaignSetupPrompt,
      generateMessage: getCrossPlatformCampaignSetupMessage,
    },
  ],
  [
    ttdEntityUpdateWorkflowPrompt.name,
    {
      prompt: ttdEntityUpdateWorkflowPrompt,
      generateMessage: getTtdEntityUpdateWorkflowMessage,
    },
  ],
  [
    ttdEntityDuplicationWorkflowPrompt.name,
    {
      prompt: ttdEntityDuplicationWorkflowPrompt,
      generateMessage: getTtdEntityDuplicationWorkflowMessage,
    },
  ],
  [
    ttdTargetingDiscoveryWorkflowPrompt.name,
    {
      prompt: ttdTargetingDiscoveryWorkflowPrompt,
      generateMessage: getTtdTargetingDiscoveryWorkflowMessage,
    },
  ],
  [
    ttdCreativeSetupWorkflowPrompt.name,
    {
      prompt: ttdCreativeSetupWorkflowPrompt,
      generateMessage: getTtdCreativeSetupWorkflowMessage,
    },
  ],
]);

export function getAllPrompts(): Prompt[] {
  return Array.from(promptRegistry.values()).map((def) => def.prompt);
}

export function getPromptDefinition(name: string): PromptDefinition | undefined {
  return promptRegistry.get(name);
}
