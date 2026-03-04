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

const TIKTOK_PACKAGE_NAME = "tiktok-mcp";
const TIKTOK_PLATFORM = "tiktok";

const tiktokWorkflowIdByToolName: Record<string, string> = {
  // Read operations
  tiktok_list_entities: "mcp.execute.tiktok_entity_read",
  tiktok_get_entity: "mcp.execute.tiktok_entity_read",
  tiktok_list_advertisers: "mcp.execute.tiktok_entity_read",
  // Write operations
  tiktok_create_entity: "mcp.execute.tiktok_entity_update",
  tiktok_update_entity: "mcp.execute.tiktok_entity_update",
  tiktok_delete_entity: "mcp.execute.tiktok_entity_update",
  // Reporting
  tiktok_get_report: "mcp.execute.tiktok_reporting",
  tiktok_get_report_breakdowns: "mcp.execute.tiktok_reporting",
  // Bulk operations
  tiktok_bulk_update_status: "mcp.execute.tiktok_bulk_operations",
  tiktok_bulk_create_entities: "mcp.execute.tiktok_bulk_operations",
  tiktok_bulk_update_entities: "mcp.execute.tiktok_bulk_operations",
  tiktok_adjust_bids: "mcp.execute.tiktok_bulk_operations",
  // Targeting
  tiktok_search_targeting: "mcp.execute.tiktok_entity_read",
  tiktok_get_targeting_options: "mcp.execute.tiktok_entity_read",
  // Specialized
  tiktok_duplicate_entity: "mcp.execute.tiktok_entity_update",
  tiktok_get_audience_estimate: "mcp.execute.tiktok_entity_read",
  tiktok_get_ad_previews: "mcp.execute.tiktok_entity_read",
  tiktok_validate_entity: "mcp.execute.tiktok_entity_read",
};

/**
 * Create and configure MCP server instance
 */
export async function createMcpServer(
  logger: Logger,
  sessionId?: string,
  gcsBucket?: string
): Promise<McpServer> {
  const server = new McpServer({
    name: "tiktok-mcp",
    version: packageJson.version,
    description: "TikTok Ads campaign management and reporting via TikTok Marketing API v1.3. Supports 4 entity types (campaign, adGroup, ad, creative), async reporting with breakdowns, bulk operations, targeting search, audience estimation, and ad previews.",
  });

  // Interaction logger for persisting tool execution data
  const interactionLogger = new InteractionLogger({
    serverName: TIKTOK_PACKAGE_NAME,
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
    packageName: TIKTOK_PACKAGE_NAME,
    platform: TIKTOK_PLATFORM,
    workflowIdByToolName: tiktokWorkflowIdByToolName,
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
