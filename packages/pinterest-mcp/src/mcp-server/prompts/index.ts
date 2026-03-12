/**
 * Pinterest MCP Prompts Registry
 */

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";
import {
  campaignSetupWorkflowPrompt,
  getCampaignSetupWorkflowMessage,
} from "./definitions/campaign-setup-workflow.prompt.js";
import {
  bulkOperationsWorkflowPrompt,
  getBulkOperationsWorkflowMessage,
} from "./definitions/bulk-operations-workflow.prompt.js";
import {
  pinterestToolSchemaExplorationPrompt,
  getTiktokToolSchemaExplorationMessage,
} from "./definitions/tool-schema-exploration.prompt.js";
import {
  pinterestTroubleshootEntityPrompt,
  getTiktokTroubleshootEntityMessage,
} from "./definitions/troubleshoot-entity.prompt.js";
import {
  pinterestReportingWorkflowPrompt,
  getTiktokReportingWorkflowMessage,
} from "./definitions/reporting-workflow.prompt.js";
import {
  pinterestEntityUpdateWorkflowPrompt,
  getTiktokEntityUpdateWorkflowMessage,
} from "./definitions/entity-update-workflow.prompt.js";
import {
  pinterestTargetingDiscoveryWorkflowPrompt,
  getTiktokTargetingDiscoveryWorkflowMessage,
} from "./definitions/targeting-discovery-workflow.prompt.js";
import {
  pinterestEntityDuplicationWorkflowPrompt,
  getTiktokEntityDuplicationWorkflowMessage,
} from "./definitions/entity-duplication-workflow.prompt.js";
import {
  crossPlatformPerformancePrompt,
  getCrossPlatformPerformanceMessage,
} from "./definitions/cross-platform-performance.prompt.js";
import {
  crossPlatformCampaignSetupPrompt,
  getCrossPlatformCampaignSetupMessage,
} from "./definitions/cross-platform-campaign-setup.prompt.js";
import {
  pinterestCreativeUploadWorkflowPrompt,
  getTiktokCreativeUploadWorkflowMessage,
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
    bulkOperationsWorkflowPrompt.name,
    {
      prompt: bulkOperationsWorkflowPrompt,
      generateMessage: getBulkOperationsWorkflowMessage,
    },
  ],
  [
    pinterestToolSchemaExplorationPrompt.name,
    {
      prompt: pinterestToolSchemaExplorationPrompt,
      generateMessage: getTiktokToolSchemaExplorationMessage,
    },
  ],
  [
    pinterestTroubleshootEntityPrompt.name,
    {
      prompt: pinterestTroubleshootEntityPrompt,
      generateMessage: getTiktokTroubleshootEntityMessage,
    },
  ],
  [
    pinterestReportingWorkflowPrompt.name,
    {
      prompt: pinterestReportingWorkflowPrompt,
      generateMessage: getTiktokReportingWorkflowMessage,
    },
  ],
  [
    pinterestEntityUpdateWorkflowPrompt.name,
    {
      prompt: pinterestEntityUpdateWorkflowPrompt,
      generateMessage: getTiktokEntityUpdateWorkflowMessage,
    },
  ],
  [
    pinterestTargetingDiscoveryWorkflowPrompt.name,
    {
      prompt: pinterestTargetingDiscoveryWorkflowPrompt,
      generateMessage: getTiktokTargetingDiscoveryWorkflowMessage,
    },
  ],
  [
    pinterestEntityDuplicationWorkflowPrompt.name,
    {
      prompt: pinterestEntityDuplicationWorkflowPrompt,
      generateMessage: getTiktokEntityDuplicationWorkflowMessage,
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
    pinterestCreativeUploadWorkflowPrompt.name,
    {
      prompt: pinterestCreativeUploadWorkflowPrompt,
      generateMessage: getTiktokCreativeUploadWorkflowMessage,
    },
  ],
]);

export function getAllPrompts(): Prompt[] {
  return Array.from(promptRegistry.values()).map((def) => def.prompt);
}

export function getPromptDefinition(name: string): PromptDefinition | undefined {
  return promptRegistry.get(name);
}
