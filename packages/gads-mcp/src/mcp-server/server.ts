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

const GADS_PACKAGE_NAME = "gads-mcp";
const GADS_PLATFORM = "gads";

const gadsWorkflowIdByToolName: Record<string, string> = {
  // Read tools
  gads_gaql_search: "mcp.execute.gads_entity_read",
  gads_list_accounts: "mcp.execute.gads_entity_read",
  gads_get_entity: "mcp.execute.gads_entity_read",
  gads_list_entities: "mcp.execute.gads_entity_read",
  gads_validate_entity: "mcp.execute.gads_entity_read",
  // Write tools
  gads_create_entity: "mcp.execute.gads_entity_management",
  gads_update_entity: "mcp.execute.gads_entity_management",
  gads_remove_entity: "mcp.execute.gads_entity_management",
  gads_adjust_bids: "mcp.execute.gads_entity_management",
  gads_bulk_mutate: "mcp.execute.gads_bulk_operations",
  gads_bulk_update_status: "mcp.execute.gads_bulk_operations",
  // Preview
  gads_get_ad_preview: "mcp.execute.gads_entity_read",
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
      name: "gads-mcp",
      version: packageJson.version,
      description:
        "Google Ads campaign management and reporting via Google Ads REST API v23. " +
        "Supports GAQL queries, account listing, and full CRUD for 6 entity types " +
        "(campaign, adGroup, ad, keyword, campaignBudget, asset) with bulk operations.",
    },
    {
      capabilities: {
        logging: {},
      },
      instructions:
        "Google Ads campaign management and reporting server. Supports GAQL queries and full CRUD for 6 entity types via Google Ads REST API v23. " +
        "Use gads_list_accounts to discover accounts, gads_gaql_search for flexible queries. " +
        "See MCP Resources for GAQL syntax reference and entity schema details.",
    }
  );

  // Interaction logger for persisting tool execution data
  const interactionLogger = new InteractionLogger({
    serverName: GADS_PACKAGE_NAME,
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
    packageName: GADS_PACKAGE_NAME,
    platform: GADS_PLATFORM,
    workflowIdByToolName: gadsWorkflowIdByToolName,
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
 * Connect server to stdio transport (for local MCP client testing)
 */
export async function runStdioServer(server: McpServer, logger: Logger): Promise<void> {
  logger.info("Starting MCP server with stdio transport");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP server connected via stdio");
}
