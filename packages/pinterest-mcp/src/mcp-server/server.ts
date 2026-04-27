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
  type McpServerPromptLike,
  type PromptDefinitionForFactory,
  type PromptArgumentForFactory,
} from "@cesteral/shared";
import type { Logger } from "pino";
import packageJson from "../../package.json" with { type: "json" };

const PINTEREST_PACKAGE_NAME = "pinterest-mcp";
const PINTEREST_PLATFORM = "pinterest";

const pinterestWorkflowIdByToolName: Record<string, string> = {
  // Read operations
  pinterest_list_entities: "mcp.execute.pinterest_entity_read",
  pinterest_get_entity: "mcp.execute.pinterest_entity_read",
  pinterest_list_ad_accounts: "mcp.execute.pinterest_entity_read",
  // Write operations
  pinterest_create_entity: "mcp.execute.pinterest_entity_update",
  pinterest_update_entity: "mcp.execute.pinterest_entity_update",
  pinterest_delete_entity: "mcp.execute.pinterest_entity_update",
  // Reporting
  pinterest_get_report: "mcp.execute.pinterest_reporting",
  pinterest_get_report_breakdowns: "mcp.execute.pinterest_reporting",
  // Bulk operations
  pinterest_bulk_update_status: "mcp.execute.pinterest_bulk_operations",
  pinterest_bulk_create_entities: "mcp.execute.pinterest_bulk_operations",
  pinterest_bulk_update_entities: "mcp.execute.pinterest_bulk_operations",
  // Targeting
  pinterest_search_targeting: "mcp.execute.pinterest_entity_read",
  pinterest_get_targeting_options: "mcp.execute.pinterest_entity_read",
  // Specialized
  pinterest_duplicate_entity: "mcp.execute.pinterest_entity_update",
  pinterest_get_delivery_estimate: "mcp.execute.pinterest_entity_read",
  pinterest_get_ad_preview: "mcp.execute.pinterest_entity_read",
  pinterest_validate_entity: "mcp.execute.pinterest_entity_read",
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
      name: "pinterest-mcp",
      version: packageJson.version,
      description:
        "Pinterest Ads campaign management and reporting via Pinterest Marketing API v5. Supports campaign, ad group, ad, creative, and audience workflows with reporting, targeting, delivery estimates, and previews.",
    },
    {
      capabilities: {
        logging: {},
      },
      instructions:
        "Pinterest Ads campaign management and reporting server. Supports campaign, ad group, ad, creative, and audience workflows with async reporting, targeting, delivery estimates, and bulk operations via Pinterest Marketing API v5. " +
        "Use pinterest_list_ad_accounts to discover accounts, pinterest_list_entities to browse entities. " +
        "See MCP Resources for entity schemas and MCP Prompts for workflow guidance.",
    }
  );

  // Interaction logger for persisting tool execution data
  const interactionLogger = new InteractionLogger({
    serverName: PINTEREST_PACKAGE_NAME,
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
    packageName: PINTEREST_PACKAGE_NAME,
    platform: PINTEREST_PLATFORM,
    workflowIdByToolName: pinterestWorkflowIdByToolName,
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
  // by `pinterest_download_report` (storeRawCsv: true).
  registerReportCsvResource({
    server,
    ResourceTemplate,
    store: reportCsvStore,
    platform: "Pinterest",
    downloadToolName: "pinterest_download_report",
    logger,
  });

  // Register conformance fixtures (resources + prompts) when enabled
  if (process.env.MCP_CONFORMANCE_FIXTURES === "true") {
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
