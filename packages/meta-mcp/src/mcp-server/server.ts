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
  type StorageBackend,
} from "@cesteral/shared";
import type { Logger } from "pino";
import packageJson from "../../package.json" with { type: "json" };

const META_PACKAGE_NAME = "meta-mcp";
const META_PLATFORM = "meta";
const LEARNINGS_ROOT = join(process.cwd(), "learnings");

interface FindingDeps {
  findingStore: FindingStore;
  storageBackend?: StorageBackend;
}

const metaWorkflowIdByToolName: Record<string, string> = {
  // Read operations
  meta_list_entities: "mcp.execute.meta_entity_read",
  meta_get_entity: "mcp.execute.meta_entity_read",
  meta_list_ad_accounts: "mcp.execute.meta_entity_read",
  // Write operations
  meta_create_entity: "mcp.execute.meta_entity_update",
  meta_update_entity: "mcp.execute.meta_entity_update",
  meta_delete_entity: "mcp.execute.meta_entity_update",
  // Insights
  meta_get_insights: "mcp.execute.meta_insights",
  meta_get_insights_breakdowns: "mcp.execute.meta_insights",
  // Bulk operations
  meta_bulk_update_status: "mcp.execute.meta_bulk_operations",
  meta_bulk_create_entities: "mcp.execute.meta_bulk_operations",
  // Targeting
  meta_search_targeting: "mcp.execute.meta_entity_read",
  meta_get_targeting_options: "mcp.execute.meta_entity_read",
  // Specialized
  meta_duplicate_entity: "mcp.execute.meta_entity_update",
  meta_get_delivery_estimate: "mcp.execute.meta_entity_read",
  meta_get_ad_previews: "mcp.execute.meta_entity_read",
};

async function evaluateMetaInteraction(
  snapshot: ToolExecutionSnapshot,
  interactionContext: ToolInteractionContext
): Promise<ToolInteractionEvaluation> {
  const issues: ToolInteractionEvaluation["issues"] = [];
  if (
    interactionContext.workflowId === "mcp.execute.meta_entity_update" &&
    typeof snapshot.validatedInput === "object" &&
    snapshot.validatedInput &&
    "data" in (snapshot.validatedInput as Record<string, unknown>)
  ) {
    const data = (snapshot.validatedInput as Record<string, unknown>).data;
    if (typeof data === "object" && data && Object.keys(data as Record<string, unknown>).length > 25) {
      issues.push({
        class: EvaluatorIssueClass.InputQuality,
        message: "Meta payload contains many fields; consider smaller staged updates",
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
    name: "meta-mcp",
    version: packageJson.version,
    description: "Meta Ads campaign management, reporting, and optimization via Meta Marketing API v21.0. Supports 5 entity types (campaign, adSet, ad, adCreative, customAudience), insights with breakdowns, bulk operations, targeting search, entity duplication, delivery estimates, and ad previews.",
  });

  // Interaction logger for persisting tool execution data
  const storageBackend = findingDeps?.storageBackend;
  const interactionLogger = new InteractionLogger({
    serverName: META_PACKAGE_NAME,
    logger,
    storageBackend,
  });

  // Learning extractor
  const learningExtractor = new LearningExtractor({
    learningsRoot: LEARNINGS_ROOT,
    dataDir: join(process.cwd(), "data", "learnings", META_PACKAGE_NAME),
    storageBackend,
  });

  // Register all tools via shared factory
  const submitLearningTool = createSubmitLearningTool(LEARNINGS_ROOT);
  const sessionServices = sessionId ? sessionServiceStore.get(sessionId) : undefined;
  const workflowEvaluator = createDefaultWorkflowEvaluator();
  const workflowTools = createWorkflowLifecycleTools({
    getTracker: () => sessionServices?.workflowTracker,
    getEvaluator: () => workflowEvaluator,
    getFindingBuffer: () => sessionServices?.findingBuffer,
    platform: META_PLATFORM,
    packageName: META_PACKAGE_NAME,
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
    packageName: META_PACKAGE_NAME,
    platform: META_PLATFORM,
    workflowIdByToolName: metaWorkflowIdByToolName,
    evaluator: {
      enabled: process.env.MCP_EVALUATOR_ENABLED !== "false",
      observeOnly: process.env.MCP_EVALUATOR_OBSERVE_ONLY !== "false",
      evaluate: evaluateMetaInteraction,
    },
    interactionLogger,
    learningExtractor,
    findingBuffer: sessionServices?.findingBuffer,
    workflowTracker: sessionServices?.workflowTracker,
    authContextResolver: sessionId
      ? () => sessionServiceStore.getAuthContext(sessionId)
      : undefined,
  });

  // Register all resources via shared factory
  const learningsResources = createLearningsResources({
    learningsRoot: LEARNINGS_ROOT,
    serverPlatform: META_PLATFORM,
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
 * Connect server to stdio transport
 */
export async function runStdioServer(server: McpServer, logger: Logger): Promise<void> {
  logger.info("Starting MCP server with stdio transport");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP server connected via stdio");
}
