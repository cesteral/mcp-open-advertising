import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { allTools } from "./tools/index.js";
import { createRequestContext } from "../utils/internal/request-context.js";
import { ErrorHandler } from "../utils/errors/index.js";
import { withToolSpan, setSpanAttribute, recordSpanError } from "../utils/telemetry/index.js";
import type { Logger } from "pino";
import type { SdkContext } from "../types-global/mcp.js";

/**
 * Create and configure MCP server instance
 */
export async function createMcpServer(logger: Logger): Promise<McpServer> {
  const server = new McpServer({
    name: "dbm-mcp",
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
              elicitInput: async (params: Record<string, unknown>) => {
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

  logger.info({ toolCount: allTools.length }, "Registered MCP tools");

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
