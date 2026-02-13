import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { z } from "zod";
import { allTools } from "./tools/index.js";
import { allResources } from "./resources/index.js";
import { promptRegistry } from "./prompts/index.js";
import { createRequestContext } from "../utils/internal/request-context.js";
import { registerToolsFromDefinitions } from "@bidshifter/shared";
import type { Logger } from "pino";

/**
 * Create and configure MCP server instance
 */
export async function createMcpServer(logger: Logger, sessionId?: string): Promise<McpServer> {
  const server = new McpServer({
    name: "dbm-mcp",
    version: "1.0.0",
  });

  // Register all tools via shared factory
  registerToolsFromDefinitions({
    server,
    tools: allTools,
    logger,
    sessionId,
    transformSchema: (schema) =>
      zodToJsonSchema(schema, {
        target: "jsonSchema7",
        markdownDescription: true,
      }),
    createRequestContext: (params) =>
      createRequestContext({
        operation: params.operation,
        additionalContext: params.additionalContext,
      }),
  });

  // Register all resources
  for (const resource of allResources) {
    const resourceName = resource.uri.replace(/[^a-zA-Z0-9]/g, "_");

    server.registerResource(
      resourceName,
      resource.uri,
      {
        description: resource.description,
        mimeType: resource.mimeType,
      },
      async () => {
        logger.info({ resourceUri: resource.uri }, "Handling resource read");

        try {
          const content = resource.getContent();
          return {
            contents: [
              {
                uri: resource.uri,
                mimeType: resource.mimeType,
                text: content,
              },
            ],
          };
        } catch (error) {
          logger.error({ error, resourceUri: resource.uri }, "Failed to read resource");
          throw error;
        }
      }
    );
  }

  logger.info({ resourceCount: allResources.length }, "Registered MCP resources");

  // Register all prompts
  for (const [name, definition] of promptRegistry) {
    const argsSchema = definition.prompt.arguments?.reduce(
      (acc, arg) => {
        const zodType = arg.required
          ? z.string().describe(arg.description)
          : z.string().optional().describe(arg.description);
        acc[arg.name] = zodType;
        return acc;
      },
      {} as Record<string, z.ZodType<string> | z.ZodOptional<z.ZodType<string>>>
    );

    server.registerPrompt(
      name,
      {
        title: definition.prompt.name,
        description: definition.prompt.description,
        ...(argsSchema && Object.keys(argsSchema).length > 0 && { argsSchema }),
      },
      async (args: { [key: string]: string | undefined }) => {
        logger.info({ promptName: name, arguments: args }, "Handling prompt get");

        try {
          const cleanArgs: Record<string, string> = {};
          for (const [key, value] of Object.entries(args)) {
            if (value !== undefined) {
              cleanArgs[key] = value;
            }
          }
          const message = definition.generateMessage(cleanArgs);
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
          logger.error({ error, promptName: name }, "Failed to generate prompt");
          throw error;
        }
      }
    );
  }

  logger.info({ promptCount: promptRegistry.size }, "Registered MCP prompts");

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
