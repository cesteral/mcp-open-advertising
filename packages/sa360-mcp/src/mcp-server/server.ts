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

const SA360_PACKAGE_NAME = "sa360-mcp";
const SA360_PLATFORM = "sa360";

const sa360WorkflowIdByToolName: Record<string, string> = {
  // Read tools
  sa360_search: "mcp.execute.sa360_query",
  sa360_list_accounts: "mcp.execute.sa360_query",
  sa360_get_entity: "mcp.execute.sa360_query",
  sa360_list_entities: "mcp.execute.sa360_query",
  sa360_get_insights: "mcp.execute.sa360_query",
  sa360_get_insights_breakdowns: "mcp.execute.sa360_query",
  sa360_list_custom_columns: "mcp.execute.sa360_query",
  sa360_search_fields: "mcp.execute.sa360_query",
  // Write tools (v2 API)
  sa360_insert_conversions: "mcp.execute.sa360_conversions",
  sa360_update_conversions: "mcp.execute.sa360_conversions",
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
      name: "sa360-mcp",
      version: packageJson.version,
      description:
        "Search Ads 360 reporting and conversion upload server. " +
        "Provides cross-engine unified reporting via SA360 Reporting API v0 and " +
        "offline conversion upload via legacy v2 API. " +
        "Supports 8 entity types (customer, campaign, adGroup, adGroupAd, " +
        "adGroupCriterion, campaignCriterion, biddingStrategy, conversionAction).",
    },
    {
      capabilities: {
        logging: {},
      },
      instructions:
        "Search Ads 360 reporting and conversion upload server. " +
        "Use sa360_list_accounts to discover accounts, sa360_search for flexible queries. " +
        "SA360 provides cross-engine reporting across Google Ads, Microsoft Ads, Yahoo Japan, and Baidu. " +
        "Entity data is read-only; only conversion upload is supported for writes.",
    }
  );

  // Interaction logger for persisting tool execution data
  const interactionLogger = new InteractionLogger({
    serverName: SA360_PACKAGE_NAME,
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
    packageName: SA360_PACKAGE_NAME,
    platform: SA360_PLATFORM,
    workflowIdByToolName: sa360WorkflowIdByToolName,
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
