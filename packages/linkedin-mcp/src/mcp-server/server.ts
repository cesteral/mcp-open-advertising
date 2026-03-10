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

const LINKEDIN_PACKAGE_NAME = "linkedin-mcp";
const LINKEDIN_PLATFORM = "linkedin";

const linkedInWorkflowIdByToolName: Record<string, string> = {
  // Read operations
  linkedin_list_entities: "mcp.execute.linkedin_entity_read",
  linkedin_get_entity: "mcp.execute.linkedin_entity_read",
  linkedin_list_ad_accounts: "mcp.execute.linkedin_entity_read",
  // Write operations
  linkedin_create_entity: "mcp.execute.linkedin_entity_update",
  linkedin_update_entity: "mcp.execute.linkedin_entity_update",
  linkedin_delete_entity: "mcp.execute.linkedin_entity_update",
  // Analytics
  linkedin_get_analytics: "mcp.execute.linkedin_analytics",
  linkedin_get_analytics_breakdowns: "mcp.execute.linkedin_analytics",
  // Bulk operations
  linkedin_bulk_update_status: "mcp.execute.linkedin_bulk_operations",
  linkedin_bulk_create_entities: "mcp.execute.linkedin_bulk_operations",
  linkedin_bulk_update_entities: "mcp.execute.linkedin_bulk_operations",
  linkedin_adjust_bids: "mcp.execute.linkedin_bulk_operations",
  // Targeting
  linkedin_search_targeting: "mcp.execute.linkedin_entity_read",
  linkedin_get_targeting_options: "mcp.execute.linkedin_entity_read",
  // Specialized
  linkedin_duplicate_entity: "mcp.execute.linkedin_entity_update",
  linkedin_get_delivery_forecast: "mcp.execute.linkedin_entity_read",
  linkedin_get_ad_preview: "mcp.execute.linkedin_entity_read",
  linkedin_validate_entity: "mcp.execute.linkedin_entity_read",
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
      name: "linkedin-mcp",
      version: packageJson.version,
      description:
        "LinkedIn Ads campaign management, analytics, and optimization via LinkedIn Marketing API v2. Supports 5 entity types (adAccount, campaignGroup, campaign, creative, conversionRule), analytics with pivot breakdowns, bulk operations, targeting search, delivery forecasts, and ad previews.",
    },
    {
      capabilities: {
        logging: {},
      },
      instructions:
        "LinkedIn Ads campaign management server. Supports 5 entity types (adAccount, campaignGroup, campaign, creative, conversionRule), analytics, targeting, and bulk operations via LinkedIn Marketing API v2. " +
        "Use linkedin_list_ad_accounts to discover accounts, linkedin_list_entities to browse entities. " +
        "See MCP Resources for entity schemas and MCP Prompts for workflow guidance.",
    }
  );

  // Interaction logger for persisting tool execution data
  const interactionLogger = new InteractionLogger({
    serverName: LINKEDIN_PACKAGE_NAME,
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
    packageName: LINKEDIN_PACKAGE_NAME,
    platform: LINKEDIN_PLATFORM,
    workflowIdByToolName: linkedInWorkflowIdByToolName,
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

  // Register conformance fixtures (resources + prompts) when enabled
  if (process.env.MCP_CONFORMANCE_FIXTURES === "true") {
    const { conformanceResources, conformanceResourceTemplate, conformancePrompts } = await import("@cesteral/shared");
    const { ResourceTemplate: McpResourceTemplate } = await import("@modelcontextprotocol/sdk/server/mcp.js");

    registerStaticResourcesFromDefinitions({
      server,
      resources: conformanceResources,
      logger,
    });

    const template = new McpResourceTemplate(conformanceResourceTemplate.uriTemplate, { list: undefined });
    server.registerResource(
      "conformance_template",
      template,
      {
        description: conformanceResourceTemplate.description,
        mimeType: conformanceResourceTemplate.mimeType,
      },
      async (uri, variables) => {
        const id = (variables.id as string) || "unknown";
        const content = conformanceResourceTemplate.getContent(id);
        return {
          contents: [{
            uri: uri.href,
            mimeType: conformanceResourceTemplate.mimeType,
            text: content,
          }],
        };
      }
    );

    registerPromptsFromDefinitions({
      server: server as unknown as McpServerPromptLike,
      prompts: conformancePrompts,
      logger,
    });
  }

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
