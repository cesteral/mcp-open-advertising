// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
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
  {{key}}_get_report: "mcp.execute.{{key}}_reporting",
  // {{#writes}}
  {{key}}_create_entity: "mcp.execute.{{key}}_entity_update",
  {{key}}_update_entity: "mcp.execute.{{key}}_entity_update",
  {{key}}_delete_entity: "mcp.execute.{{key}}_entity_update",
  {{key}}_bulk_update_status: "mcp.execute.{{key}}_bulk_operations",
  // {{/writes}}
};

/**
 * Create and configure the MCP server. Only this server's data lives here; the
 * shared factory owns registration and its order (part of the wire contract).
 * Keep the `platform` (and, once governed, `manifestUrl`) lines literal: fleet
 * checks read them.
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
    // {{#writes}}
    description:
      "{{displayName}} campaign management: list, read, validate and pacing, with governed create, update, delete and bulk-status tools (scaffolded; the writes are not implemented yet).",
    // {{/writes}}
    // {{^writes}}
    description:
      "{{displayName}} campaign management (experimental, read-only): list accounts and entities, read, validate and pacing.",
    // {{/writes}}
    instructions:
      // {{#writes}}
      "{{displayName}} campaign management server. Use {{key}}_list_accounts to find accounts, {{key}}_list_entities to browse entities and {{key}}_get_entity to read one. " +
      "The create, update, delete and bulk-status tools are not implemented yet and return an error.",
      // {{/writes}}
      // {{^writes}}
      "{{displayName}} campaign management server (read-only). Use {{key}}_list_accounts to find accounts, {{key}}_list_entities to browse entities and {{key}}_get_entity to read one.",
      // {{/writes}}
    tools: allTools,
    resources: allResources,
    prompts: promptRegistry.values(),
    workflowIdByToolName: {{key}}WorkflowIdByToolName,
    // {{#writes}}
    // Governed servers only: the decision-token verifier reads the manifest.
    manifestUrl: new URL("../cesteral-manifest.json", import.meta.url),
    // {{/writes}}
    sessionServiceStore,
  });
}
