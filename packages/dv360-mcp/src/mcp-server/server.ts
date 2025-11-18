import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { allTools } from "./tools/definitions/index.js";
import { createRequestContext } from "../utils/internal/requestContext.js";
import { ErrorHandler } from "../utils/errors/index.js";
import { withToolSpan, setSpanAttribute, recordSpanError } from "../utils/telemetry/index.js";
import type { Logger } from "pino";
import type { SdkContext } from "../types-global/mcp.js";

/**
 * Create and configure MCP server instance
 */
export function createMcpServer(logger: Logger): Server {
  const server = new Server(
    {
      name: "dv360-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        elicitation: {},
        // resources: {}, // Will be added in Phase 2
        // prompts: {}, // Will be added in Phase 2
      },
    }
  );

  // Register tools/list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    logger.info("Handling tools/list request");

    return {
      tools: allTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: zodToJsonSchema(tool.inputSchema, {
          target: "jsonSchema7",
          markdownDescription: true,
        }) as any,
      })),
    };
  });

  // Register tools/call handler
  server.setRequestHandler(CallToolRequestSchema, async (
    request: CallToolRequest,
    _extra
  ) => {
    const { name, arguments: args } = request.params;

    logger.info({ toolName: name, arguments: args }, "Handling tools/call request");

    // Find the tool
    const tool = allTools.find((t) => t.name === name);
    if (!tool) {
      logger.error({ toolName: name }, "Tool not found");
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: Tool '${name}' not found`,
          },
        ],
        isError: true,
      };
    }

    // Wrap tool execution in OpenTelemetry span
    return withToolSpan(name, args || {}, async () => {
      try {
        // Create request context
        const context = createRequestContext({
          operation: `HandleToolRequest:${name}`,
          additionalContext: {
            toolName: name,
            input: args,
          },
        });

        // Validate input
        const validatedInput = tool.inputSchema.parse(args);
        setSpanAttribute("tool.input.validated", true);

        const sdkContext: SdkContext = {
          requestId: context.requestId,
          elicitInput: async (params) => server.elicitInput({ ...params }),
        };

        // Execute tool logic (cast to any since each tool has unique I/O types)
        const result = await (tool.logic as any)(
          validatedInput,
          context,
          sdkContext
        );
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

        logger.info({ toolName: name, requestId: context.requestId }, "Tool executed successfully");

        return {
          content,
        };
      } catch (error) {
        recordSpanError(error as Error);
        setSpanAttribute("tool.execution.success", false);

        const mcpError = ErrorHandler.handleError(
          error,
          {
            operation: `tool:${name}`,
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
  });

  return server;
}

/**
 * Connect server to stdio transport (for local MCP client testing)
 */
export async function runStdioServer(server: Server, logger: Logger): Promise<void> {
  logger.info("Starting MCP server with stdio transport");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP server connected via stdio");
}
