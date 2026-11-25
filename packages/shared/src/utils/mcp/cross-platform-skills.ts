// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Cross-platform skills (Skills over MCP, SEP-2640) — prototype.
 *
 * A prompt has to be picked by the user; a skill is something the model can
 * pull in by itself during multi-step work. `cross-platform-campaign-setup` is
 * the `cross_platform_campaign_setup` prompt published as a skill, rendered
 * from the same generator in `cross-platform-prompts.ts`, so the prompt and
 * the skill cannot drift: changing the prompt text changes the skill body.
 *
 * The skill has no arguments, so the body is rendered with the three prompt
 * arguments left as `{placeholders}` and a preamble telling the model to fill
 * them from the conversation.
 *
 * The files map is in the shape `SkillsExtension.load(memorySkillFiles(...))`
 * takes: paths relative to the skills root, one folder per skill, each with a
 * `SKILL.md` whose frontmatter `name` equals the folder name.
 */

import {
  crossPlatformCampaignSetupPrompt,
  getCrossPlatformCampaignSetupMessage,
} from "./cross-platform-prompts.js";

/** The skill's name, folder and final `skill://` path segment. */
export const CROSS_PLATFORM_CAMPAIGN_SETUP_SKILL_NAME = "cross-platform-campaign-setup";

/** Agent Skills frontmatter limit on `description` (agentskills.io specification). */
export const SKILL_DESCRIPTION_MAX_LENGTH = 1024;

/** The skill's frontmatter `description`: the prompt's, plus when to reach for it. */
export const CROSS_PLATFORM_CAMPAIGN_SETUP_SKILL_DESCRIPTION =
  `${crossPlatformCampaignSetupPrompt.description} ` +
  "Use when planning, budgeting or launching one campaign on more than one ad platform.";

/** `SKILL.md` for `skill://cross-platform-campaign-setup/SKILL.md`. */
export function renderCrossPlatformCampaignSetupSkill(): string {
  const body = getCrossPlatformCampaignSetupMessage({
    totalBudget: "{totalBudget}",
    currency: "{currency}",
    objective: "{objective}",
  });
  // A JSON string is a valid YAML double-quoted scalar, so the description needs
  // no hand-escaping however its text changes.
  return `---
name: ${CROSS_PLATFORM_CAMPAIGN_SETUP_SKILL_NAME}
description: ${JSON.stringify(CROSS_PLATFORM_CAMPAIGN_SETUP_SKILL_DESCRIPTION)}
---

> Fill \`{totalBudget}\`, \`{currency}\` and \`{objective}\` (awareness, consideration or conversion; default conversion) from the user's request before following this guide. The same guidance is the \`${crossPlatformCampaignSetupPrompt.name}\` prompt.

${body}`;
}

/**
 * Every cross-platform skill, as files under a skills root. Built once: the
 * SDK catalog built from it is memoised on this object's identity.
 */
export const CROSS_PLATFORM_SKILL_FILES: Readonly<Record<string, string>> = Object.freeze({
  [`${CROSS_PLATFORM_CAMPAIGN_SETUP_SKILL_NAME}/SKILL.md`]: renderCrossPlatformCampaignSetupSkill(),
});
