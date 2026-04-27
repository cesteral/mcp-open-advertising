// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * MCP Prompt types for dbm-mcp
 */

/**
 * Prompt argument definition
 */
export interface PromptArgument {
  name: string;
  description: string;
  required?: boolean;
}

/**
 * Prompt definition
 */
export interface Prompt {
  name: string;
  description: string;
  arguments?: PromptArgument[];
}

/**
 * Prompt definition with message generator
 */
export interface PromptDefinition {
  prompt: Prompt;
  generateMessage: (args?: Record<string, string>) => string;
}
