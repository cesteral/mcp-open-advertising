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

const AMAZON_DSP_PACKAGE_NAME = "amazon-dsp-mcp";
const AMAZON_DSP_PLATFORM = "amazon_dsp";

const amazonDspWorkflowIdByToolName: Record<string, string> = {
  // Read operations
  amazon_dsp_list_entities: "mcp.execute.amazon_dsp_entity_read",
  amazon_dsp_get_entity: "mcp.execute.amazon_dsp_entity_read",
  amazon_dsp_list_profiles: "mcp.execute.amazon_dsp_entity_read",
  // Write operations
  amazon_dsp_create_entity: "mcp.execute.amazon_dsp_entity_update",
  amazon_dsp_update_entity: "mcp.execute.amazon_dsp_entity_update",
  amazon_dsp_delete_entity: "mcp.execute.amazon_dsp_entity_update",
  // Reporting
  amazon_dsp_get_report: "mcp.execute.amazon_dsp_reporting",
  amazon_dsp_get_report_breakdowns: "mcp.execute.amazon_dsp_reporting",
  // Bulk operations
  amazon_dsp_bulk_update_status: "mcp.execute.amazon_dsp_bulk_operations",
  amazon_dsp_bulk_create_entities: "mcp.execute.amazon_dsp_bulk_operations",
  amazon_dsp_bulk_update_entities: "mcp.execute.amazon_dsp_bulk_operations",
  amazon_dsp_adjust_bids: "mcp.execute.amazon_dsp_bulk_operations",
  // Targeting
  amazon_dsp_search_targeting: "mcp.execute.amazon_dsp_entity_read",
  amazon_dsp_get_targeting_options: "mcp.execute.amazon_dsp_entity_read",
  // Specialized
  amazon_dsp_get_audience_estimate: "mcp.execute.amazon_dsp_entity_read",
  amazon_dsp_get_ad_preview: "mcp.execute.amazon_dsp_entity_read",
  amazon_dsp_validate_entity: "mcp.execute.amazon_dsp_entity_read",
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
      name: "amazon-dsp-mcp",
      version: packageJson.version,
      description: "Amazon DSP campaign management and reporting via the Amazon Advertising API. Supports campaign, ad group, creative, audience, profile-scoped auth, async reporting, targeting, and preview workflows.",
    },
    {
      capabilities: {
        logging: {},
      },
      instructions:
        "Amazon DSP campaign management and reporting server. Supports campaign, ad group, creative, audience, async reporting, targeting, and bulk operations via the Amazon Advertising API. " +
        "Use amazon_dsp_list_profiles to discover accounts, amazon_dsp_list_entities to browse entities. " +
        "See MCP Resources for entity schemas and MCP Prompts for workflow guidance.",
    }
  );

  // Interaction logger for persisting tool execution data
  const interactionLogger = new InteractionLogger({
    serverName: AMAZON_DSP_PACKAGE_NAME,
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
    packageName: AMAZON_DSP_PACKAGE_NAME,
    platform: AMAZON_DSP_PLATFORM,
    workflowIdByToolName: amazonDspWorkflowIdByToolName,
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