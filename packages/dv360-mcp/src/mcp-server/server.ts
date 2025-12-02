import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { allTools } from "./tools/definitions/index.js";
import { resourceRegistry } from "./resources/index.js";
import { getAllPrompts, getPromptDefinition } from "./prompts/index.js";
import { createRequestContext } from "../utils/internal/request-context.js";
import { ErrorHandler } from "../utils/errors/index.js";
import { withToolSpan, setSpanAttribute, recordSpanError } from "../utils/telemetry/index.js";
import type { Logger } from "pino";
import type { SdkContext } from "../types-global/mcp.js";

/**
 * Create and configure MCP server instance
 */
export async function createMcpServer(logger: Logger): Promise<McpServer> {
  // Register all resources
  resourceRegistry.registerAll();
  logger.info({ resourceCount: resourceRegistry.getResourceCount() }, "Registered MCP resources");

  const server = new McpServer({
    name: "dv360-mcp",
    version: "1.0.0",
  });

  // Register all tools
  for (const tool of allTools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: zodToJsonSchema(tool.inputSchema, {
          target: "jsonSchema7",
          markdownDescription: true,
        }) as any,
      },
      async (args: unknown) => {
        logger.info({ toolName: tool.name, arguments: args }, "Handling tool call");

        // Wrap tool execution in OpenTelemetry span
        return withToolSpan(tool.name, (args as any) || {}, async () => {
          try {
            // Create request context
            const context = createRequestContext({
              operation: `HandleToolRequest:${tool.name}`,
              additionalContext: {
                toolName: tool.name,
                input: args,
              },
            });

            // Validate input
            const validatedInput = tool.inputSchema.parse(args);
            setSpanAttribute("tool.input.validated", true);

            const sdkContext: SdkContext = {
              requestId: context.requestId,
              elicitInput: async (params) => {
                // Note: elicitInput may need to be verified in newer SDK versions
                if (typeof (server as any).elicitInput === "function") {
                  return (server as any).elicitInput({ ...params });
                }
                throw new Error("elicitInput not available in current SDK version");
              },
            };

            // Execute tool logic (cast to any since each tool has unique I/O types)
            const result = await (tool.logic as any)(validatedInput, context, sdkContext);
            setSpanAttribute("tool.execution.success", true);

            // Format response
            const content = tool.responseFormatter
              ? (tool.responseFormatter as any)(result, validatedInput)
              : [
                  {
                    type: "text" as const,
                    text: JSON.stringify(result, null, 2),
                  },
                ];

            logger.info({ toolName: tool.name, requestId: context.requestId }, "Tool executed successfully");

            return {
              content,
            };
          } catch (error) {
            recordSpanError(error as Error);
            setSpanAttribute("tool.execution.success", false);

            const mcpError = ErrorHandler.handleError(
              error,
              {
                operation: `tool:${tool.name}`,
                input: args,
              },
              logger
            );

            return {
              content: [
                {
                  type: "text" as const,
                  text: `Error: ${mcpError.message}`,
                },
              ],
              isError: true,
            };
          }
        });
      }
    );
  }

  // Register all resources
  // Note: Using manual resource registration due to McpServer's registerResource API
  // being unclear in SDK v1.0.2. May need to update when SDK stabilizes.
  const resources = resourceRegistry.getAllResources();
  for (const resource of resources) {
    // For resources with list capability, register multiple URIs
    if (resource.list) {
      const listItems = await resource.list();
      for (const item of listItems) {
        // Register each specific resource URI
        (server as any).registerResource?.(
          item.uri.replace(/[^a-zA-Z0-9]/g, "_"),
          resource.uriTemplate,
          {
            title: item.name,
            description: item.description || resource.description,
            mimeType: item.mimeType || resource.mimeType || "application/json",
          },
          async (uri: any) => {
            logger.info({ uri: uri.href }, "Reading resource");
            const match = resourceRegistry.findResourceByUri(uri.href);
            if (!match) {
              throw new Error(`Resource not found: ${uri.href}`);
            }
            try {
              const content = await match.resource.read(match.params);
              return {
                contents: [content],
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
    } else {
      // Register single resource
      (server as any).registerResource?.(
        resource.uriTemplate.replace(/[^a-zA-Z0-9]/g, "_"),
        resource.uriTemplate,
        {
          title: resource.name,
          description: resource.description,
          mimeType: resource.mimeType || "application/json",
        },
        async (uri: any, params: any) => {
          logger.info({ uri: uri.href, params }, "Reading resource");
          try {
            const content = await resource.read(params);
            return {
              contents: [content],
            };
          } catch (error) {
            logger.error({ uri: uri.href, error }, "Failed to read resource");
            const mcpError = ErrorHandler.handleError(
              error,
              { operation: "resource:read", context: { uri: uri.href, params } },
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
    // Convert prompt arguments to Zod schema for the new API
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
          // Generate prompt message with user-provided arguments
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
