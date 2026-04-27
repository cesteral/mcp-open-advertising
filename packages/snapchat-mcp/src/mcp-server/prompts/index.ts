// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

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
  getSnapchatToolSchemaExplorationMessage,
} from "./definitions/tool-schema-exploration.prompt.js";
import {
  snapchatTroubleshootEntityPrompt,
  getSnapchatTroubleshootEntityMessage,
} from "./definitions/troubleshoot-entity.prompt.js";
import {
  snapchatReportingWorkflowPrompt,
  getSnapchatReportingWorkflowMessage,
} from "./definitions/reporting-workflow.prompt.js";
import {
  snapchatEntityUpdateWorkflowPrompt,
  getSnapchatEntityUpdateWorkflowMessage,
} from "./definitions/entity-update-workflow.prompt.js";
import {
  snapchatTargetingDiscoveryWorkflowPrompt,
  getSnapchatTargetingDiscoveryWorkflowMessage,
} from "./definitions/targeting-discovery-workflow.prompt.js";
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
  getSnapchatCreativeUploadWorkflowMessage,
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
      generateMessage: getSnapchatToolSchemaExplorationMessage,
    },
  ],
  [
    snapchatTroubleshootEntityPrompt.name,
    {
      prompt: snapchatTroubleshootEntityPrompt,
      generateMessage: getSnapchatTroubleshootEntityMessage,
    },
  ],
  [
    snapchatReportingWorkflowPrompt.name,
    {
      prompt: snapchatReportingWorkflowPrompt,
      generateMessage: getSnapchatReportingWorkflowMessage,
    },
  ],
  [
    snapchatEntityUpdateWorkflowPrompt.name,
    {
      prompt: snapchatEntityUpdateWorkflowPrompt,
      generateMessage: getSnapchatEntityUpdateWorkflowMessage,
    },
  ],
  [
    snapchatTargetingDiscoveryWorkflowPrompt.name,
    {
      prompt: snapchatTargetingDiscoveryWorkflowPrompt,
      generateMessage: getSnapchatTargetingDiscoveryWorkflowMessage,
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
      generateMessage: getSnapchatCreativeUploadWorkflowMessage,
    },
  ],
]);

export function getAllPrompts(): Prompt[] {
  return Array.from(promptRegistry.values()).map((def) => def.prompt);
}

export function getPromptDefinition(name: string): PromptDefinition | undefined {
  return promptRegistry.get(name);
}
