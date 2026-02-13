import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { allTools } from "./tools/definitions/index.js";
import { resourceRegistry } from "./resources/index.js";
import { getAllPrompts, getPromptDefinition } from "./prompts/index.js";
import { createRequestContext } from "../utils/internal/request-context.js";
import { ErrorHandler } from "../utils/errors/index.js";
import { registerToolsFromDefinitions } from "@bidshifter/shared";
import type { Logger } from "pino";

/**
 * Extract the raw shape from a Zod schema.
 * The MCP SDK expects ZodRawShape (the shape object), not a full Zod schema.
 */
function extractZodShape(schema: z.ZodTypeAny): z.ZodRawShape {
  let current = schema;
  while (current instanceof z.ZodEffects) {
    current = current._def.schema;
  }
  if (current instanceof z.ZodObject) {
    return current.shape;
  }
  return {};
}

/**
 * Create and configure MCP server instance
 */
export async function createMcpServer(logger: Logger, sessionId?: string): Promise<McpServer> {
  // Register all resources
  resourceRegistry.registerAll();
  logger.info({ resourceCount: resourceRegistry.getResourceCount() }, "Registered MCP resources");

  const server = new McpServer({
    name: "dv360-mcp",
    version: "1.0.0",
  });

  // Register all tools via shared factory
  registerToolsFromDefinitions({
    server,
    tools: allTools,
    logger,
    sessionId,
    transformSchema: (schema) => extractZodShape(schema),
    createRequestContext: (params) =>
      createRequestContext({
        operation: params.operation,
        additionalContext: params.additionalContext,
      }),
  });

  // Register all resources
  const resources = resourceRegistry.getAllResources();
  for (const resource of resources) {
    const isParameterized = resource.uriTemplate.includes("{");
    const resourceId = resource.uriTemplate.replace(/[^a-zA-Z0-9]/g, "_");

    const metadata = {
      title: resource.name,
      description: resource.description,
      mimeType: resource.mimeType || "application/json",
    };

    if (isParameterized) {
      const template = new ResourceTemplate(resource.uriTemplate, {
        list: resource.list
          ? async () => {
              const items = await resource.list!();
              return {
                resources: items.map((item) => ({
                  uri: item.uri,
                  name: item.name,
                  description: item.description,
                  mimeType: item.mimeType || "application/json",
                })),
              };
            }
          : undefined,
      });

      server.registerResource(
        resourceId,
        template,
        metadata,
        async (uri, variables) => {
          logger.info({ uri: uri.href, variables }, "Reading parameterized resource");
          const match = resourceRegistry.findResourceByUri(uri.href);
          if (!match) {
            throw new Error(`Resource not found: ${uri.href}`);
          }
          try {
            const content = await match.resource.read(match.params);
            return {
              contents: [
                {
                  uri: content.uri,
                  mimeType: content.mimeType,
                  text: content.text,
                },
              ],
            };
          } catch (error) {
            logger.error({ uri: uri.href, error }, "Failed to read resource");
            const mcpError = ErrorHandler.handleError(
              error,
              { operation: "resource:read", context: { uri: uri.href } },
              logger
            );
            throw new Error(`Failed to read resource: ${mcpError.message}`);
          }
        }
      );
    } else {
      server.registerResource(
        resourceId,
        resource.uriTemplate,
        metadata,
        async (uri) => {
          logger.info({ uri: uri.href }, "Reading static resource");
          const match = resourceRegistry.findResourceByUri(uri.href);
          if (!match) {
            throw new Error(`Resource not found: ${uri.href}`);
          }
          try {
            const content = await match.resource.read(match.params);
            return {
              contents: [
                {
                  uri: content.uri,
                  mimeType: content.mimeType,
                  text: content.text,
                },
              ],
            };
          } catch (error) {
            logger.error({ uri: uri.href, error }, "Failed to read resource");
            const mcpError = ErrorHandler.handleError(
              error,
              { operation: "resource:read", context: { uri: uri.href } },
              logger
            );
            throw new Error(`Failed to read resource: ${mcpError.message}`);
          }
        }
      );
    }
  }

  // Register all prompts
  const allPrompts = getAllPrompts();
  for (const prompt of allPrompts) {
    const argsSchema = prompt.arguments?.reduce((acc, arg) => {
      acc[arg.name] = {
        type: "string",
        description: arg.description,
      };
      return acc;
    }, {} as Record<string, any>);

    server.registerPrompt(
      prompt.name,
      {
        title: prompt.name,
        description: prompt.description,
        ...(argsSchema && { argsSchema }),
      },
      async (args: Record<string, string> | undefined) => {
        logger.info({ promptName: prompt.name, arguments: args }, "Handling prompt request");

        const promptDef = getPromptDefinition(prompt.name);

        if (!promptDef) {
          logger.error({ promptName: prompt.name }, "Prompt not found");
          throw new Error(`Prompt not found: ${prompt.name}`);
        }

        try {
          const message = promptDef.generateMessage(args);

          return {
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: message,
                },
              },
            ],
          };
        } catch (error) {
          logger.error({ promptName: prompt.name, error }, "Failed to generate prompt");

          const mcpError = ErrorHandler.handleError(
            error,
            {
              operation: `prompt:get`,
              context: {
                name: prompt.name,
                args,
              },
            },
            logger
          );

          throw new Error(`Failed to generate prompt: ${mcpError.message}`);
        }
      }
    );
  }

  return server;
}

/**
 * Connect server to stdio transport (for local MCP client testing)
 */
export async function runStdioServer(server: McpServer, logger: Logger): Promise<void> {
  logger.info("Starting MCP server with stdio transport");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP server connected via stdio");
}
