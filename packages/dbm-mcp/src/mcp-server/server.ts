import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { zodToJsonSchema } from "zod-to-json-schema";
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

const DBM_PACKAGE_NAME = "dbm-mcp";
const DBM_PLATFORM = "dv360-reporting";

const dbmWorkflowIdByToolName: Record<string, string> = {
  get_campaign_delivery: "mcp.troubleshoot.delivery",
  get_performance_metrics: "mcp.troubleshoot.delivery",
  get_historical_metrics: "mcp.troubleshoot.delivery",
  get_pacing_status: "mcp.troubleshoot.delivery",
  run_custom_query: "mcp.execute.dbm_custom_query",
};

async function evaluateDbmInteraction(
  snapshot: ToolExecutionSnapshot,
  interactionContext: ToolInteractionContext
): Promise<ToolInteractionEvaluation> {
  const issues: ToolInteractionEvaluation["issues"] = [];
  if (snapshot.durationMs > 15_000) {
    issues.push({
      class: EvaluatorIssueClass.Efficiency,
      message: "Tool latency exceeded 15s threshold",
      isRecoverable: true,
    });
  }
  if (
    interactionContext.workflowId === "mcp.execute.dbm_custom_query" &&
    typeof snapshot.validatedInput === "object" &&
    snapshot.validatedInput &&
    "dimensions" in (snapshot.validatedInput as Record<string, unknown>) &&
    Array.isArray((snapshot.validatedInput as Record<string, unknown>).dimensions) &&
    ((snapshot.validatedInput as Record<string, unknown>).dimensions as unknown[]).length > 12
  ) {
    issues.push({
      class: EvaluatorIssueClass.InputQuality,
      message: "Query dimensions may be broader than necessary",
      isRecoverable: true,
    });
  }
  return {
    issues,
    recommendationAction: issues.length > 0 ? "propose_playbook_delta" : "none",
  };
}

/**
 * Create and configure MCP server instance
 */
export async function createMcpServer(logger: Logger, sessionId?: string): Promise<McpServer> {
  const server = new McpServer({
    name: "dbm-mcp",
    version: "1.0.0",
    description: "DV360 reporting and metrics via Bid Manager API v2. Provides read-only access to campaign delivery, performance, pacing, and historical data.",
  });

  // Register all tools via shared factory
  registerToolsFromDefinitions({
    server,
    tools: allTools,
    logger,
    sessionId,
    transformSchema: (schema) =>
      zodToJsonSchema(schema, {
        // MCP Spec 2025-11-25 defaults to JSON Schema 2020-12.
        // zod-to-json-schema doesn't have a 2020-12 target; 2019-09 is the
        // closest available (uses $defs, modern keywords). Schemas without
        // $schema field are treated as 2020-12 by MCP clients.
        target: "jsonSchema2019-09",
        markdownDescription: true,
      }),
    createRequestContext: (params) =>
      createRequestContext({
        operation: params.operation,
        additionalContext: params.additionalContext,
      }),
    defaultTextFormat: "compact",
    packageName: DBM_PACKAGE_NAME,
    platform: DBM_PLATFORM,
    workflowIdByToolName: dbmWorkflowIdByToolName,
    evaluator: {
      enabled: process.env.MCP_EVALUATOR_ENABLED !== "false",
      observeOnly: process.env.MCP_EVALUATOR_OBSERVE_ONLY !== "false",
      evaluate: evaluateDbmInteraction,
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
        const zodType = arg.required
          ? z.string().describe(arg.description)
          : z.string().optional().describe(arg.description);
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
        logger.info({ promptName: prompt.name, arguments: args }, "Handling prompt get");

        const promptDefinition = getPromptDefinition(prompt.name);
        if (!promptDefinition) {
          throw new Error(`Prompt not found: ${prompt.name}`);
        }

        try {
          const cleanArgs: Record<string, string> = {};
          if (args) {
            for (const [key, value] of Object.entries(args)) {
              if (value !== undefined) {
                cleanArgs[key] = value;
              }
            }
          }
          const message = promptDefinition.generateMessage(cleanArgs);
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
          logger.error({ error, promptName: prompt.name }, "Failed to generate prompt");
          throw error;
        }
      }
    );
  }

  logger.info({ promptCount: allPrompts.length }, "Registered MCP prompts");

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
