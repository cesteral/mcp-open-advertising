import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { allTools } from "./tools/index.js";
import { resourceRegistry } from "./resources/index.js";
import { promptRegistry } from "./prompts/index.js";
import { createRequestContext } from "../utils/internal/request-context.js";
import { ErrorHandler } from "../utils/errors/index.js";
import {
  EvaluatorIssueClass,
  extractZodShape,
  registerToolsFromDefinitions,
  registerPromptsFromDefinitions,
  type McpServerPromptLike,
  type PromptDefinitionForFactory,
  type PromptArgumentForFactory,
  type ToolExecutionSnapshot,
  type ToolInteractionContext,
  type ToolInteractionEvaluation,
} from "@cesteral/shared";
import type { Logger } from "pino";
import packageJson from "../../package.json";

const DV360_PACKAGE_NAME = "dv360-mcp";
const DV360_PLATFORM = "dv360-management";

const dv360WorkflowIdByToolName: Record<string, string> = {
  dv360_update_entity: "mcp.execute.dv360_entity_update",
  dv360_create_entity: "mcp.execute.dv360_entity_update",
  dv360_get_entity: "mcp.execute.dv360_entity_update",
  dv360_delete_entity: "mcp.execute.dv360_entity_update",
  dv360_list_entities: "mcp.execute.dv360_entity_update",
  dv360_adjust_line_item_bids: "mcp.troubleshoot.delivery",
  dv360_bulk_update_status: "mcp.troubleshoot.delivery",
  dv360_create_custom_bidding_algorithm: "mcp.execute.dv360_entity_update",
  dv360_manage_custom_bidding_script: "mcp.execute.dv360_entity_update",
  dv360_manage_custom_bidding_rules: "mcp.execute.dv360_entity_update",
  dv360_list_custom_bidding_algorithms: "mcp.execute.dv360_entity_update",
};

async function evaluateDv360Interaction(
  snapshot: ToolExecutionSnapshot,
  interactionContext: ToolInteractionContext
): Promise<ToolInteractionEvaluation> {
  const issues: ToolInteractionEvaluation["issues"] = [];
  if (
    interactionContext.workflowId === "mcp.execute.dv360_entity_update" &&
    typeof snapshot.validatedInput === "object" &&
    snapshot.validatedInput &&
    "updateMask" in (snapshot.validatedInput as Record<string, unknown>)
  ) {
    const updateMask = String((snapshot.validatedInput as Record<string, unknown>).updateMask);
    if (!updateMask || updateMask.split(",").length > 8) {
      issues.push({
        class: EvaluatorIssueClass.InputQuality,
        message: "Update mask may be too broad; prefer narrower field updates",
        isRecoverable: true,
      });
    }
  }

  if (snapshot.durationMs > 20_000) {
    issues.push({
      class: EvaluatorIssueClass.Efficiency,
      message: "Tool latency exceeded 20s threshold",
      isRecoverable: true,
    });
  }

  return {
    issues,
    recommendationAction: issues.length > 0 ? "propose_playbook_delta" : "none",
  };
}

/**
 * Create and configure MCP server instance
 */
export async function createMcpServer(logger: Logger, sessionId?: string): Promise<McpServer> {
  // Register all resources
  resourceRegistry.registerAll();
  logger.info({ resourceCount: resourceRegistry.getResourceCount() }, "Registered MCP resources");

  const server = new McpServer({
    name: "dv360-mcp",
    version: packageJson.version,
    description: "DV360 campaign entity management via Display & Video 360 API. Supports CRUD operations on campaigns, insertion orders, line items, and targeting.",
  });

  // Register all tools via shared factory
  registerToolsFromDefinitions({
    server,
    tools: allTools,
    logger,
    sessionId,
    transformSchema: (schema) => extractZodShape(schema),
    createRequestContext: (params) =>
      createRequestContext({
        operation: params.operation,
        additionalContext: params.additionalContext,
      }),
    defaultTextFormat: "compact",
    packageName: DV360_PACKAGE_NAME,
    platform: DV360_PLATFORM,
    workflowIdByToolName: dv360WorkflowIdByToolName,
    evaluator: {
      enabled: process.env.MCP_EVALUATOR_ENABLED !== "false",
      observeOnly: process.env.MCP_EVALUATOR_OBSERVE_ONLY !== "false",
      evaluate: evaluateDv360Interaction,
    },
  });

  // Register all resources (DV360 uses parameterized resource registry)
  const resources = resourceRegistry.getAllResources();
  for (const resource of resources) {
    const isParameterized = resource.uriTemplate.includes("{");
    const resourceId = resource.uriTemplate.replace(/[^a-zA-Z0-9]/g, "_");

    const metadata = {
      title: resource.name,
      description: resource.description,
      mimeType: resource.mimeType || "application/json",
    };

    if (isParameterized) {
      const template = new ResourceTemplate(resource.uriTemplate, {
        list: resource.list
          ? async () => {
              const items = await resource.list!();
              return {
                resources: items.map((item) => ({
                  uri: item.uri,
                  name: item.name,
                  description: item.description,
                  mimeType: item.mimeType || "application/json",
                })),
              };
            }
          : undefined,
      });

      server.registerResource(
        resourceId,
        template,
        metadata,
        async (uri, variables) => {
          logger.info({ uri: uri.href, variables }, "Reading parameterized resource");
          const match = resourceRegistry.findResourceByUri(uri.href);
          if (!match) {
            throw new Error(`Resource not found: ${uri.href}`);
          }
          try {
            const content = await match.resource.read(match.params);
            logger.debug(
              {
                uri: uri.href,
                contentBytes: Buffer.byteLength(content.text, "utf-8"),
              },
              "Resource content size"
            );
            return {
              contents: [
                {
                  uri: content.uri,
                  mimeType: content.mimeType,
                  text: content.text,
                },
              ],
            };
          } catch (error) {
            logger.error({ uri: uri.href, error }, "Failed to read resource");
            const mcpError = ErrorHandler.handleError(
              error,
              { operation: "resource:read", context: { uri: uri.href } },
              logger
            );
            throw new Error(`Failed to read resource: ${mcpError.message}`);
          }
        }
      );
    } else {
      server.registerResource(
        resourceId,
        resource.uriTemplate,
        metadata,
        async (uri) => {
          logger.info({ uri: uri.href }, "Reading static resource");
          const match = resourceRegistry.findResourceByUri(uri.href);
          if (!match) {
            throw new Error(`Resource not found: ${uri.href}`);
          }
          try {
            const content = await match.resource.read(match.params);
            logger.debug(
              {
                uri: uri.href,
                contentBytes: Buffer.byteLength(content.text, "utf-8"),
              },
              "Resource content size"
            );
            return {
              contents: [
                {
                  uri: content.uri,
                  mimeType: content.mimeType,
                  text: content.text,
                },
              ],
            };
          } catch (error) {
            logger.error({ uri: uri.href, error }, "Failed to read resource");
            const mcpError = ErrorHandler.handleError(
              error,
              { operation: "resource:read", context: { uri: uri.href } },
              logger
            );
            throw new Error(`Failed to read resource: ${mcpError.message}`);
          }
        }
      );
    }
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
