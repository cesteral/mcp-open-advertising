/**
 * AmazonDsp MCP Prompts Registry
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
  amazonDspToolSchemaExplorationPrompt,
  getTiktokToolSchemaExplorationMessage,
} from "./definitions/tool-schema-exploration.prompt.js";
import {
  amazonDspTroubleshootEntityPrompt,
  getTiktokTroubleshootEntityMessage,
} from "./definitions/troubleshoot-entity.prompt.js";
import {
  amazonDspReportingWorkflowPrompt,
  getTiktokReportingWorkflowMessage,
} from "./definitions/reporting-workflow.prompt.js";
import {
  amazonDspEntityUpdateWorkflowPrompt,
  getTiktokEntityUpdateWorkflowMessage,
} from "./definitions/entity-update-workflow.prompt.js";
import {
  amazonDspTargetingDiscoveryWorkflowPrompt,
  getTiktokTargetingDiscoveryWorkflowMessage,
} from "./definitions/targeting-discovery-workflow.prompt.js";
import {
  amazonDspEntityDuplicationWorkflowPrompt,
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
  amazonDspCreativeUploadWorkflowPrompt,
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
    amazonDspToolSchemaExplorationPrompt.name,
    {
      prompt: amazonDspToolSchemaExplorationPrompt,
      generateMessage: getTiktokToolSchemaExplorationMessage,
    },
  ],
  [
    amazonDspTroubleshootEntityPrompt.name,
    {
      prompt: amazonDspTroubleshootEntityPrompt,
      generateMessage: getTiktokTroubleshootEntityMessage,
    },
  ],
  [
    amazonDspReportingWorkflowPrompt.name,
    {
      prompt: amazonDspReportingWorkflowPrompt,
      generateMessage: getTiktokReportingWorkflowMessage,
    },
  ],
  [
    amazonDspEntityUpdateWorkflowPrompt.name,
    {
      prompt: amazonDspEntityUpdateWorkflowPrompt,
      generateMessage: getTiktokEntityUpdateWorkflowMessage,
    },
  ],
  [
    amazonDspTargetingDiscoveryWorkflowPrompt.name,
    {
      prompt: amazonDspTargetingDiscoveryWorkflowPrompt,
      generateMessage: getTiktokTargetingDiscoveryWorkflowMessage,
    },
  ],
  [
    amazonDspEntityDuplicationWorkflowPrompt.name,
    {
      prompt: amazonDspEntityDuplicationWorkflowPrompt,
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
    amazonDspCreativeUploadWorkflowPrompt.name,
    {
      prompt: amazonDspCreativeUploadWorkflowPrompt,
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
