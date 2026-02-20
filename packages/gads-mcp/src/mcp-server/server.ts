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
  type ToolExecutionSnapshot,
  type ToolInteractionContext,
  type ToolInteractionEvaluation,
} from "@cesteral/shared";
import type { Logger } from "pino";
import packageJson from "../../package.json" with { type: "json" };

const GADS_PACKAGE_NAME = "gads-mcp";
const GADS_PLATFORM = "gads";
const LEARNINGS_ROOT = join(process.cwd(), "learnings");
const LEARNING_EXTRACTOR = new LearningExtractor({
  learningsRoot: LEARNINGS_ROOT,
  dataDir: join(process.cwd(), "data", "learnings", GADS_PACKAGE_NAME),
});

interface FindingDeps {
  findingStore: FindingStore;
}

const gadsWorkflowIdByToolName: Record<string, string> = {
  // Read tools
  gads_gaql_search: "mcp.execute.gads_entity_read",
  gads_list_accounts: "mcp.execute.gads_entity_read",
  gads_get_entity: "mcp.execute.gads_entity_read",
  gads_list_entities: "mcp.execute.gads_entity_read",
  // Write tools
  gads_create_entity: "mcp.execute.gads_entity_management",
  gads_update_entity: "mcp.execute.gads_entity_management",
  gads_remove_entity: "mcp.execute.gads_entity_management",
  gads_bulk_mutate: "mcp.execute.gads_bulk_operations",
  gads_bulk_update_status: "mcp.execute.gads_bulk_operations",
};

async function evaluateGAdsInteraction(
  snapshot: ToolExecutionSnapshot,
  interactionContext: ToolInteractionContext
): Promise<ToolInteractionEvaluation> {
  const issues: ToolInteractionEvaluation["issues"] = [];

  // Warn if update operations have large data payloads
  if (
    interactionContext.workflowId === "mcp.execute.gads_entity_management" &&
    typeof snapshot.validatedInput === "object" &&
    snapshot.validatedInput &&
    "data" in (snapshot.validatedInput as Record<string, unknown>)
  ) {
    const data = (snapshot.validatedInput as Record<string, unknown>).data;
    if (typeof data === "object" && data && Object.keys(data as Record<string, unknown>).length > 20) {
      issues.push({
        class: EvaluatorIssueClass.InputQuality,
        message: "Google Ads payload contains many fields; consider smaller staged updates",
        isRecoverable: true,
      });
    }
  }

  // Warn on bulk operations exceeding 100 items
  if (
    interactionContext.workflowId === "mcp.execute.gads_bulk_operations" &&
    typeof snapshot.validatedInput === "object" &&
    snapshot.validatedInput
  ) {
    const input = snapshot.validatedInput as Record<string, unknown>;
    const operations = input.operations as unknown[] | undefined;
    const entityIds = input.entityIds as unknown[] | undefined;
    const count = operations?.length ?? entityIds?.length ?? 0;
    if (count > 100) {
      issues.push({
        class: EvaluatorIssueClass.InputQuality,
        message: `Bulk operation with ${count} items; consider batching in smaller groups`,
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
    name: "gads-mcp",
    version: packageJson.version,
    description:
      "Google Ads campaign management and reporting via Google Ads REST API v23. " +
      "Supports GAQL queries, account listing, and full CRUD for 6 entity types " +
      "(campaign, adGroup, ad, keyword, campaignBudget, asset) with bulk operations.",
  });

  // Interaction logger for persisting tool execution data
  const interactionLogger = new InteractionLogger({
    serverName: GADS_PACKAGE_NAME,
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
    packageName: GADS_PACKAGE_NAME,
    platform: GADS_PLATFORM,
    workflowIdByToolName: gadsWorkflowIdByToolName,
    evaluator: {
      enabled: process.env.MCP_EVALUATOR_ENABLED !== "false",
      observeOnly: process.env.MCP_EVALUATOR_OBSERVE_ONLY !== "false",
      evaluate: evaluateGAdsInteraction,
    },
    interactionLogger,
    learningExtractor: LEARNING_EXTRACTOR,
    findingBuffer: sessionServices?.findingBuffer,
  });

  // Register all resources via shared factory (platform + learnings)
  const learningsResources = createLearningsResources({
    learningsRoot: LEARNINGS_ROOT,
    serverPlatform: GADS_PLATFORM,
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
