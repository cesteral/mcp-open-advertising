// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { allTools } from "./tools/index.js";
import { allResources } from "./resources/index.js";
import { promptRegistry } from "./prompts/index.js";
import { createOperationContext } from "@cesteral/shared";
import { reportCsvStore, sessionServiceStore } from "../services/session-services.js";
import {
  extractZodShape,
  registerReportCsvResource,
  registerToolsFromDefinitions,
  registerPromptsFromDefinitions,
  registerStaticResourcesFromDefinitions,
  InteractionLogger,
  isConformanceFixturesEnabled,
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
  tiktok_get_ad_preview: "mcp.execute.tiktok_entity_read",
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
  const server = new McpServer(
    {
      name: "tiktok-mcp",
      version: packageJson.version,
      description:
        "TikTok Ads campaign management and reporting via TikTok Marketing API v1.3. Supports 4 entity types (campaign, adGroup, ad, creative), async reporting with breakdowns, bulk operations, targeting search, audience estimation, and ad previews.",
    },
    {
      capabilities: {
        logging: {},
      },
      instructions:
        "TikTok Ads campaign management and reporting server. Supports 4 entity types (campaign, adGroup, ad, creative), async reporting, targeting, and bulk operations via TikTok Marketing API v1.3. " +
        "Use tiktok_list_advertisers to discover accounts, tiktok_list_entities to browse entities. " +
        "See MCP Resources for entity schemas and MCP Prompts for workflow guidance.",
    }
  );

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

  // Register `report-csv://{id}` template for raw CSV bodies stored on demand
  // by `tiktok_download_report` (storeRawCsv: true).
  registerReportCsvResource({
    server,
    ResourceTemplate,
    store: reportCsvStore,
    platform: "TikTok",
    downloadToolName: "tiktok_download_report",
    logger,
  });

  // Register conformance fixtures (resources + prompts) when enabled
  if (isConformanceFixturesEnabled()) {
    const { conformanceResources, conformanceResourceTemplate, conformancePrompts } = await import(
      "@cesteral/shared"
    );
    const { ResourceTemplate: McpResourceTemplate } = await import(
      "@modelcontextprotocol/sdk/server/mcp.js"
    );

    registerStaticResourcesFromDefinitions({
      server,
      resources: conformanceResources,
      logger,
    });

    const template = new McpResourceTemplate(conformanceResourceTemplate.uriTemplate, {
      list: undefined,
    });
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
          contents: [
            {
              uri: uri.href,
              mimeType: conformanceResourceTemplate.mimeType,
              text: content,
            },
          ],
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
  const allPrompts: PromptDefinitionForFactory[] = Array.from(promptRegistry.values()).map(
    (def) => ({
      name: def.prompt.name,
      description: def.prompt.description ?? "",
      arguments: def.prompt.arguments as PromptArgumentForFactory[] | undefined,
      generateMessage: def.generateMessage,
    })
  );
  registerPromptsFromDefinitions({
    server: server as unknown as McpServerPromptLike,
    prompts: allPrompts,
    logger,
  });

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
