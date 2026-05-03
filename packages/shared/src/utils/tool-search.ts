// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Tool Search Factory
 *
 * Produces a single `{platform}_search_tools` tool that ranks the server's
 * own tool registry against a natural-language query. Lets clients narrow
 * the working set instead of paging through 20+ tool descriptions on every
 * interaction.
 *
 * Scoring is a simple weighted token frequency over name + title +
 * description. No embeddings, no external index — the input data is small
 * (a few dozen tools) and lives entirely in process.
 */

import { z } from "zod";
import type { ToolDefinitionForFactory, McpTextContent } from "./tool-handler-factory.js";

const NAME_WEIGHT = 5;
const TITLE_WEIGHT = 3;
const DESCRIPTION_WEIGHT = 1;
const DESCRIPTION_TOKEN_LIMIT = 400;

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
  "what",
  "which",
  "where",
  "who",
  "why",
  "do",
  "does",
  "can",
  "should",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

interface ScoredTool {
  name: string;
  title?: string;
  description: string;
  score: number;
  matchedTokens: string[];
}

function scoreTool(tool: ToolDefinitionForFactory, queryTokens: string[]): ScoredTool {
  const nameTokens = tokenize(tool.name);
  const titleTokens = tool.title ? tokenize(tool.title) : [];
  const descTokens = tokenize(tool.description).slice(0, DESCRIPTION_TOKEN_LIMIT);

  let score = 0;
  const matched = new Set<string>();

  for (const qt of queryTokens) {
    let hit = false;
    for (const nt of nameTokens) {
      if (nt === qt || nt.includes(qt) || qt.includes(nt)) {
        score += NAME_WEIGHT;
        hit = true;
        break;
      }
    }
    for (const tt of titleTokens) {
      if (tt === qt) {
        score += TITLE_WEIGHT;
        hit = true;
      }
    }
    for (const dt of descTokens) {
      if (dt === qt) {
        score += DESCRIPTION_WEIGHT;
        hit = true;
      }
    }
    if (hit) matched.add(qt);
  }

  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    score,
    matchedTokens: [...matched],
  };
}

export interface CreateToolSearchToolOptions {
  /** Platform prefix used to name the tool (e.g. "ttd" → `ttd_search_tools`). */
  platform: string;
  /**
   * Resolver returning the registry of tools to search over. A function (not
   * an array) so the search tool can be appended to its own `allTools` array
   * without forming a circular reference at module-load time.
   */
  getTools: () => ToolDefinitionForFactory[];
}

const SearchInputSchema = z
  .object({
    query: z
      .string()
      .min(1)
      .max(500)
      .describe("Natural-language description of what you're trying to do."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Maximum number of results to return. Defaults to 10."),
  })
  .describe("Tool search parameters");

const SearchOutputSchema = z
  .object({
    query: z.string(),
    totalRegistered: z.number().int(),
    results: z.array(
      z.object({
        name: z.string(),
        title: z.string().optional(),
        description: z.string(),
        score: z.number(),
        matchedTokens: z.array(z.string()),
      })
    ),
  })
  .describe("Ranked tool matches");

type SearchInput = z.infer<typeof SearchInputSchema>;
type SearchOutput = z.infer<typeof SearchOutputSchema>;

/** Lower-level core, exposed so unit tests don't need to construct a tool def. */
export function searchTools(
  tools: ToolDefinitionForFactory[],
  input: SearchInput,
  selfName: string
): SearchOutput {
  const queryTokens = tokenize(input.query);
  const limit = input.limit ?? 10;

  const candidates = tools.filter((t) => t.name !== selfName);

  // If the query is empty after stop-word removal, return the inventory
  // header without scoring — a cheap browse mode.
  if (queryTokens.length === 0) {
    return {
      query: input.query,
      totalRegistered: candidates.length,
      results: candidates.slice(0, limit).map((t) => ({
        name: t.name,
        title: t.title,
        description: truncateDescription(t.description),
        score: 0,
        matchedTokens: [],
      })),
    };
  }

  const scored = candidates
    .map((t) => scoreTool(t, queryTokens))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => ({
      name: s.name,
      title: s.title,
      description: truncateDescription(s.description),
      score: s.score,
      matchedTokens: s.matchedTokens,
    }));

  return {
    query: input.query,
    totalRegistered: candidates.length,
    results: scored,
  };
}

function truncateDescription(desc: string): string {
  const firstParagraph = desc.split(/\n\n/)[0];
  return firstParagraph.length > 280 ? `${firstParagraph.slice(0, 277)}...` : firstParagraph;
}

export function createToolSearchTool(opts: CreateToolSearchToolOptions): ToolDefinitionForFactory {
  const toolName = `${opts.platform}_search_tools`;

  const description = `Search this server's tool registry by natural-language query. Returns up to \`limit\` ranked tools that best match \`query\`, scored by token frequency in tool name, title, and description.

Use this **before** invoking specific tools when you don't already know the exact tool name. The result lets you skip paging through the full inventory and land on the right tool in one round-trip.

If the result is empty or low-confidence, fall back to listing all tools.`;

  return {
    name: toolName,
    title: `${opts.platform.toUpperCase()} Search Tools`,
    description,
    inputSchema: SearchInputSchema,
    outputSchema: SearchOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputExamples: [
      {
        label: "Find a campaign-creation tool",
        input: { query: "create a campaign" },
      },
      {
        label: "Find reporting tools",
        input: { query: "download report csv", limit: 5 },
      },
    ],
    logic: async (input: SearchInput): Promise<SearchOutput> => {
      return searchTools(opts.getTools(), input, toolName);
    },
    responseFormatter: (result: SearchOutput): McpTextContent[] => {
      if (result.results.length === 0) {
        return [
          {
            type: "text" as const,
            text: `No tools matched "${result.query}" out of ${result.totalRegistered} registered. Try broader keywords or list all tools.`,
          },
        ];
      }

      const lines = result.results.map(
        (r, i) =>
          `${i + 1}. **${r.name}**${r.title ? ` — ${r.title}` : ""} (score: ${r.score})\n   ${r.description}`
      );

      return [
        {
          type: "text" as const,
          text: `Found ${result.results.length} match${result.results.length === 1 ? "" : "es"} for "${result.query}" out of ${result.totalRegistered} tools:\n\n${lines.join("\n\n")}`,
        },
      ];
    },
  };
}
