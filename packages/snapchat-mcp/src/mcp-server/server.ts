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

const SNAPCHAT_PACKAGE_NAME = "snapchat-mcp";
const SNAPCHAT_PLATFORM = "snapchat";

const snapchatWorkflowIdByToolName: Record<string, string> = {
  // Read operations
  snapchat_list_entities: "mcp.execute.snapchat_entity_read",
  snapchat_get_entity: "mcp.execute.snapchat_entity_read",
  snapchat_list_ad_accounts: "mcp.execute.snapchat_entity_read",
  // Write operations
  snapchat_create_entity: "mcp.execute.snapchat_entity_update",
  snapchat_update_entity: "mcp.execute.snapchat_entity_update",
  snapchat_delete_entity: "mcp.execute.snapchat_entity_update",
  // Reporting
  snapchat_get_report: "mcp.execute.snapchat_reporting",
  snapchat_get_report_breakdowns: "mcp.execute.snapchat_reporting",
  // Bulk operations
  snapchat_bulk_update_status: "mcp.execute.snapchat_bulk_operations",
  snapchat_bulk_create_entities: "mcp.execute.snapchat_bulk_operations",
  snapchat_bulk_update_entities: "mcp.execute.snapchat_bulk_operations",
  snapchat_adjust_bids: "mcp.execute.snapchat_bulk_operations",
  // Targeting
  snapchat_search_targeting: "mcp.execute.snapchat_entity_read",
  snapchat_get_targeting_options: "mcp.execute.snapchat_entity_read",
  // Specialized
  snapchat_duplicate_entity: "mcp.execute.snapchat_entity_update",
  snapchat_get_audience_estimate: "mcp.execute.snapchat_entity_read",
  snapchat_get_ad_preview: "mcp.execute.snapchat_entity_read",
  snapchat_validate_entity: "mcp.execute.snapchat_entity_read",
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
      name: "snapchat-mcp",
      version: packageJson.version,
      description: "Snapchat Ads campaign management and reporting via the Snap Marketing API. Supports campaign, ad squad, ad, creative, and audience workflows with reporting, targeting, bid adjustments, and previews.",
    },
    {
      capabilities: {
        logging: {},
      },
      instructions:
        "Snapchat Ads campaign management and reporting server. Supports campaign, ad squad, ad, creative, and audience workflows with async reporting, targeting, bid adjustments, and bulk operations via the Snap Marketing API. " +
        "Use snapchat_list_ad_accounts to discover accounts, snapchat_list_entities to browse entities. " +
        "See MCP Resources for entity schemas and MCP Prompts for workflow guidance.",
    }
  );

  // Interaction logger for persisting tool execution data
  const interactionLogger = new InteractionLogger({
    serverName: SNAPCHAT_PACKAGE_NAME,
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
    packageName: SNAPCHAT_PACKAGE_NAME,
    platform: SNAPCHAT_PLATFORM,
    workflowIdByToolName: snapchatWorkflowIdByToolName,
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