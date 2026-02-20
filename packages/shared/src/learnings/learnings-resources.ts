/**
 * Learnings MCP Resources
 *
 * Exposes the learnings tree to AI agents via MCP resources.
 * Each server registers resources for its platform plus shared resources.
 * Supports filtered retrieval via ?tool= query parameter.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { StaticResourceDefinition } from "../utils/resource-handler-factory.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read and concatenate all markdown files in a directory.
 * When a tool filter is provided, only returns sections whose
 * "Applies to" field mentions the tool.
 */
function readMarkdownDir(dirPath: string, filters?: { tool?: string }): string {
  if (!existsSync(dirPath)) {
    return "_No learnings found for this category._\n";
  }

  const files = readdirSync(dirPath).filter((f) => f.endsWith(".md")).sort();
  if (files.length === 0) {
    return "_No learnings found for this category._\n";
  }

  let fullContent = files
    .map((file) => {
      try {
        return readFileSync(join(dirPath, file), "utf-8");
      } catch {
        return `_Error reading ${file}_\n`;
      }
    })
    .join("\n---\n\n");

  // Apply tool filter if provided
  if (filters?.tool) {
    fullContent = filterSectionsByTool(fullContent, filters.tool);
  }

  return fullContent || "_No matching learnings found._\n";
}

/**
 * Filter markdown content to only include sections whose "Applies to"
 * field matches the given tool name.
 */
function filterSectionsByTool(content: string, tool: string): string {
  const sections = content.split(/\n(?=## )/);
  const toolLower = tool.toLowerCase();

  const matching = sections.filter((section) => {
    // Keep file-level headings (# headings) and separators
    if (!section.startsWith("## ")) return false;
    const appliesToMatch = section.match(/\*\*Applies to\*\*:\s*(.+)/);
    if (!appliesToMatch) return false;
    return appliesToMatch[1].toLowerCase().includes(toolLower);
  });

  return matching.join("\n");
}

/**
 * Extract tool filter from a URI's query parameters.
 */
function extractToolFilter(uri?: URL): { tool?: string } | undefined {
  if (!uri) return undefined;
  const tool = uri.searchParams?.get("tool");
  return tool ? { tool } : undefined;
}

// ---------------------------------------------------------------------------
// Resource factories
// ---------------------------------------------------------------------------

/**
 * Create a platform-specific learnings resource.
 */
function createPlatformLearningsResource(
  platform: string,
  platformLabel: string,
  learningsRoot: string
): StaticResourceDefinition {
  return {
    uri: `learnings://platforms/${platform}`,
    name: `${platformLabel} Learnings`,
    description: `All learnings for the ${platformLabel} platform — API gotchas, entity patterns, and tips. Supports ?tool= query param for filtered retrieval.`,
    mimeType: "text/markdown",
    getContent: (uri?: URL) =>
      readMarkdownDir(join(learningsRoot, "platforms", platform), extractToolFilter(uri)),
  };
}

/**
 * Create the agent-behaviors learnings resource.
 */
function createAgentBehaviorsResource(learningsRoot: string): StaticResourceDefinition {
  return {
    uri: "learnings://agent-behaviors",
    name: "Agent Behavior Learnings",
    description:
      "Common AI agent mistakes, effective patterns, and schema discipline insights. Supports ?tool= query param for filtered retrieval.",
    mimeType: "text/markdown",
    getContent: (uri?: URL) =>
      readMarkdownDir(join(learningsRoot, "agent-behaviors"), extractToolFilter(uri)),
  };
}

/**
 * Create a workflows learnings resource.
 */
function createWorkflowsResource(learningsRoot: string): StaticResourceDefinition {
  return {
    uri: "learnings://workflows",
    name: "Workflow Learnings",
    description:
      "Cross-platform workflow insights — campaign setup, troubleshooting, bulk operations. Supports ?tool= query param for filtered retrieval.",
    mimeType: "text/markdown",
    getContent: (uri?: URL) =>
      readMarkdownDir(join(learningsRoot, "workflows"), extractToolFilter(uri)),
  };
}

/**
 * Create a combined "all learnings" resource.
 */
function createAllLearningsResource(learningsRoot: string): StaticResourceDefinition {
  return {
    uri: "learnings://all",
    name: "All Learnings",
    description:
      "Complete learnings tree — all platforms, workflows, and agent behavior insights. Supports ?tool= query param for filtered retrieval.",
    mimeType: "text/markdown",
    getContent: (uri?: URL) => {
      const filters = extractToolFilter(uri);
      const sections: string[] = [];

      // Platforms
      for (const platform of ["ttd", "dv360", "gads", "dbm"]) {
        const dir = join(learningsRoot, "platforms", platform);
        if (existsSync(dir)) {
          sections.push(readMarkdownDir(dir, filters));
        }
      }

      // Workflows
      sections.push(readMarkdownDir(join(learningsRoot, "workflows"), filters));

      // Agent behaviors
      sections.push(readMarkdownDir(join(learningsRoot, "agent-behaviors"), filters));

      // Auto-generated learnings
      sections.push(readMarkdownDir(join(learningsRoot, "auto-generated"), filters));

      return sections.join("\n---\n\n");
    },
  };
}

/**
 * Create the auto-generated learnings resource.
 */
function createAutoGeneratedResource(learningsRoot: string): StaticResourceDefinition {
  return {
    uri: "learnings://auto-generated",
    name: "Auto-Generated Learnings",
    description:
      "Learnings automatically extracted from repeated evaluator findings. Supports ?tool= query param for filtered retrieval.",
    mimeType: "text/markdown",
    getContent: (uri?: URL) =>
      readMarkdownDir(join(learningsRoot, "auto-generated"), extractToolFilter(uri)),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Platforms and their display labels */
const PLATFORM_LABELS: Record<string, string> = {
  ttd: "The Trade Desk",
  dv360: "Display & Video 360",
  gads: "Google Ads",
  dbm: "Bid Manager (DV360 Reporting)",
};

export interface CreateLearningsResourcesOptions {
  /** Root directory of the learnings tree. */
  learningsRoot: string;
  /** Platform for this server (e.g. "ttd"). Resources for this platform are included. */
  serverPlatform: string;
}

/**
 * Create learnings resources for a specific server.
 *
 * Returns:
 * - Platform-specific learnings for this server's platform
 * - Agent behaviors (shared)
 * - Workflows (shared)
 * - Auto-generated learnings (shared)
 * - All learnings (combined)
 */
export function createLearningsResources(
  options: CreateLearningsResourcesOptions
): StaticResourceDefinition[] {
  const { learningsRoot, serverPlatform } = options;

  const resources: StaticResourceDefinition[] = [];

  // Platform-specific resource for this server
  const platformLabel = PLATFORM_LABELS[serverPlatform] ?? serverPlatform;
  resources.push(
    createPlatformLearningsResource(serverPlatform, platformLabel, learningsRoot)
  );

  // Shared resources
  resources.push(createAgentBehaviorsResource(learningsRoot));
  resources.push(createWorkflowsResource(learningsRoot));
  resources.push(createAutoGeneratedResource(learningsRoot));
  resources.push(createAllLearningsResource(learningsRoot));

  return resources;
}
