// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Conformance Test Fixtures — Resources & Prompts
 *
 * Resources and prompts required by the MCP conformance test harness
 * (@modelcontextprotocol/conformance). Registered conditionally when
 * MCP_CONFORMANCE_FIXTURES=true, following the same pattern as
 * conformance-echo-tool.ts for tools.
 */

import type { StaticResourceDefinition } from "./resource-handler-factory.js";
import type { PromptDefinitionForFactory } from "./prompt-handler-factory.js";

// ---------------------------------------------------------------------------
// Static resource — test://static-text
// ---------------------------------------------------------------------------

const staticTextResource: StaticResourceDefinition = {
  uri: "test://static-text",
  name: "Static Text Resource",
  description: "A static text resource for MCP conformance testing.",
  mimeType: "text/plain",
  getContent: () => "This is a static text resource for MCP conformance testing.",
};

export const conformanceResources: StaticResourceDefinition[] = [staticTextResource];

// ---------------------------------------------------------------------------
// Resource template — test://template/{id}/data
// ---------------------------------------------------------------------------

export const conformanceResourceTemplate = {
  uriTemplate: "test://template/{id}/data",
  name: "Template Resource",
  description: "A parameterized resource template for MCP conformance testing.",
  mimeType: "text/plain",
  getContent: (id: string): string => `Data for resource ID: ${id}`,
};

// ---------------------------------------------------------------------------
// Prompt — test_simple_prompt (no arguments)
// ---------------------------------------------------------------------------

const simplePrompt: PromptDefinitionForFactory = {
  name: "test_simple_prompt",
  description: "A simple prompt for MCP conformance testing. Returns a static message.",
  generateMessage: () => "This is a simple prompt response for MCP conformance testing.",
};

// ---------------------------------------------------------------------------
// Prompt — test_prompt_with_arguments (arg1 required, arg2 optional)
//
// The argument names are the harness's, not ours: `prompts-get-with-args`
// calls this prompt with `{ arg1, arg2 }` and fails unless both values appear
// in the rendered messages. The fixture used to declare `name` / `greeting`,
// so the SDK rejected the harness's call for a missing required argument and
// the scenario could not pass.
// ---------------------------------------------------------------------------

const promptWithArguments: PromptDefinitionForFactory = {
  name: "test_prompt_with_arguments",
  description:
    "A prompt with arguments for MCP conformance testing. Substitutes arg1 and optional arg2.",
  arguments: [
    {
      name: "arg1",
      description: "First test argument",
      required: true,
    },
    {
      name: "arg2",
      description: "Second test argument",
      required: false,
    },
  ],
  generateMessage: (args?: Record<string, string>): string =>
    `Prompt with arguments: arg1='${args?.arg1 ?? ""}', arg2='${args?.arg2 ?? ""}'`,
};

export const conformancePrompts: PromptDefinitionForFactory[] = [simplePrompt, promptWithArguments];
