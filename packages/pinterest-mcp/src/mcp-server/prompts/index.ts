// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

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
  getPinterestToolSchemaExplorationMessage,
} from "./definitions/tool-schema-exploration.prompt.js";
import {
  pinterestTroubleshootEntityPrompt,
  getPinterestTroubleshootEntityMessage,
} from "./definitions/troubleshoot-entity.prompt.js";
import {
  pinterestReportingWorkflowPrompt,
  getPinterestReportingWorkflowMessage,
} from "./definitions/reporting-workflow.prompt.js";
import {
  pinterestEntityUpdateWorkflowPrompt,
  getPinterestEntityUpdateWorkflowMessage,
} from "./definitions/entity-update-workflow.prompt.js";
import {
  pinterestTargetingDiscoveryWorkflowPrompt,
  getPinterestTargetingDiscoveryWorkflowMessage,
} from "./definitions/targeting-discovery-workflow.prompt.js";
import {
  pinterestEntityDuplicationWorkflowPrompt,
  getPinterestEntityDuplicationWorkflowMessage,
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
  getPinterestCreativeUploadWorkflowMessage,
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
      generateMessage: getPinterestToolSchemaExplorationMessage,
    },
  ],
  [
    pinterestTroubleshootEntityPrompt.name,
    {
      prompt: pinterestTroubleshootEntityPrompt,
      generateMessage: getPinterestTroubleshootEntityMessage,
    },
  ],
  [
    pinterestReportingWorkflowPrompt.name,
    {
      prompt: pinterestReportingWorkflowPrompt,
      generateMessage: getPinterestReportingWorkflowMessage,
    },
  ],
  [
    pinterestEntityUpdateWorkflowPrompt.name,
    {
      prompt: pinterestEntityUpdateWorkflowPrompt,
      generateMessage: getPinterestEntityUpdateWorkflowMessage,
    },
  ],
  [
    pinterestTargetingDiscoveryWorkflowPrompt.name,
    {
      prompt: pinterestTargetingDiscoveryWorkflowPrompt,
      generateMessage: getPinterestTargetingDiscoveryWorkflowMessage,
    },
  ],
  [
    pinterestEntityDuplicationWorkflowPrompt.name,
    {
      prompt: pinterestEntityDuplicationWorkflowPrompt,
      generateMessage: getPinterestEntityDuplicationWorkflowMessage,
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
      generateMessage: getPinterestCreativeUploadWorkflowMessage,
    },
  ],
]);

export function getAllPrompts(): Prompt[] {
  return Array.from(promptRegistry.values()).map((def) => def.prompt);
}

export function getPromptDefinition(name: string): PromptDefinition | undefined {
  return promptRegistry.get(name);
}