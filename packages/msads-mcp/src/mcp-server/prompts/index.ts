// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";
import {
  campaignSetupWorkflowPrompt,
  getCampaignSetupWorkflowMessage,
} from "./definitions/campaign-setup-workflow.prompt.js";
import {
  msadsReportingWorkflowPrompt,
  getMsAdsReportingWorkflowMessage,
} from "./definitions/reporting-workflow.prompt.js";
import {
  googleImportWorkflowPrompt,
  getGoogleImportWorkflowMessage,
} from "./definitions/google-import-workflow.prompt.js";
import {
  msadsBulkOperationsWorkflowPrompt,
  getMsAdsBulkOperationsWorkflowMessage,
} from "./definitions/bulk-operations-workflow.prompt.js";
import {
  msadsTroubleshootEntityPrompt,
  getMsAdsTroubleshootEntityMessage,
} from "./definitions/troubleshoot-entity.prompt.js";

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
    msadsReportingWorkflowPrompt.name,
    {
      prompt: msadsReportingWorkflowPrompt,
      generateMessage: getMsAdsReportingWorkflowMessage,
    },
  ],
  [
    googleImportWorkflowPrompt.name,
    {
      prompt: googleImportWorkflowPrompt,
      generateMessage: getGoogleImportWorkflowMessage,
    },
  ],
  [
    msadsBulkOperationsWorkflowPrompt.name,
    {
      prompt: msadsBulkOperationsWorkflowPrompt,
      generateMessage: getMsAdsBulkOperationsWorkflowMessage,
    },
  ],
  [
    msadsTroubleshootEntityPrompt.name,
    {
      prompt: msadsTroubleshootEntityPrompt,
      generateMessage: getMsAdsTroubleshootEntityMessage,
    },
  ],
]);

export function getAllPrompts(): Prompt[] {
  return Array.from(promptRegistry.values()).map((def) => def.prompt);
}

export function getPromptDefinition(name: string): PromptDefinition | undefined {
  return promptRegistry.get(name);
}