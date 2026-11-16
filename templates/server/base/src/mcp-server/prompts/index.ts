// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Prompts. The two fleet-wide cross-platform prompts come from
 * @cesteral/shared and must not be copied (scripts/lib/cross-platform-prompts.test.mjs).
 * Add platform workflow prompts beside them; their text may only name
 * registered tools (scripts/lib/prompt-tool-references.test.mjs).
 */

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";
import {
  crossPlatformCampaignSetupPrompt,
  crossPlatformPerformancePrompt,
  getCrossPlatformCampaignSetupMessage,
  getCrossPlatformPerformanceMessage,
} from "@cesteral/shared";

export interface PromptDefinition {
  prompt: Prompt;
  generateMessage: (args?: Record<string, string>) => string;
}

export const promptRegistry: Map<string, PromptDefinition> = new Map([
  [
    crossPlatformPerformancePrompt.name,
    { prompt: crossPlatformPerformancePrompt, generateMessage: getCrossPlatformPerformanceMessage },
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
