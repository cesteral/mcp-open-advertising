// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

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

const TTD_PACKAGE_NAME = "ttd-mcp";
const TTD_PLATFORM = "ttd";

const ttdWorkflowIdByToolName: Record<string, string> = {
  // Read operations
  ttd_get_context: "mcp.execute.ttd_entity_read",
  ttd_list_entities: "mcp.execute.ttd_entity_read",
  ttd_get_entity: "mcp.execute.ttd_entity_read",
  // Write operations
  ttd_create_entity: "mcp.execute.ttd_entity_update",
  ttd_update_entity: "mcp.execute.ttd_entity_update",
  ttd_delete_entity: "mcp.execute.ttd_entity_update",
  ttd_validate_entity: "mcp.execute.ttd_entity_update",
  // Reporting
  ttd_get_report: "mcp.execute.ttd_reporting",
  ttd_submit_report: "mcp.execute.ttd_reporting",
  ttd_check_report_status: "mcp.execute.ttd_reporting",
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
  // MyReports templates and schedules
  ttd_create_report_template: "mcp.execute.ttd_reporting",
  ttd_update_report_template: "mcp.execute.ttd_reporting",
  ttd_get_report_template: "mcp.execute.ttd_reporting",
  ttd_list_report_templates: "mcp.execute.ttd_reporting",
  ttd_create_template_schedule: "mcp.execute.ttd_reporting",
  ttd_create_report_schedule: "mcp.execute.ttd_reporting",
  ttd_update_report_schedule: "mcp.execute.ttd_reporting",
  ttd_list_report_schedules: "mcp.execute.ttd_reporting",
  ttd_get_report_schedule: "mcp.execute.ttd_reporting",
  ttd_delete_report_schedule: "mcp.execute.ttd_reporting",
  ttd_cancel_report_execution: "mcp.execute.ttd_reporting",
  ttd_rerun_report_schedule: "mcp.execute.ttd_reporting",
  ttd_get_report_executions: "mcp.execute.ttd_reporting",
  ttd_execute_entity_report: "mcp.execute.ttd_reporting",
  ttd_get_entity_report_types: "mcp.execute.ttd_reporting",
  // Preview
  ttd_get_ad_preview: "mcp.execute.ttd_entity_read",
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
      name: "ttd-mcp",
      version: packageJson.version,
      description: "The Trade Desk campaign management, reporting, and optimization via TTD API v3 + GraphQL. Supports 9 entity types (advertiser, campaign, adGroup, ad, creative, siteList, deal, conversionTracker, bidList), bulk operations, bid adjustments, GraphQL passthrough, and async report generation with download/parse.",
    },
    {
      capabilities: {
        logging: {},
      },
      instructions:
        "The Trade Desk campaign management and reporting server. Supports 9 entity types via TTD REST API v3 and GraphQL. " +
        "Use ttd_list_entities to discover entities, ttd_get_report for async reporting. " +
        "See MCP Resources for entity schemas, hierarchy docs, and report field references.",
    }
  );

  // Interaction logger for persisting tool execution data
  const interactionLogger = new InteractionLogger({
    serverName: TTD_PACKAGE_NAME,
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
    packageName: TTD_PACKAGE_NAME,
    platform: TTD_PLATFORM,
    workflowIdByToolName: ttdWorkflowIdByToolName,
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
