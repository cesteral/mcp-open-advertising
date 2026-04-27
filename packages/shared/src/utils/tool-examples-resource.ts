// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Tool Examples Resource Generator
 *
 * Generates MCP Resources that expose tool input examples on-demand,
 * rather than embedding them in tool descriptions (which inflates context).
 *
 * Also generates a server-capabilities overview resource for tool grouping
 * and workflow discovery.
 */

import type { ToolDefinitionForFactory, ToolInputExample } from "./tool-handler-factory.js";
import type { StaticResourceDefinition } from "./resource-handler-factory.js";

/**
 * Generate a single MCP Resource containing all tool examples for a server.
 * Returns undefined if no tools have inputExamples.
 */
export function createToolExamplesResource(
  tools: ToolDefinitionForFactory[],
  serverName: string
): StaticResourceDefinition | undefined {
  const toolsWithExamples = tools.filter((t) => t.inputExamples && t.inputExamples.length > 0);

  if (toolsWithExamples.length === 0) return undefined;

  return {
    uri: `tool-examples://${serverName}/all`,
    name: `${serverName} Tool Examples`,
    description: `Input examples for all ${toolsWithExamples.length} tools with examples in ${serverName}`,
    mimeType: "text/markdown",
    getContent: () => formatToolExamplesMarkdown(toolsWithExamples, serverName),
  };
}

/**
 * Generate per-tool MCP Resources for tool examples.
 * Returns one resource per tool that has inputExamples.
 */
export function createPerToolExampleResources(
  tools: ToolDefinitionForFactory[]
): StaticResourceDefinition[] {
  return tools
    .filter((t) => t.inputExamples && t.inputExamples.length > 0)
    .map((tool) => ({
      uri: `tool-examples://${tool.name}`,
      name: `${tool.title ?? tool.name} Examples`,
      description: `Input examples for the ${tool.name} tool`,
      mimeType: "text/markdown",
      getContent: () => formatSingleToolExamples(tool.name, tool.title, tool.inputExamples!),
    }));
}

/**
 * Tool group definition for server-capabilities overview.
 */
export interface ToolGroup {
  [groupName: string]: string[];
}

/**
 * Server capabilities overview configuration.
 */
export interface ServerCapabilitiesConfig {
  serverName: string;
  toolGroups: ToolGroup;
  commonWorkflows?: string[];
  discoveryFlow?: string[];
  relatedResources?: string[];
  startHere: string;
  allTools?: ToolDefinitionForFactory[];
  allToolNames?: string[];
}

/**
 * Generate a server-capabilities overview resource.
 */
export function createServerCapabilitiesResource(
  config: ServerCapabilitiesConfig
): StaticResourceDefinition {
  const groupedTools = new Set(Object.values(config.toolGroups).flat());
  const toolGroupSummaries = Object.fromEntries(
    Object.entries(config.toolGroups).map(([groupName, tools]) => [
      groupName,
      { toolCount: tools.length, tools },
    ])
  );
  const allToolNames = config.allToolNames ?? config.allTools?.map((tool) => tool.name) ?? [];
  const ungroupedTools = allToolNames.filter((name) => !groupedTools.has(name));

  return {
    uri: `server-capabilities://${config.serverName}/overview`,
    name: `${config.serverName} Capabilities Overview`,
    description: `Structured overview of tool groups, workflows, and entry points for ${config.serverName}`,
    mimeType: "application/json",
    getContent: () =>
      JSON.stringify(
        {
          serverName: config.serverName,
          toolCount: allToolNames.length || groupedTools.size,
          toolGroups: config.toolGroups,
          toolGroupSummaries,
          ungroupedTools,
          commonWorkflows: config.commonWorkflows ?? [],
          discoveryFlow: config.discoveryFlow ?? [],
          relatedResources: config.relatedResources ?? [],
          startHere: config.startHere,
        },
        null,
        2
      ),
  };
}

function formatToolExamplesMarkdown(tools: ToolDefinitionForFactory[], serverName: string): string {
  const sections = tools.map((tool) => {
    const header = `## ${tool.title ?? tool.name} (\`${tool.name}\`)`;
    const examples = tool.inputExamples!.map(
      (ex) => `**${ex.label}:**\n\`\`\`json\n${JSON.stringify(ex.input, null, 2)}\n\`\`\``
    );
    return `${header}\n\n${examples.join("\n\n")}`;
  });

  return `# Tool Examples — ${serverName}\n\n${sections.join("\n\n---\n\n")}`;
}

function formatSingleToolExamples(
  name: string,
  title: string | undefined,
  examples: ToolInputExample[]
): string {
  const blocks = examples.map(
    (ex) => `**${ex.label}:**\n\`\`\`json\n${JSON.stringify(ex.input, null, 2)}\n\`\`\``
  );

  return `# ${title ?? name} Examples\n\n${blocks.join("\n\n")}`;
}
