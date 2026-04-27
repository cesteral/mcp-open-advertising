// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * SA360 MCP Prompts Registry
 */

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";
import {
  toolSchemaExplorationPrompt,
  getToolSchemaExplorationMessage,
} from "./definitions/tool-schema-exploration.prompt.js";
import {
  queryLanguageWorkflowPrompt,
  getQueryLanguageWorkflowMessage,
} from "./definitions/query-language-workflow.prompt.js";
import {
  conversionUploadWorkflowPrompt,
  getConversionUploadWorkflowMessage,
} from "./definitions/conversion-upload-workflow.prompt.js";
import {
  crossEngineReportingWorkflowPrompt,
  getCrossEngineReportingWorkflowMessage,
} from "./definitions/cross-engine-reporting-workflow.prompt.js";
import {
  troubleshootEntityPrompt,
  getTroubleshootEntityMessage,
} from "./definitions/troubleshoot-entity.prompt.js";
import {
  crossPlatformCampaignSetupPrompt,
  getCrossPlatformCampaignSetupMessage,
} from "./definitions/cross-platform-campaign-setup.prompt.js";
import {
  crossPlatformPerformancePrompt,
  getCrossPlatformPerformanceMessage,
} from "./definitions/cross-platform-performance.prompt.js";

export interface PromptDefinition {
  prompt: Prompt;
  generateMessage: (args?: Record<string, string>) => string;
}

export const promptRegistry: Map<string, PromptDefinition> = new Map([
  [
    toolSchemaExplorationPrompt.name,
    {
      prompt: toolSchemaExplorationPrompt,
      generateMessage: getToolSchemaExplorationMessage,
    },
  ],
  [
    queryLanguageWorkflowPrompt.name,
    {
      prompt: queryLanguageWorkflowPrompt,
      generateMessage: getQueryLanguageWorkflowMessage,
    },
  ],
  [
    conversionUploadWorkflowPrompt.name,
    {
      prompt: conversionUploadWorkflowPrompt,
      generateMessage: getConversionUploadWorkflowMessage,
    },
  ],
  [
    crossEngineReportingWorkflowPrompt.name,
    {
      prompt: crossEngineReportingWorkflowPrompt,
      generateMessage: getCrossEngineReportingWorkflowMessage,
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
    crossPlatformCampaignSetupPrompt.name,
    {
      prompt: crossPlatformCampaignSetupPrompt,
      generateMessage: getCrossPlatformCampaignSetupMessage,
    },
  ],
  [
    crossPlatformPerformancePrompt.name,
    {
      prompt: crossPlatformPerformancePrompt,
      generateMessage: getCrossPlatformPerformanceMessage,
    },
  ],
]);

export function getAllPrompts(): Prompt[] {
  return Array.from(promptRegistry.values()).map((def) => def.prompt);
}

export function getPromptDefinition(name: string): PromptDefinition | undefined {
  return promptRegistry.get(name);
}
