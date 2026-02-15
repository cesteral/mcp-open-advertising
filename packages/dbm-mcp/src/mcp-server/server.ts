import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { allTools } from "./tools/index.js";
import { allResources } from "./resources/index.js";
import { promptRegistry } from "./prompts/index.js";
import { createRequestContext } from "../utils/internal/request-context.js";
import {
  EvaluatorIssueClass,
  registerToolsFromDefinitions,
  registerPromptsFromDefinitions,
  registerStaticResourcesFromDefinitions,
  type McpServerPromptLike,
  type PromptDefinitionForFactory,
  type ToolExecutionSnapshot,
  type ToolInteractionContext,
  type ToolInteractionEvaluation,
} from "@cesteral/shared";
import type { Logger } from "pino";
import packageJson from "../../package.json";

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
    version: packageJson.version,
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

  // Register all resources via shared factory
  registerStaticResourcesFromDefinitions({ server, resources: allResources, logger });

  // Register all prompts via shared factory
  const allPrompts: PromptDefinitionForFactory[] = Array.from(promptRegistry.values()).map((def) => ({
    name: def.prompt.name,
    description: def.prompt.description ?? "",
    arguments: def.prompt.arguments,
    generateMessage: def.generateMessage,
  }));
  registerPromptsFromDefinitions({ server: server as unknown as McpServerPromptLike, prompts: allPrompts, logger });

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
