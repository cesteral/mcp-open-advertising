import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { allTools } from "./tools/index.js";
import { allResources } from "./resources/index.js";
import { getAllPrompts, getPromptDefinition } from "./prompts/index.js";
import { createRequestContext } from "../utils/internal/request-context.js";
import {
  EvaluatorIssueClass,
  registerToolsFromDefinitions,
  type ToolExecutionSnapshot,
  type ToolInteractionContext,
  type ToolInteractionEvaluation,
} from "@bidshifter/shared";
import type { Logger } from "pino";

const TTD_PACKAGE_NAME = "ttd-mcp";
const TTD_PLATFORM = "ttd";

const ttdWorkflowIdByToolName: Record<string, string> = {
  ttd_list_entities: "mcp.execute.ttd_entity_update",
  ttd_get_entity: "mcp.execute.ttd_entity_update",
  ttd_create_entity: "mcp.execute.ttd_entity_update",
  ttd_update_entity: "mcp.execute.ttd_entity_update",
  ttd_delete_entity: "mcp.execute.ttd_entity_update",
  ttd_get_report: "mcp.execute.ttd_entity_update",
};

async function evaluateTtdInteraction(
  snapshot: ToolExecutionSnapshot,
  interactionContext: ToolInteractionContext
): Promise<ToolInteractionEvaluation> {
  const issues: ToolInteractionEvaluation["issues"] = [];
  if (
    interactionContext.workflowId === "mcp.execute.ttd_entity_update" &&
    typeof snapshot.validatedInput === "object" &&
    snapshot.validatedInput &&
    "data" in (snapshot.validatedInput as Record<string, unknown>)
  ) {
    const data = (snapshot.validatedInput as Record<string, unknown>).data;
    if (typeof data === "object" && data && Object.keys(data as Record<string, unknown>).length > 25) {
      issues.push({
        class: EvaluatorIssueClass.InputQuality,
        message: "TTD payload contains many fields; consider smaller staged updates",
        isRecoverable: true,
      });
    }
  }

  if (snapshot.durationMs > 20_000) {
    issues.push({
      class: EvaluatorIssueClass.Efficiency,
      message: "Tool latency exceeded 20s threshold",
      isRecoverable: true,
    });
  }

  return {
    issues,
    recommendationAction: issues.length > 0 ? "propose_playbook_delta" : "none",
  };
}

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
  const server = new McpServer({
    name: "ttd-mcp",
    version: "1.0.0",
    description: "The Trade Desk campaign entity management and reporting via TTD API v3. Supports CRUD operations on advertisers, campaigns, ad groups, and ads, plus async report generation.",
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
    defaultTextFormat: "compact",
    packageName: TTD_PACKAGE_NAME,
    platform: TTD_PLATFORM,
    workflowIdByToolName: ttdWorkflowIdByToolName,
    evaluator: {
      enabled: process.env.MCP_EVALUATOR_ENABLED !== "false",
      observeOnly: process.env.MCP_EVALUATOR_OBSERVE_ONLY !== "false",
      evaluate: evaluateTtdInteraction,
    },
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
          logger.debug(
            {
              resourceUri: resource.uri,
              contentBytes: Buffer.byteLength(content, "utf-8"),
            },
            "Resource content size"
          );
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
  const allPrompts = getAllPrompts();
  for (const prompt of allPrompts) {
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
      async (args: Record<string, string | undefined> | undefined) => {
        logger.info({ promptName: prompt.name, arguments: args }, "Handling prompt request");

        const promptDef = getPromptDefinition(prompt.name);
        if (!promptDef) {
          throw new Error(`Prompt not found: ${prompt.name}`);
        }

        const cleanArgs: Record<string, string> = {};
        if (args) {
          for (const [key, value] of Object.entries(args)) {
            if (value !== undefined) {
              cleanArgs[key] = value;
            }
          }
        }

        const message = promptDef.generateMessage(cleanArgs);
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
