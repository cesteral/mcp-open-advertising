import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { allTools } from "./tools/index.js";
import { allResources } from "./resources/index.js";
import { promptRegistry } from "./prompts/index.js";
import { createOperationContext } from "@cesteral/shared";
import { sessionServiceStore } from "../services/session-services.js";
import {
  extractZodShape,
  registerToolsFromDefinitions,
  registerPromptsFromDefinitions,
  registerStaticResourcesFromDefinitions,
  InteractionLogger,
  type McpServerPromptLike,
  type PromptDefinitionForFactory,
  type PromptArgumentForFactory,
} from "@cesteral/shared";
import type { Logger } from "pino";
import packageJson from "../../package.json" with { type: "json" };

const META_PACKAGE_NAME = "meta-mcp";
const META_PLATFORM = "meta";

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
  meta_validate_entity: "mcp.execute.meta_entity_read",
  meta_adjust_bids: "mcp.execute.meta_bulk_operations",
};

/**
 * Create and configure MCP server instance
 */
export async function createMcpServer(
  logger: Logger,
  sessionId?: string,
  gcsBucket?: string
): Promise<McpServer> {
  const server = new McpServer(
    {
      name: "meta-mcp",
      version: packageJson.version,
      description: "Meta Ads campaign management, reporting, and optimization via Meta Marketing API v21.0. Supports 5 entity types (campaign, adSet, ad, adCreative, customAudience), insights with breakdowns, bulk operations, targeting search, entity duplication, delivery estimates, and ad previews.",
    },
    {
      capabilities: {
        logging: {},
      },
    }
  );

  // Interaction logger for persisting tool execution data
  const interactionLogger = new InteractionLogger({
    serverName: META_PACKAGE_NAME,
    logger,
    gcsBucket,
  });

  // Register all tools via shared factory
  registerToolsFromDefinitions({
    server,
    tools: allTools,
    logger,
    sessionId,
    transformSchema: (schema) => extractZodShape(schema),
    createRequestContext: (params) =>
      createOperationContext({
        operation: params.operation,
        additionalContext: params.additionalContext,
      }),
    defaultTextFormat: "compact",
    packageName: META_PACKAGE_NAME,
    platform: META_PLATFORM,
    workflowIdByToolName: metaWorkflowIdByToolName,
    interactionLogger,
    authContextResolver: sessionId
      ? () => sessionServiceStore.getAuthContext(sessionId)
      : undefined,
  });

  // Register all resources via shared factory
  registerStaticResourcesFromDefinitions({
    server,
    resources: allResources,
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
