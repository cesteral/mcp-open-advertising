/**
 * Learnings MCP Resources
 *
 * Exposes the learnings tree to AI agents via MCP resources.
 * Each server registers resources for its platform plus shared resources.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { StaticResourceDefinition } from "../utils/resource-handler-factory.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read and concatenate all markdown files in a directory.
 */
function readMarkdownDir(dirPath: string): string {
  if (!existsSync(dirPath)) {
    return "_No learnings found for this category._\n";
  }

  const files = readdirSync(dirPath).filter((f) => f.endsWith(".md")).sort();
  if (files.length === 0) {
    return "_No learnings found for this category._\n";
  }

  return files
    .map((file) => {
      try {
        return readFileSync(join(dirPath, file), "utf-8");
      } catch {
        return `_Error reading ${file}_\n`;
      }
    })
    .join("\n---\n\n");
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
    description: `All learnings for the ${platformLabel} platform — API gotchas, entity patterns, and tips.`,
    mimeType: "text/markdown",
    getContent: () => readMarkdownDir(join(learningsRoot, "platforms", platform)),
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
      "Common AI agent mistakes, effective patterns, and schema discipline insights.",
    mimeType: "text/markdown",
    getContent: () => readMarkdownDir(join(learningsRoot, "agent-behaviors")),
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
      "Cross-platform workflow insights — campaign setup, troubleshooting, bulk operations.",
    mimeType: "text/markdown",
    getContent: () => readMarkdownDir(join(learningsRoot, "workflows")),
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
      "Complete learnings tree — all platforms, workflows, and agent behavior insights.",
    mimeType: "text/markdown",
    getContent: () => {
      const sections: string[] = [];

      // Platforms
      for (const platform of ["ttd", "dv360", "gads", "dbm"]) {
        const dir = join(learningsRoot, "platforms", platform);
        if (existsSync(dir)) {
          sections.push(readMarkdownDir(dir));
        }
      }

      // Workflows
      sections.push(readMarkdownDir(join(learningsRoot, "workflows")));

      // Agent behaviors
      sections.push(readMarkdownDir(join(learningsRoot, "agent-behaviors")));

      return sections.join("\n---\n\n");
    },
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
  resources.push(createAllLearningsResource(learningsRoot));

  return resources;
}
