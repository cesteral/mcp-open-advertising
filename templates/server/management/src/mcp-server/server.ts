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
  buildServerInfo,
  extractZodShape,
  registerToolsFromDefinitions,
  createManifestEntryResolver,
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

const PACKAGE_NAME = "{{package}}";
const PLATFORM = "{{key}}";

/**
 * Interaction-log workflow id per tool. Every tool registered through the
 * factory except the generated `{{key}}_search_tools` must appear here, and
 * nothing else may (`scripts/lib/workflow-id-maps.test.mjs`).
 */
export const {{key}}WorkflowIdByToolName: Record<string, string> = {
  {{key}}_list_accounts: "mcp.execute.{{key}}_entity_read",
  {{key}}_list_entities: "mcp.execute.{{key}}_entity_read",
  {{key}}_get_entity: "mcp.execute.{{key}}_entity_read",
  {{key}}_validate_entity: "mcp.execute.{{key}}_entity_read",
  {{key}}_get_pacing_status: "mcp.execute.{{key}}_entity_read",
  {{key}}_create_entity: "mcp.execute.{{key}}_entity_update",
  {{key}}_update_entity: "mcp.execute.{{key}}_entity_update",
  {{key}}_delete_entity: "mcp.execute.{{key}}_entity_update",
  {{key}}_bulk_update_status: "mcp.execute.{{key}}_bulk_operations",
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
    buildServerInfo("{{package}}", {
      version: packageJson.version,
      description:
        "{{displayName}} campaign management: list, read, validate and pacing, with governed create, update, delete and bulk-status tools (scaffolded; the writes are not implemented yet).",
    }),
    {
      capabilities: {
        logging: {},
      },
      instructions:
        "{{displayName}} campaign management server. Use {{key}}_list_accounts to find accounts, {{key}}_list_entities to browse entities and {{key}}_get_entity to read one. " +
        "The create, update, delete and bulk-status tools are not implemented yet and return an error.",
    }
  );

  // Interaction logger for persisting tool execution data
  const interactionLogger = InteractionLogger.shared({
    serverName: PACKAGE_NAME,
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
    resolveManifestEntry: createManifestEntryResolver(
      new URL("../cesteral-manifest.json", import.meta.url)
    ),
    createRequestContext: (params) =>
      createOperationContext({
        operation: params.operation,
        additionalContext: params.additionalContext,
      }),
    defaultTextFormat: "compact",
    packageName: PACKAGE_NAME,
    platform: PLATFORM,
    workflowIdByToolName: {{key}}WorkflowIdByToolName,
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
