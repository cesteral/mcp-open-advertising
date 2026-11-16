// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { allTools } from "./tools/index.js";
import { allResources } from "./resources/index.js";
import { promptRegistry } from "./prompts/index.js";
import { createPlatformMcpServer } from "@cesteral/shared";
import { sessionServiceStore } from "../services/session-services.js";
import type { Logger } from "pino";
import packageJson from "../../package.json" with { type: "json" };

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
 * Create and configure the MCP server. Only this server's data lives here; the
 * shared factory owns registration and its order (part of the wire contract).
 * Keep the `platform` and `manifestUrl` lines literal: fleet checks read them.
 */
export async function createMcpServer(
  logger: Logger,
  sessionId?: string,
  gcsBucket?: string
): Promise<McpServer> {
  return createPlatformMcpServer({
    sdk: { McpServer, ResourceTemplate },
    logger,
    sessionId,
    gcsBucket,
    packageName: "{{package}}",
    platform: "{{key}}",
    version: packageJson.version,
    description:
      "{{displayName}} campaign management: list, read, validate and pacing, with governed create, update, delete and bulk-status tools (scaffolded; the writes are not implemented yet).",
    instructions:
      "{{displayName}} campaign management server. Use {{key}}_list_accounts to find accounts, {{key}}_list_entities to browse entities and {{key}}_get_entity to read one. " +
      "The create, update, delete and bulk-status tools are not implemented yet and return an error.",
    tools: allTools,
    resources: allResources,
    prompts: promptRegistry.values(),
    workflowIdByToolName: {{key}}WorkflowIdByToolName,
    manifestUrl: new URL("../cesteral-manifest.json", import.meta.url),
    sessionServiceStore,
  });
}

/** Connect the server to the stdio transport. */
export async function runStdioServer(server: McpServer, logger: Logger): Promise<void> {
  logger.info("Starting MCP server with stdio transport");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP server connected via stdio");
}
