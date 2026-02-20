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
  type PromptArgumentForFactory,
  createDefaultWorkflowEvaluator,
  createWorkflowLifecycleTools,
  type ToolExecutionSnapshot,
  type ToolInteractionContext,
  type ToolInteractionEvaluation,
} from "@cesteral/shared";
import type { Logger } from "pino";
import packageJson from "../../package.json" with { type: "json" };

const TTD_PACKAGE_NAME = "ttd-mcp";
const TTD_PLATFORM = "ttd";
const LEARNINGS_ROOT = join(process.cwd(), "learnings");
const LEARNING_EXTRACTOR = new LearningExtractor({
  learningsRoot: LEARNINGS_ROOT,
  dataDir: join(process.cwd(), "data", "learnings", TTD_PACKAGE_NAME),
});

interface FindingDeps {
  findingStore: FindingStore;
}

const ttdWorkflowIdByToolName: Record<string, string> = {
  // Read operations
  ttd_list_entities: "mcp.execute.ttd_entity_read",
  ttd_get_entity: "mcp.execute.ttd_entity_read",
  // Write operations
  ttd_create_entity: "mcp.execute.ttd_entity_update",
  ttd_update_entity: "mcp.execute.ttd_entity_update",
  ttd_delete_entity: "mcp.execute.ttd_entity_update",
  ttd_validate_entity: "mcp.execute.ttd_entity_update",
  // Reporting
  ttd_get_report: "mcp.execute.ttd_reporting",
  ttd_download_report: "mcp.execute.ttd_reporting",
  // Bulk operations
  ttd_bulk_create_entities: "mcp.execute.ttd_bulk_operations",
  ttd_bulk_update_entities: "mcp.execute.ttd_bulk_operations",
  ttd_bulk_update_status: "mcp.execute.ttd_bulk_operations",
  ttd_archive_entities: "mcp.execute.ttd_bulk_operations",
  ttd_adjust_bids: "mcp.execute.ttd_bulk_operations",
  // GraphQL
  ttd_graphql_query: "mcp.execute.ttd_graphql",
  ttd_graphql_query_bulk: "mcp.execute.ttd_graphql",
  ttd_graphql_mutation_bulk: "mcp.execute.ttd_graphql",
  ttd_graphql_bulk_job: "mcp.execute.ttd_graphql",
  ttd_graphql_cancel_bulk_job: "mcp.execute.ttd_graphql",
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
 * Create and configure MCP server instance
 */
export async function createMcpServer(
  logger: Logger,
  sessionId?: string,
  findingDeps?: FindingDeps
): Promise<McpServer> {
  const server = new McpServer({
    name: "ttd-mcp",
    version: packageJson.version,
    description: "The Trade Desk campaign management, reporting, and optimization via TTD API v3 + GraphQL. Supports 9 entity types (advertiser, campaign, adGroup, ad, creative, siteList, deal, conversionTracker, bidList), bulk operations, bid adjustments, GraphQL passthrough, and async report generation with download/parse.",
  });

  // Interaction logger for persisting tool execution data
  const interactionLogger = new InteractionLogger({
    serverName: TTD_PACKAGE_NAME,
    logger,
  });

  // Register all tools via shared factory (includes submit_learning + workflow lifecycle)
  const submitLearningTool = createSubmitLearningTool(LEARNINGS_ROOT);
  const sessionServices = sessionId ? sessionServiceStore.get(sessionId) : undefined;
  const workflowEvaluator = createDefaultWorkflowEvaluator();
  const workflowTools = createWorkflowLifecycleTools({
    getTracker: () => sessionServices?.workflowTracker,
    getEvaluator: () => workflowEvaluator,
    getFindingBuffer: () => sessionServices?.findingBuffer,
    platform: TTD_PLATFORM,
    packageName: TTD_PACKAGE_NAME,
    sessionId,
  });
  registerToolsFromDefinitions({
    server,
    tools: [...allTools, submitLearningTool, ...workflowTools],
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
    interactionLogger,
    learningExtractor: LEARNING_EXTRACTOR,
    findingBuffer: sessionServices?.findingBuffer,
    workflowTracker: sessionServices?.workflowTracker,
  });

  // Register all resources via shared factory (platform + learnings)
  const learningsResources = createLearningsResources({
    learningsRoot: LEARNINGS_ROOT,
    serverPlatform: TTD_PLATFORM,
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
    arguments: def.prompt.arguments as PromptArgumentForFactory[] | undefined,
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
