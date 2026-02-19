/**
 * submit_learning MCP Tool
 *
 * Allows any MCP client user to contribute learnings to the shared
 * learnings tree without needing direct git access. Appends a
 * formatted markdown entry to the appropriate file.
 */

import { z } from "zod";
import { existsSync, mkdirSync, appendFileSync, readFileSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import type { ToolDefinitionForFactory } from "../utils/tool-handler-factory.js";

const TOOL_NAME = "submit_learning";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const CATEGORIES = ["platform", "workflow", "agent-behavior"] as const;
const PLATFORMS = ["ttd", "dv360", "gads", "dbm"] as const;

export const SubmitLearningInputSchema = z
  .object({
    category: z
      .enum(CATEGORIES)
      .describe(
        "Learning category: 'platform' for API-specific insights, 'workflow' for cross-platform patterns, 'agent-behavior' for agent usage patterns"
      ),
    platform: z
      .enum(PLATFORMS)
      .optional()
      .describe("Platform (required when category is 'platform'): ttd, dv360, gads, dbm"),
    subcategory: z
      .string()
      .optional()
      .describe(
        "Subcategory within the category. For platform learnings: 'api-gotchas', 'entity-patterns', 'reporting-tips'. " +
        "For workflows: 'campaign-setup', 'troubleshooting', 'bulk-operations'. " +
        "For agent-behaviors: 'common-mistakes', 'effective-patterns', 'schema-discipline'. " +
        "Defaults to the most common subcategory for the chosen category."
      ),
    title: z
      .string()
      .min(5)
      .max(200)
      .describe("Short descriptive title for the learning (5-200 chars)"),
    content: z
      .string()
      .min(10)
      .max(5000)
      .describe("Detailed description of the learning (10-5000 chars)"),
    recommendation: z
      .string()
      .max(1000)
      .optional()
      .describe("Actionable recommendation based on this learning"),
    appliesTo: z
      .string()
      .max(500)
      .optional()
      .describe("Comma-separated list of servers, tools, or workflow IDs this applies to"),
  })
  .refine(
    (data) => data.category !== "platform" || data.platform !== undefined,
    { message: "platform is required when category is 'platform'" }
  );

export const SubmitLearningOutputSchema = z.object({
  success: z.boolean(),
  filePath: z.string().describe("Relative path to the file the learning was appended to"),
  entryTitle: z.string(),
  timestamp: z.string().datetime(),
});

type SubmitLearningInput = z.infer<typeof SubmitLearningInputSchema>;
type SubmitLearningOutput = z.infer<typeof SubmitLearningOutputSchema>;

// ---------------------------------------------------------------------------
// File path resolution
// ---------------------------------------------------------------------------

const DEFAULT_SUBCATEGORIES: Record<string, string> = {
  platform: "api-gotchas",
  workflow: "campaign-setup",
  "agent-behavior": "common-mistakes",
};

/**
 * Resolve the target markdown file for a learning entry.
 * Returns a path under `learningsRoot`.
 */
function resolveTargetFile(
  learningsRoot: string,
  category: string,
  platform?: string,
  subcategory?: string
): string {
  const sub = subcategory ?? DEFAULT_SUBCATEGORIES[category] ?? "general";

  // Sanitize subcategory to prevent path traversal
  const safeSub = sub.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();

  let targetPath: string;
  switch (category) {
    case "platform":
      targetPath = join(learningsRoot, "platforms", platform!, `${safeSub}.md`);
      break;
    case "workflow":
      targetPath = join(learningsRoot, "workflows", `${safeSub}.md`);
      break;
    case "agent-behavior":
      targetPath = join(learningsRoot, "agent-behaviors", `${safeSub}.md`);
      break;
    default:
      targetPath = join(learningsRoot, "workflows", `${safeSub}.md`);
  }

  // Verify resolved path is within learningsRoot (prevent traversal)
  const resolved = resolve(targetPath);
  const resolvedRoot = resolve(learningsRoot);
  if (!resolved.startsWith(resolvedRoot)) {
    throw new Error("Invalid path: attempted path traversal");
  }

  return targetPath;
}

// ---------------------------------------------------------------------------
// Logic
// ---------------------------------------------------------------------------

export function createSubmitLearningLogic(learningsRoot: string) {
  return async function submitLearningLogic(
    input: SubmitLearningInput
  ): Promise<SubmitLearningOutput> {
    const targetFile = resolveTargetFile(
      learningsRoot,
      input.category,
      input.platform,
      input.subcategory
    );

    // Ensure parent directory exists
    const dir = join(targetFile, "..");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // If the file doesn't exist, create it with a header
    if (!existsSync(targetFile)) {
      const header = `# ${input.subcategory ?? DEFAULT_SUBCATEGORIES[input.category] ?? "Learnings"}\n\n`;
      appendFileSync(targetFile, header, "utf-8");
    }

    // Format the entry
    const timestamp = new Date().toISOString();
    const date = timestamp.slice(0, 10);
    let entry = `\n## ${input.title}\n`;
    entry += `- **Date**: ${date}\n`;
    entry += `- **Source**: MCP session (submit_learning tool)\n`;
    entry += `- **Context**: ${input.content}\n`;
    if (input.recommendation) {
      entry += `- **Recommendation**: ${input.recommendation}\n`;
    }
    if (input.appliesTo) {
      entry += `- **Applies to**: ${input.appliesTo}\n`;
    }

    // Read existing content, insert new entry after the first heading
    const existing = readFileSync(targetFile, "utf-8");
    const firstHeadingEnd = existing.indexOf("\n\n");
    if (firstHeadingEnd !== -1 && firstHeadingEnd < 200) {
      // Insert after the file-level heading
      const before = existing.slice(0, firstHeadingEnd + 2);
      const after = existing.slice(firstHeadingEnd + 2);
      const newContent = before + entry + "\n" + after;
      // Use writeFileSync to replace content (appendFileSync would add to end)
      const { writeFileSync } = await import("node:fs");
      writeFileSync(targetFile, newContent, "utf-8");
    } else {
      // No clear heading structure, just append
      appendFileSync(targetFile, entry + "\n", "utf-8");
    }

    const relativePath = relative(process.cwd(), targetFile);

    return {
      success: true,
      filePath: relativePath,
      entryTitle: input.title,
      timestamp,
    };
  };
}

// ---------------------------------------------------------------------------
// Tool definition factory
// ---------------------------------------------------------------------------

export function createSubmitLearningTool(learningsRoot: string): ToolDefinitionForFactory {
  return {
    name: TOOL_NAME,
    title: "Submit Learning",
    description:
      "Submit a learning to the shared knowledge base. Learnings capture API gotchas, " +
      "effective patterns, common mistakes, and workflow insights discovered through usage. " +
      "Any MCP client user can contribute without git access.",
    inputSchema: SubmitLearningInputSchema,
    outputSchema: SubmitLearningOutputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    logic: createSubmitLearningLogic(learningsRoot),
    responseFormatter: (result: SubmitLearningOutput) => [
      {
        type: "text" as const,
        text: `Learning submitted: "${result.entryTitle}"\nFile: ${result.filePath}\nTimestamp: ${result.timestamp}`,
      },
    ],
  };
}
