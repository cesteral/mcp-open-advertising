// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * TikTok MCP Prompts Registry
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
  tiktokToolSchemaExplorationPrompt,
  getTiktokToolSchemaExplorationMessage,
} from "./definitions/tool-schema-exploration.prompt.js";
import {
  tiktokTroubleshootEntityPrompt,
  getTiktokTroubleshootEntityMessage,
} from "./definitions/troubleshoot-entity.prompt.js";
import {
  tiktokReportingWorkflowPrompt,
  getTiktokReportingWorkflowMessage,
} from "./definitions/reporting-workflow.prompt.js";
import {
  tiktokEntityUpdateWorkflowPrompt,
  getTiktokEntityUpdateWorkflowMessage,
} from "./definitions/entity-update-workflow.prompt.js";
import {
  tiktokTargetingDiscoveryWorkflowPrompt,
  getTiktokTargetingDiscoveryWorkflowMessage,
} from "./definitions/targeting-discovery-workflow.prompt.js";
import {
  tiktokEntityDuplicationWorkflowPrompt,
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
  tiktokCreativeUploadWorkflowPrompt,
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
    tiktokToolSchemaExplorationPrompt.name,
    {
      prompt: tiktokToolSchemaExplorationPrompt,
      generateMessage: getTiktokToolSchemaExplorationMessage,
    },
  ],
  [
    tiktokTroubleshootEntityPrompt.name,
    {
      prompt: tiktokTroubleshootEntityPrompt,
      generateMessage: getTiktokTroubleshootEntityMessage,
    },
  ],
  [
    tiktokReportingWorkflowPrompt.name,
    {
      prompt: tiktokReportingWorkflowPrompt,
      generateMessage: getTiktokReportingWorkflowMessage,
    },
  ],
  [
    tiktokEntityUpdateWorkflowPrompt.name,
    {
      prompt: tiktokEntityUpdateWorkflowPrompt,
      generateMessage: getTiktokEntityUpdateWorkflowMessage,
    },
  ],
  [
    tiktokTargetingDiscoveryWorkflowPrompt.name,
    {
      prompt: tiktokTargetingDiscoveryWorkflowPrompt,
      generateMessage: getTiktokTargetingDiscoveryWorkflowMessage,
    },
  ],
  [
    tiktokEntityDuplicationWorkflowPrompt.name,
    {
      prompt: tiktokEntityDuplicationWorkflowPrompt,
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
    tiktokCreativeUploadWorkflowPrompt.name,
    {
      prompt: tiktokCreativeUploadWorkflowPrompt,
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