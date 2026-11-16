// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { allTools } from "./tools/index.js";
import { allResources } from "./resources/index.js";
import { promptRegistry } from "./prompts/index.js";
import { createPlatformMcpServer } from "@cesteral/shared";
// {{#writes}}
import { reportCsvStore, sessionServiceStore } from "../services/session-services.js";
// {{/writes}}
// {{^writes}}
import { sessionServiceStore } from "../services/session-services.js";
// {{/writes}}
import type { Logger } from "pino";
import packageJson from "../../package.json" with { type: "json" };

/**
 * Interaction-log workflow id per tool. Every tool registered through the
 * factory except the generated `{{key}}_search_tools` must appear here, and
 * nothing else may (`scripts/lib/workflow-id-maps.test.mjs`).
 */
export const {{key}}WorkflowIdByToolName: Record<string, string> = {
  {{key}}_list_accounts: "mcp.execute.{{key}}_entity_read",
  {{key}}_get_report: "mcp.execute.{{key}}_reporting",
  {{key}}_get_pacing_status: "mcp.execute.{{key}}_entity_read",
  // {{#writes}}
  {{key}}_submit_report: "mcp.execute.{{key}}_reporting",
  {{key}}_check_report_status: "mcp.execute.{{key}}_reporting",
  {{key}}_download_report: "mcp.execute.{{key}}_reporting",
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
      "{{displayName}} reporting: synchronous reports and pacing, with the async report trio (scaffolded; submit_report is not implemented yet).",
    // {{/writes}}
    // {{^writes}}
    description:
      "{{displayName}} reporting (experimental, read-only): list accounts, synchronous reports and pacing.",
    // {{/writes}}
    instructions:
      "{{displayName}} reporting server. Use {{key}}_list_accounts to find accounts and {{key}}_get_report for performance rows.",
    tools: allTools,
    resources: allResources,
    prompts: promptRegistry.values(),
    workflowIdByToolName: {{key}}WorkflowIdByToolName,
    // {{#writes}}
    // Governed servers only: the decision-token verifier reads the manifest.
    manifestUrl: new URL("../cesteral-manifest.json", import.meta.url),
    // {{/writes}}
    sessionServiceStore,
    // {{#writes}}
    reportCsv: {
      store: reportCsvStore,
      platformLabel: "{{displayName}}",
      downloadToolName: "{{key}}_download_report",
    },
    // {{/writes}}
  });
}

/** Connect the server to the stdio transport. */
export async function runStdioServer(server: McpServer, logger: Logger): Promise<void> {
  logger.info("Starting MCP server with stdio transport");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP server connected via stdio");
}
