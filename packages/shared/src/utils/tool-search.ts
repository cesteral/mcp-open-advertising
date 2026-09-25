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
 *
 * Names are split into words on `_`; a query word matches a name word when it
 * equals it (after plural folding), is a synonym listed in QUERY_SYNONYMS, or
 * is a prefix of it at least MIN_PREFIX_LENGTH characters long. Queries are
 * split on `_` like names, so a tool name used as a query finds that tool.
 * Titles match on equality after plural folding of both sides; for
 * descriptions only the query side is folded. Rankings are pinned over the
 * wire by evals/tool-search-ranking.test.mjs.
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

/**
 * Query words that name the same operation as a word tool names actually use.
 * Deliberately short: every entry here widens what a query can reach, so an
 * entry belongs only when the two words mean the same operation on an ad
 * platform. "remove" → "delete" earns its place because tool names say
 * `delete`, users say "remove", and the lexical ranker otherwise hands the
 * query to whatever tool shares its object noun (#205 gaps).
 */
const QUERY_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  // Both ways: most platforms name the tool `delete_entity`, but gads names it
  // `gads_remove_entity`, so "delete" must reach "remove" too.
  delete: ["remove"],
  remove: ["delete"],
  erase: ["delete"],
  destroy: ["delete"],
  edit: ["update"],
  modify: ["update"],
  change: ["update"],
};

/**
 * Shortest query token allowed to match a name word by prefix ("camp" →
 * "campaigns"). Two characters is too permissive: "ad" would prefix-match
 * "adjust", which is how `delete an ad group` used to rank `tiktok_adjust_bids`
 * first.
 */
const MIN_PREFIX_LENGTH = 3;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

/**
 * A tool name split into its words: `tiktok_delete_entity` →
 * ["tiktok", "delete", "entity"]. Names only — descriptions keep `_` as a word
 * character, so an enum like `SINGLE_IMAGE_AD` stays one token instead of
 * adding an "ad" hit to every tool that lists ad formats.
 */
function nameWords(name: string): string[] {
  return tokenize(name.replace(/_/g, " "));
}

/**
 * Crude plural folding, enough that "campaigns"/"campaign",
 * "entities"/"entity" and "statuses"/"status" compare equal. Not a real
 * stemmer, and it does not need to be — the registries it runs over are a few
 * dozen tools.
 */
function stem(token: string): string {
  if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  // "statuses", "addresses", "boxes", "searches": the plural adds "es".
  if (token.length > 4 && /(ss|us|x|ch|sh)es$/.test(token)) return token.slice(0, -2);
  if (token.length >= 3 && token.endsWith("s") && !/(ss|us|is)$/.test(token)) {
    return token.slice(0, -1);
  }
  return token;
}

/**
 * Split a query into words. Unlike descriptions, `_` separates words here too,
 * so a query that is itself a tool name (`ttd_download_report`) matches that
 * tool's name words instead of being one token that equals no name word.
 */
function queryWords(query: string): string[] {
  return tokenize(query.replace(/_/g, " "));
}

/**
 * The forms a query token may match as: its folded form plus any synonym.
 * `Object.hasOwn`, not a bare index: the words "constructor" and "__proto__"
 * would otherwise read inherited Object members and throw when spread.
 */
function queryForms(token: string): string[] {
  const synonyms = Object.hasOwn(QUERY_SYNONYMS, token) ? QUERY_SYNONYMS[token] : [];
  return [stem(token), ...synonyms];
}

function wordMatches(forms: string[], word: string): boolean {
  const stemmed = stem(word);
  return forms.some((f) => f === stemmed);
}

function nameWordMatches(query: string, forms: string[], word: string): boolean {
  if (wordMatches(forms, word)) return true;
  return query.length >= MIN_PREFIX_LENGTH && word.startsWith(query);
}

interface ScoredTool {
  name: string;
  title?: string;
  description: string;
  score: number;
  matchedTokens: string[];
}

function scoreTool(tool: ToolDefinitionForFactory, queryTokens: string[]): ScoredTool {
  const nameTokens = nameWords(tool.name);
  const titleTokens = tool.title ? tokenize(tool.title) : [];
  const descTokens = tokenize(tool.description).slice(0, DESCRIPTION_TOKEN_LIMIT);

  let score = 0;
  const matched = new Set<string>();

  for (const qt of queryTokens) {
    const forms = queryForms(qt);
    let hit = false;
    // Name words are matched once per query token: a name repeating a word
    // must not double-count a single query word.
    for (const nt of nameTokens) {
      if (nameWordMatches(qt, forms, nt)) {
        score += NAME_WEIGHT;
        hit = true;
        break;
      }
    }
    for (const tt of titleTokens) {
      if (wordMatches(forms, tt)) {
        score += TITLE_WEIGHT;
        hit = true;
      }
    }
    // Description WORDS are not folded: folding them let "deletes" in one
    // tool's prose count as "delete" and tie cm360's delete-a-campaign case.
    // The query word is still folded, so "deletes" does match "delete".
    for (const dt of descTokens) {
      if (dt === qt || forms.includes(dt)) {
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
  const queryTokens = queryWords(input.query);
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
