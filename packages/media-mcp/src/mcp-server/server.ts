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

const MEDIA_PACKAGE_NAME = "media-mcp";
const MEDIA_PLATFORM = "media";

const mediaWorkflowIdByToolName: Record<string, string> = {
  media_upload_asset: "mcp.execute.media_write",
  media_list_assets: "mcp.execute.media_read",
  media_get_asset: "mcp.execute.media_read",
  media_delete_asset: "mcp.execute.media_write",
  media_tag_asset: "mcp.execute.media_write",
  media_get_upload_url: "mcp.execute.media_write",
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
      name: "media-mcp",
      version: packageJson.version,
      description: "Cesteral media library for upload-once-use-everywhere asset management via Supabase Storage. 6 tools: upload_asset, list_assets, get_asset, delete_asset, tag_asset, get_upload_url.",
    },
    {
      capabilities: { logging: {} },
      instructions:
        "Cesteral media library server. Upload media assets once and reuse across Meta, TikTok, LinkedIn, and other ad platforms. " +
        "Use media_upload_asset to upload a file from a URL, media_list_assets to browse, media_get_upload_url for direct large file upload.",
    }
  );

  // Interaction logger for persisting tool execution data
  const interactionLogger = new InteractionLogger({
    serverName: MEDIA_PACKAGE_NAME,
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
    packageName: MEDIA_PACKAGE_NAME,
    platform: MEDIA_PLATFORM,
    workflowIdByToolName: mediaWorkflowIdByToolName,
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
        const id = (variables["id"] as string) || "unknown";
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
