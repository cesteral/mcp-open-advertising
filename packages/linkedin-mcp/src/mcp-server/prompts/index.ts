/**
 * LinkedIn MCP Prompts Registry
 */

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";
import {
  linkedInCampaignSetupWorkflowPrompt,
  getLinkedInCampaignSetupWorkflowMessage,
} from "./definitions/campaign-setup-workflow.prompt.js";
import {
  linkedInBulkOperationsWorkflowPrompt,
  getLinkedInBulkOperationsWorkflowMessage,
} from "./definitions/bulk-operations-workflow.prompt.js";
import {
  linkedInToolSchemaExplorationPrompt,
  getLinkedInToolSchemaExplorationMessage,
} from "./definitions/tool-schema-exploration.prompt.js";
import {
  linkedInTroubleshootEntityPrompt,
  getLinkedInTroubleshootEntityMessage,
} from "./definitions/troubleshoot-entity.prompt.js";
import {
  linkedInAnalyticsReportingWorkflowPrompt,
  getLinkedInAnalyticsReportingWorkflowMessage,
} from "./definitions/analytics-reporting-workflow.prompt.js";
import {
  linkedInEntityUpdateWorkflowPrompt,
  getLinkedInEntityUpdateWorkflowMessage,
} from "./definitions/entity-update-workflow.prompt.js";
import {
  linkedInTargetingDiscoveryWorkflowPrompt,
  getLinkedInTargetingDiscoveryWorkflowMessage,
} from "./definitions/targeting-discovery-workflow.prompt.js";
import {
  linkedInEntityDuplicationWorkflowPrompt,
  getLinkedInEntityDuplicationWorkflowMessage,
} from "./definitions/entity-duplication-workflow.prompt.js";
import {
  crossPlatformPerformancePrompt,
  getCrossPlatformPerformanceMessage,
} from "./definitions/cross-platform-performance.prompt.js";
import {
  crossPlatformCampaignSetupPrompt,
  getCrossPlatformCampaignSetupMessage,
} from "./definitions/cross-platform-campaign-setup.prompt.js";

export interface PromptDefinition {
  prompt: Prompt;
  generateMessage: (args?: Record<string, string>) => string;
}

export const promptRegistry: Map<string, PromptDefinition> = new Map([
  [
    linkedInCampaignSetupWorkflowPrompt.name,
    {
      prompt: linkedInCampaignSetupWorkflowPrompt,
      generateMessage: getLinkedInCampaignSetupWorkflowMessage,
    },
  ],
  [
    linkedInBulkOperationsWorkflowPrompt.name,
    {
      prompt: linkedInBulkOperationsWorkflowPrompt,
      generateMessage: getLinkedInBulkOperationsWorkflowMessage,
    },
  ],
  [
    linkedInToolSchemaExplorationPrompt.name,
    {
      prompt: linkedInToolSchemaExplorationPrompt,
      generateMessage: getLinkedInToolSchemaExplorationMessage,
    },
  ],
  [
    linkedInTroubleshootEntityPrompt.name,
    {
      prompt: linkedInTroubleshootEntityPrompt,
      generateMessage: getLinkedInTroubleshootEntityMessage,
    },
  ],
  [
    linkedInAnalyticsReportingWorkflowPrompt.name,
    {
      prompt: linkedInAnalyticsReportingWorkflowPrompt,
      generateMessage: getLinkedInAnalyticsReportingWorkflowMessage,
    },
  ],
  [
    linkedInEntityUpdateWorkflowPrompt.name,
    {
      prompt: linkedInEntityUpdateWorkflowPrompt,
      generateMessage: getLinkedInEntityUpdateWorkflowMessage,
    },
  ],
  [
    linkedInTargetingDiscoveryWorkflowPrompt.name,
    {
      prompt: linkedInTargetingDiscoveryWorkflowPrompt,
      generateMessage: getLinkedInTargetingDiscoveryWorkflowMessage,
    },
  ],
  [
    linkedInEntityDuplicationWorkflowPrompt.name,
    {
      prompt: linkedInEntityDuplicationWorkflowPrompt,
      generateMessage: getLinkedInEntityDuplicationWorkflowMessage,
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
]);

export function getAllPrompts(): Prompt[] {
  return Array.from(promptRegistry.values()).map((def) => def.prompt);
}

export function getPromptDefinition(name: string): PromptDefinition | undefined {
  return promptRegistry.get(name);
}
