// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Google Ads MCP Prompts Registry
 *
 * Prompts provide step-by-step workflow guidance for complex multi-step operations.
 */

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";
import {
  campaignSetupWorkflowPrompt,
  getCampaignSetupWorkflowMessage,
} from "./definitions/campaign-setup-workflow.prompt.js";
import {
  toolSchemaExplorationPrompt,
  getToolSchemaExplorationMessage,
} from "./definitions/tool-schema-exploration.prompt.js";
import {
  troubleshootEntityPrompt,
  getTroubleshootEntityMessage,
} from "./definitions/troubleshoot-entity.prompt.js";
import {
  gaqlReportingWorkflowPrompt,
  getGaqlReportingWorkflowMessage,
} from "./definitions/gaql-reporting-workflow.prompt.js";
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
  entityUpdateWorkflowPrompt,
  getEntityUpdateWorkflowMessage,
} from "./definitions/entity-update-workflow.prompt.js";
import {
  entityDuplicationWorkflowPrompt,
  getEntityDuplicationWorkflowMessage,
} from "./definitions/entity-duplication-workflow.prompt.js";
import {
  targetingDiscoveryWorkflowPrompt,
  getTargetingDiscoveryWorkflowMessage,
} from "./definitions/targeting-discovery-workflow.prompt.js";
import {
  gadsCreativeSetupWorkflowPrompt,
  getGadsCreativeSetupWorkflowMessage,
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
    toolSchemaExplorationPrompt.name,
    {
      prompt: toolSchemaExplorationPrompt,
      generateMessage: getToolSchemaExplorationMessage,
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
    gaqlReportingWorkflowPrompt.name,
    {
      prompt: gaqlReportingWorkflowPrompt,
      generateMessage: getGaqlReportingWorkflowMessage,
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
    entityUpdateWorkflowPrompt.name,
    {
      prompt: entityUpdateWorkflowPrompt,
      generateMessage: getEntityUpdateWorkflowMessage,
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
    targetingDiscoveryWorkflowPrompt.name,
    {
      prompt: targetingDiscoveryWorkflowPrompt,
      generateMessage: getTargetingDiscoveryWorkflowMessage,
    },
  ],
  [
    gadsCreativeSetupWorkflowPrompt.name,
    {
      prompt: gadsCreativeSetupWorkflowPrompt,
      generateMessage: getGadsCreativeSetupWorkflowMessage,
    },
  ],
]);

export function getAllPrompts(): Prompt[] {
  return Array.from(promptRegistry.values()).map((def) => def.prompt);
}

export function getPromptDefinition(name: string): PromptDefinition | undefined {
  return promptRegistry.get(name);
}
