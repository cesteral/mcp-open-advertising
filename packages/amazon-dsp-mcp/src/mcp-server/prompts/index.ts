// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

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
  getAmazonDspToolSchemaExplorationMessage,
} from "./definitions/tool-schema-exploration.prompt.js";
import {
  amazonDspTroubleshootEntityPrompt,
  getAmazonDspTroubleshootEntityMessage,
} from "./definitions/troubleshoot-entity.prompt.js";
import {
  amazonDspReportingWorkflowPrompt,
  getAmazonDspReportingWorkflowMessage,
} from "./definitions/reporting-workflow.prompt.js";
import {
  amazonDspEntityUpdateWorkflowPrompt,
  getAmazonDspEntityUpdateWorkflowMessage,
} from "./definitions/entity-update-workflow.prompt.js";
import {
  amazonDspTargetingDiscoveryWorkflowPrompt,
  getAmazonDspTargetingDiscoveryWorkflowMessage,
} from "./definitions/targeting-discovery-workflow.prompt.js";
import {
  amazonDspEntityDuplicationWorkflowPrompt,
  getAmazonDspEntityDuplicationWorkflowMessage,
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
  getAmazonDspCreativeUploadWorkflowMessage,
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
      generateMessage: getAmazonDspToolSchemaExplorationMessage,
    },
  ],
  [
    amazonDspTroubleshootEntityPrompt.name,
    {
      prompt: amazonDspTroubleshootEntityPrompt,
      generateMessage: getAmazonDspTroubleshootEntityMessage,
    },
  ],
  [
    amazonDspReportingWorkflowPrompt.name,
    {
      prompt: amazonDspReportingWorkflowPrompt,
      generateMessage: getAmazonDspReportingWorkflowMessage,
    },
  ],
  [
    amazonDspEntityUpdateWorkflowPrompt.name,
    {
      prompt: amazonDspEntityUpdateWorkflowPrompt,
      generateMessage: getAmazonDspEntityUpdateWorkflowMessage,
    },
  ],
  [
    amazonDspTargetingDiscoveryWorkflowPrompt.name,
    {
      prompt: amazonDspTargetingDiscoveryWorkflowPrompt,
      generateMessage: getAmazonDspTargetingDiscoveryWorkflowMessage,
    },
  ],
  [
    amazonDspEntityDuplicationWorkflowPrompt.name,
    {
      prompt: amazonDspEntityDuplicationWorkflowPrompt,
      generateMessage: getAmazonDspEntityDuplicationWorkflowMessage,
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
      generateMessage: getAmazonDspCreativeUploadWorkflowMessage,
    },
  ],
]);

export function getAllPrompts(): Prompt[] {
  return Array.from(promptRegistry.values()).map((def) => def.prompt);
}

export function getPromptDefinition(name: string): PromptDefinition | undefined {
  return promptRegistry.get(name);
}