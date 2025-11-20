import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  type CallToolRequest,
  type ReadResourceRequest,
  type GetPromptRequest,
} from "@modelcontextprotocol/sdk/types.js";
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
export function createMcpServer(logger: Logger): Server {
  // Register all resources
  resourceRegistry.registerAll();
  logger.info({ resourceCount: resourceRegistry.getResourceCount() }, "Registered MCP resources");

  const server = new Server(
    {
      name: "dv360-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        elicitation: {},
        resources: {}, // Phase 2.1: Resource support added
        prompts: {}, // Phase 2.2: Prompt support added
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
  server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest, _extra) => {
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

  // Register resources/list handler
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    logger.info("Handling resources/list request");

    const resources = resourceRegistry.getAllResources();

    // Get list items from all resources
    const resourceItems = await Promise.all(
      resources.map(async (resource) => {
        if (resource.list) {
          return await resource.list();
        }
        // If no list function, return basic info
        return [
          {
            uri: resource.uriTemplate,
            name: resource.name,
            description: resource.description,
            mimeType: resource.mimeType || "application/json",
          },
        ];
      })
    );

    return {
      resources: resourceItems.flat(),
    };
  });

  // Register resources/read handler
  server.setRequestHandler(ReadResourceRequestSchema, async (request: ReadResourceRequest) => {
    const { uri } = request.params;

    logger.info({ uri }, "Handling resources/read request");

    // Find matching resource
    const match = resourceRegistry.findResourceByUri(uri);

    if (!match) {
      logger.error({ uri }, "Resource not found");
      throw new Error(`Resource not found: ${uri}`);
    }

    const { resource, params } = match;

    try {
      // Read the resource
      const content = await resource.read(params);

      return {
        contents: [content],
      };
    } catch (error) {
      logger.error({ uri, error }, "Failed to read resource");

      const mcpError = ErrorHandler.handleError(
        error,
        {
          operation: `resource:read`,
          context: {
            uri,
            params,
          },
        },
        logger
      );

      throw new Error(`Failed to read resource: ${mcpError.message}`);
    }
  });

  // Register prompts/list handler
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    logger.info("Handling prompts/list request");

    return {
      prompts: getAllPrompts(),
    };
  });

  // Register prompts/get handler
  server.setRequestHandler(GetPromptRequestSchema, async (request: GetPromptRequest) => {
    const { name, arguments: args } = request.params;

    logger.info({ promptName: name, arguments: args }, "Handling prompts/get request");

    const promptDef = getPromptDefinition(name);

    if (!promptDef) {
      logger.error({ promptName: name }, "Prompt not found");
      throw new Error(`Prompt not found: ${name}`);
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
      logger.error({ promptName: name, error }, "Failed to generate prompt");

      const mcpError = ErrorHandler.handleError(
        error,
        {
          operation: `prompt:get`,
          context: {
            name,
            args,
          },
        },
        logger
      );

      throw new Error(`Failed to generate prompt: ${mcpError.message}`);
    }
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
