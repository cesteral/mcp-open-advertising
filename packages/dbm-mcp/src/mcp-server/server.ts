import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { join } from "node:path";
import { allTools } from "./tools/index.js";
import { allResources } from "./resources/index.js";
import { createFindingResources } from "./resources/definitions/findings.resource.js";
import { promptRegistry } from "./prompts/index.js";
import { createRequestContext } from "../utils/internal/request-context.js";
import { sessionServiceStore } from "../services/session-services.js";
import {
  EvaluatorIssueClass,
  extractZodShape,
  registerToolsFromDefinitions,
  registerPromptsFromDefinitions,
  registerStaticResourcesFromDefinitions,
  InteractionLogger,
  LearningExtractor,
  createSubmitLearningTool,
  createLearningsResources,
  type FindingStore,
  type McpServerPromptLike,
  type PromptDefinitionForFactory,
  type ToolExecutionSnapshot,
  type ToolInteractionContext,
  type ToolInteractionEvaluation,
} from "@cesteral/shared";
import type { Logger } from "pino";
import packageJson from "../../package.json" with { type: "json" };

const DBM_PACKAGE_NAME = "dbm-mcp";
const DBM_PLATFORM = "dv360-reporting";
const LEARNINGS_ROOT = join(process.cwd(), "learnings");
const LEARNING_EXTRACTOR = new LearningExtractor({
  learningsRoot: LEARNINGS_ROOT,
  dataDir: join(process.cwd(), "data", "learnings", DBM_PACKAGE_NAME),
});

interface FindingDeps {
  findingStore: FindingStore;
}

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
export async function createMcpServer(
  logger: Logger,
  sessionId?: string,
  findingDeps?: FindingDeps
): Promise<McpServer> {
  const server = new McpServer({
    name: "dbm-mcp",
    version: packageJson.version,
    description: "DV360 reporting and metrics via Bid Manager API v2. Provides read-only access to campaign delivery, performance, pacing, and historical data.",
  });

  // Interaction logger for persisting tool execution data
  const interactionLogger = new InteractionLogger({
    serverName: DBM_PACKAGE_NAME,
    logger,
  });

  // Register all tools via shared factory (includes submit_learning)
  const submitLearningTool = createSubmitLearningTool(LEARNINGS_ROOT);
  const sessionServices = sessionId ? sessionServiceStore.get(sessionId) : undefined;
  registerToolsFromDefinitions({
    server,
    tools: [...allTools, submitLearningTool],
    logger,
    sessionId,
    transformSchema: (schema) => extractZodShape(schema),
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
    interactionLogger,
    learningExtractor: LEARNING_EXTRACTOR,
    findingBuffer: sessionServices?.findingBuffer,
  });

  // Register all resources via shared factory (platform + learnings)
  const learningsResources = createLearningsResources({
    learningsRoot: LEARNINGS_ROOT,
    serverPlatform: "dbm",
  });
  const findingResources = findingDeps
    ? createFindingResources({
        findingStore: findingDeps.findingStore,
        getFindingBuffer: () => sessionId ? sessionServiceStore.get(sessionId)?.findingBuffer : undefined,
      })
    : [];
  registerStaticResourcesFromDefinitions({
    server,
    resources: [...allResources, ...learningsResources, ...findingResources],
    logger,
  });

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
