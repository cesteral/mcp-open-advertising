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

const CM360_PACKAGE_NAME = "cm360-mcp";
const CM360_PLATFORM = "cm360-management";

const cm360WorkflowIdByToolName: Record<string, string> = {
  // Read operations
  cm360_list_user_profiles: "mcp.execute.cm360_entity_read",
  cm360_get_entity: "mcp.execute.cm360_entity_read",
  cm360_list_entities: "mcp.execute.cm360_entity_read",
  cm360_validate_entity: "mcp.execute.cm360_entity_read",
  cm360_get_ad_preview: "mcp.execute.cm360_entity_read",
  cm360_list_targeting_options: "mcp.execute.cm360_targeting",
  // Write operations
  cm360_create_entity: "mcp.execute.cm360_entity_update",
  cm360_update_entity: "mcp.execute.cm360_entity_update",
  cm360_delete_entity: "mcp.execute.cm360_entity_update",
  // Bulk operations
  cm360_bulk_update_status: "mcp.execute.cm360_bulk",
  cm360_bulk_create_entities: "mcp.execute.cm360_bulk",
  cm360_bulk_update_entities: "mcp.execute.cm360_bulk",
  // Reporting
  cm360_get_report: "mcp.execute.cm360_reporting",
  cm360_submit_report: "mcp.execute.cm360_reporting",
  cm360_check_report_status: "mcp.execute.cm360_reporting",
  cm360_download_report: "mcp.execute.cm360_reporting",
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
      name: "cm360-mcp",
      version: packageJson.version,
      description: "Campaign Manager 360 ad serving and trafficking management via CM360 API v5. Supports CRUD operations on campaigns, placements, ads, creatives, floodlight activities, and async reporting.",
    },
    {
      capabilities: {
        logging: {},
      },
      instructions:
        "CM360 campaign management and reporting server. Use cm360_list_user_profiles to discover your profileId first. " +
        "Supports CRUD for campaigns, placements, ads, creatives, sites, advertisers, and floodlight activities via CM360 API v5. " +
        "Async reporting via cm360_get_report (blocking) or cm360_submit_report + cm360_check_report_status + cm360_download_report (non-blocking).",
    }
  );

  // Interaction logger for persisting tool execution data
  const interactionLogger = new InteractionLogger({
    serverName: CM360_PACKAGE_NAME,
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
    packageName: CM360_PACKAGE_NAME,
    platform: CM360_PLATFORM,
    workflowIdByToolName: cm360WorkflowIdByToolName,
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
    const { conformanceResources, conformanceResourceTemplate, conformancePrompts, registerStaticResourcesFromDefinitions } = await import("@cesteral/shared");
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