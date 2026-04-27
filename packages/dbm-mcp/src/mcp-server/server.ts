// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { allTools } from "./tools/index.js";
import { allResources } from "./resources/index.js";
import { promptRegistry } from "./prompts/index.js";
import { createOperationContext } from "@cesteral/shared";
import { sessionServiceStore } from "../services/session-services.js";
import { registerRunCustomQueryAsyncTool } from "./tools/definitions/run-custom-query-async.tool.js";
import {
  extractZodShape,
  registerToolsFromDefinitions,
  registerPromptsFromDefinitions,
  registerStaticResourcesFromDefinitions,
  InteractionLogger,
  type McpServerPromptLike,
  type PromptDefinitionForFactory,
} from "@cesteral/shared";
import type { Logger } from "pino";
import packageJson from "../../package.json" with { type: "json" };

const DBM_PACKAGE_NAME = "dbm-mcp";
const DBM_PLATFORM = "dv360-reporting";

const dbmWorkflowIdByToolName: Record<string, string> = {
  dbm_get_campaign_delivery: "mcp.troubleshoot.delivery",
  dbm_get_performance_metrics: "mcp.troubleshoot.delivery",
  dbm_get_historical_metrics: "mcp.troubleshoot.delivery",
  dbm_get_pacing_status: "mcp.troubleshoot.delivery",
  dbm_run_custom_query: "mcp.execute.dbm_custom_query",
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
      name: "dbm-mcp",
      version: packageJson.version,
      description:
        "DV360 reporting and metrics via Bid Manager API v2. Provides read-only access to campaign delivery, performance, pacing, and historical data.",
    },
    {
      capabilities: {
        logging: {},
      },
      instructions:
        "DV360 reporting server. Provides read-only access to campaign delivery metrics, performance data, pacing, and historical trends via Bid Manager API v2. " +
        "Start with dbm_get_campaign_delivery or dbm_get_pacing_status. Use dbm_run_custom_query for advanced Bid Manager reports. " +
        "See MCP Resources for metric/filter references and query examples.",
    }
  );

  // Interaction logger for persisting tool execution data
  const interactionLogger = new InteractionLogger({
    serverName: DBM_PACKAGE_NAME,
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
    packageName: DBM_PACKAGE_NAME,
    platform: DBM_PLATFORM,
    workflowIdByToolName: dbmWorkflowIdByToolName,
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
      arguments: def.prompt.arguments,
      generateMessage: def.generateMessage,
    })
  );
  registerPromptsFromDefinitions({
    server: server as unknown as McpServerPromptLike,
    prompts: allPrompts,
    logger,
  });

  // Register task-based tools
  registerRunCustomQueryAsyncTool(server, logger, sessionId);

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
