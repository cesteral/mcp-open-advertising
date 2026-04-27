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

const MSADS_PACKAGE_NAME = "msads-mcp";
const MSADS_PLATFORM = "msads";

const msadsWorkflowIdByToolName: Record<string, string> = {
  // Read operations
  msads_list_entities: "mcp.execute.msads_entity_read",
  msads_get_entity: "mcp.execute.msads_entity_read",
  msads_list_accounts: "mcp.execute.msads_entity_read",
  // Write operations
  msads_create_entity: "mcp.execute.msads_entity_update",
  msads_update_entity: "mcp.execute.msads_entity_update",
  msads_delete_entity: "mcp.execute.msads_entity_update",
  // Reporting
  msads_get_report: "mcp.execute.msads_reporting",
  msads_submit_report: "mcp.execute.msads_reporting",
  msads_check_report_status: "mcp.execute.msads_reporting",
  msads_download_report: "mcp.execute.msads_reporting",
  // Bulk operations
  msads_bulk_create_entities: "mcp.execute.msads_bulk_operations",
  msads_bulk_update_entities: "mcp.execute.msads_bulk_operations",
  msads_bulk_update_status: "mcp.execute.msads_bulk_operations",
  msads_adjust_bids: "mcp.execute.msads_bulk_operations",
  // Targeting
  msads_manage_ad_extensions: "mcp.execute.msads_entity_update",
  msads_manage_criterions: "mcp.execute.msads_entity_update",
  // Specialized
  msads_get_ad_details: "mcp.execute.msads_entity_read",
  msads_validate_entity: "mcp.execute.msads_entity_read",
  msads_import_from_google: "mcp.execute.msads_entity_update",
};

export async function createMcpServer(
  logger: Logger,
  sessionId?: string,
  gcsBucket?: string
): Promise<McpServer> {
  const server = new McpServer(
    {
      name: "msads-mcp",
      version: packageJson.version,
      description:
        "Microsoft Advertising (Bing Ads) campaign management and reporting via Microsoft Advertising API v13 JSON endpoints. Supports campaigns, ad groups, ads, keywords, budgets, ad extensions, audiences, labels, and Google Ads import.",
    },
    {
      capabilities: {
        logging: {},
      },
      instructions:
        "Microsoft Advertising campaign management and reporting server. Supports Search, Shopping, Audience, and Performance Max campaigns with async reporting, targeting criterions, bid adjustments, ad extensions, and Google Ads import via Microsoft Advertising API v13 JSON endpoints. " +
        "Use msads_list_accounts to discover accounts, msads_list_entities to browse entities. " +
        "See MCP Resources for entity schemas and MCP Prompts for workflow guidance.",
    }
  );

  const interactionLogger = new InteractionLogger({
    serverName: MSADS_PACKAGE_NAME,
    logger,
    gcsBucket,
  });

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
    packageName: MSADS_PACKAGE_NAME,
    platform: MSADS_PLATFORM,
    workflowIdByToolName: msadsWorkflowIdByToolName,
    interactionLogger,
    authContextResolver: sessionId
      ? () => sessionServiceStore.getAuthContext(sessionId)
      : undefined,
  });

  registerStaticResourcesFromDefinitions({
    server,
    resources: allResources,
    logger,
  });

  // Register `report-csv://{id}` template for raw CSV bodies stored on demand
  // by `msads_download_report` (storeRawCsv: true).
  registerReportCsvResource({
    server,
    ResourceTemplate,
    store: reportCsvStore,
    platform: "Microsoft Ads",
    downloadToolName: "msads_download_report",
    logger,
  });

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

export async function runStdioServer(server: McpServer, logger: Logger): Promise<void> {
  logger.info("Starting MCP server with stdio transport");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP server connected via stdio");
}
