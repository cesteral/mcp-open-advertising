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
import {
  entityUpdateWorkflowPrompt,
  getEntityUpdateWorkflowMessage,
} from "./definitions/entity-update-workflow.prompt.js";
import {
  bulkOperationsWorkflowPrompt,
  getBulkOperationsWorkflowMessage,
} from "./definitions/bulk-operations-workflow.prompt.js";
import {
  crossPlatformPerformancePrompt,
  getCrossPlatformPerformanceMessage,
} from "./definitions/cross-platform-performance.prompt.js";
import {
  crossPlatformCampaignSetupPrompt,
  getCrossPlatformCampaignSetupMessage,
} from "./definitions/cross-platform-campaign-setup.prompt.js";
import {
  targetingDiscoveryWorkflowPrompt,
  getTargetingDiscoveryWorkflowMessage,
} from "./definitions/targeting-discovery-workflow.prompt.js";
import {
  entityDuplicationWorkflowPrompt,
  getEntityDuplicationWorkflowMessage,
} from "./definitions/entity-duplication-workflow.prompt.js";
import {
  creativeUploadWorkflowPrompt,
  getCreativeUploadWorkflowMessage,
} from "./definitions/creative-upload-workflow.prompt.js";

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
  [
    entityUpdateWorkflowPrompt.name,
    {
      prompt: entityUpdateWorkflowPrompt,
      generateMessage: getEntityUpdateWorkflowMessage,
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
  [
    targetingDiscoveryWorkflowPrompt.name,
    {
      prompt: targetingDiscoveryWorkflowPrompt,
      generateMessage: getTargetingDiscoveryWorkflowMessage,
    },
  ],
  [
    entityDuplicationWorkflowPrompt.name,
    {
      prompt: entityDuplicationWorkflowPrompt,
      generateMessage: getEntityDuplicationWorkflowMessage,
    },
  ],
  [
    creativeUploadWorkflowPrompt.name,
    {
      prompt: creativeUploadWorkflowPrompt,
      generateMessage: getCreativeUploadWorkflowMessage,
    },
  ],
]);

export function getAllPrompts(): Prompt[] {
  return Array.from(promptRegistry.values()).map((def) => def.prompt);
}

export function getPromptDefinition(name: string): PromptDefinition | undefined {
  return promptRegistry.get(name);
}
