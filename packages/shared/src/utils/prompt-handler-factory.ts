// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Prompt Handler Factory
 *
 * Extracts common MCP prompt registration boilerplate into a reusable handler.
 * Follows the same pattern as registerToolsFromDefinitions().
 */

import { z } from "zod";
import type { Logger } from "pino";

/**
 * Prompt argument definition — matches the MCP SDK Prompt type.
 */
export interface PromptArgumentForFactory {
  name: string;
  description?: string;
  required?: boolean;
}

/**
 * Prompt definition passed to the factory.
 */
export interface PromptDefinitionForFactory {
  name: string;
  description: string;
  arguments?: PromptArgumentForFactory[];
  generateMessage: (args?: Record<string, string>) => string;
}

/**
 * Structural type for McpServer prompt registration.
 */
export interface McpServerPromptLike {
  registerPrompt(
    name: string,
    config: {
      title?: string;
      description: string;
      argsSchema?: Record<string, z.ZodType<string> | z.ZodOptional<z.ZodType<string>>>;
    },
    handler: (args: Record<string, string | undefined> | undefined, extra: unknown) => {
      messages: Array<{
        role: "user" | "assistant";
        content: { type: "text"; text: string };
      }>;
    } | Promise<{
      messages: Array<{
        role: "user" | "assistant";
        content: { type: "text"; text: string };
      }>;
    }>
  ): unknown;
}

export interface RegisterPromptsOptions {
  server: McpServerPromptLike;
  prompts: PromptDefinitionForFactory[];
  logger: Logger;
}

/**
 * Register all prompts on an McpServer with standardized handling.
 */
export function registerPromptsFromDefinitions(opts: RegisterPromptsOptions): void {
  const { server, prompts, logger } = opts;

  for (const prompt of prompts) {
    const argsSchema = prompt.arguments?.reduce(
      (acc, arg) => {
        const description = arg.description || `${arg.name} argument`;
        const zodType = arg.required
          ? z.string().describe(description)
          : z.string().optional().describe(description);
        acc[arg.name] = zodType;
        return acc;
      },
      {} as Record<string, z.ZodType<string> | z.ZodOptional<z.ZodType<string>>>
    );

    server.registerPrompt(
      prompt.name,
      {
        title: prompt.name,
        description: prompt.description,
        ...(argsSchema && Object.keys(argsSchema).length > 0 && { argsSchema }),
      },
      async (args: Record<string, string | undefined> | undefined, _extra: unknown) => {
        logger.info({ promptName: prompt.name, arguments: args }, "Handling prompt request");

        try {
          const cleanArgs: Record<string, string> = {};
          if (args) {
            for (const [key, value] of Object.entries(args)) {
              if (value !== undefined) {
                cleanArgs[key] = value;
              }
            }
          }
          const message = prompt.generateMessage(cleanArgs);

          return {
            messages: [
              {
                role: "user" as const,
                content: {
                  type: "text" as const,
                  text: message,
                },
              },
            ],
          };
        } catch (error) {
          logger.error({ error, promptName: prompt.name }, "Failed to generate prompt");
          throw error;
        }
      }
    );
  }

  logger.info({ promptCount: prompts.length }, "Registered MCP prompts");
}