/**
 * Snapchat MCP Prompts Registry
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
  snapchatToolSchemaExplorationPrompt,
  getTiktokToolSchemaExplorationMessage,
} from "./definitions/tool-schema-exploration.prompt.js";
import {
  snapchatTroubleshootEntityPrompt,
  getTiktokTroubleshootEntityMessage,
} from "./definitions/troubleshoot-entity.prompt.js";
import {
  snapchatReportingWorkflowPrompt,
  getTiktokReportingWorkflowMessage,
} from "./definitions/reporting-workflow.prompt.js";
import {
  snapchatEntityUpdateWorkflowPrompt,
  getTiktokEntityUpdateWorkflowMessage,
} from "./definitions/entity-update-workflow.prompt.js";
import {
  snapchatTargetingDiscoveryWorkflowPrompt,
  getTiktokTargetingDiscoveryWorkflowMessage,
} from "./definitions/targeting-discovery-workflow.prompt.js";
import {
  snapchatEntityDuplicationWorkflowPrompt,
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
  snapchatCreativeUploadWorkflowPrompt,
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
    snapchatToolSchemaExplorationPrompt.name,
    {
      prompt: snapchatToolSchemaExplorationPrompt,
      generateMessage: getTiktokToolSchemaExplorationMessage,
    },
  ],
  [
    snapchatTroubleshootEntityPrompt.name,
    {
      prompt: snapchatTroubleshootEntityPrompt,
      generateMessage: getTiktokTroubleshootEntityMessage,
    },
  ],
  [
    snapchatReportingWorkflowPrompt.name,
    {
      prompt: snapchatReportingWorkflowPrompt,
      generateMessage: getTiktokReportingWorkflowMessage,
    },
  ],
  [
    snapchatEntityUpdateWorkflowPrompt.name,
    {
      prompt: snapchatEntityUpdateWorkflowPrompt,
      generateMessage: getTiktokEntityUpdateWorkflowMessage,
    },
  ],
  [
    snapchatTargetingDiscoveryWorkflowPrompt.name,
    {
      prompt: snapchatTargetingDiscoveryWorkflowPrompt,
      generateMessage: getTiktokTargetingDiscoveryWorkflowMessage,
    },
  ],
  [
    snapchatEntityDuplicationWorkflowPrompt.name,
    {
      prompt: snapchatEntityDuplicationWorkflowPrompt,
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
    snapchatCreativeUploadWorkflowPrompt.name,
    {
      prompt: snapchatCreativeUploadWorkflowPrompt,
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
