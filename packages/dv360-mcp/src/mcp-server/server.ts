import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { allTools } from "./tools/definitions/index.js";
import { resourceRegistry } from "./resources/index.js";
import { getAllPrompts, getPromptDefinition } from "./prompts/index.js";
import { createRequestContext } from "../utils/internal/request-context.js";
import { ErrorHandler } from "../utils/errors/index.js";
import { withToolSpan, setSpanAttribute, recordSpanError } from "../utils/telemetry/index.js";
import type { Logger } from "pino";
import type { SdkContext } from "../types-global/mcp.js";

/**
 * Extract the raw shape from a Zod schema
 * The MCP SDK expects ZodRawShape (the shape object), not a full Zod schema
 */
function extractZodShape(schema: z.ZodTypeAny): z.ZodRawShape {
  // Unwrap effects (refinements, transforms, etc.)
  let current = schema;
  while (current instanceof z.ZodEffects) {
    current = current._def.schema;
  }

  // Extract shape from ZodObject
  if (current instanceof z.ZodObject) {
    return current.shape;
  }

  // Fallback for non-object schemas
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

  // Register all tools
  for (const tool of allTools) {
    // Extract the raw shape from the Zod schema
    // MCP SDK v1.21+ expects ZodRawShape, not JSON schema
    const inputShape = extractZodShape(tool.inputSchema);

    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: inputShape,
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
              sessionId,
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
  // Each resource template is registered once - the list() function provides
  // discovery info for clients, but registration happens once per template
  const resources = resourceRegistry.getAllResources();
  for (const resource of resources) {
    // Check if this is a parameterized resource (contains {param} placeholders)
    const isParameterized = resource.uriTemplate.includes("{");

    // Generate unique resource ID from template
    const resourceId = resource.uriTemplate.replace(/[^a-zA-Z0-9]/g, "_");

    // Resource metadata
    const metadata = {
      title: resource.name,
      description: resource.description,
      mimeType: resource.mimeType || "application/json",
    };

    if (isParameterized) {
      // For parameterized resources, use ResourceTemplate
      const template = new ResourceTemplate(resource.uriTemplate, {
        list: resource.list
          ? async () => {
              const items = await resource.list!();
              // Convert resource list items to the format expected by MCP SDK
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
            // Return format expected by MCP SDK
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
      // For static resources, use the URI string directly
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
            // Return format expected by MCP SDK
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
