// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Cross-server pagination contract.
 *
 * Each ad-platform API names its cursor differently — Meta `after`, TTD/CM360/DV360/GAds/SA360
 * `pageToken`, Pinterest `bookmark`, Snapchat `cursor`, LinkedIn `start` (offset),
 * Amazon DSP `startIndex` (offset), TikTok `page` (1-based). The input schema of every
 * list tool keeps the platform-native name (so the cursor flows through to the upstream API
 * unchanged), but every list tool emits the same uniform `pagination` block so MCP clients
 * can drive pagination identically across all 13 servers.
 *
 * Output contract:
 *   pagination: {
 *     nextCursor: string | null,        // opaque token, or null when exhausted
 *     hasMore: boolean,
 *     pageSize: number,                 // items in this page
 *     totalCount?: number,              // if the upstream exposes it
 *     nextPageInputKey: string,         // which input parameter to pass nextCursor to
 *   }
 *
 * For offset-based platforms, `nextCursor` is the stringified offset for the next page
 * (e.g. `"50"` when the caller asked for `start: 0, limit: 50`); the model just passes
 * it back into `nextPageInputKey` unchanged.
 */

import { z } from "zod";

/** Default page size applied where a server does not specify one. */
export const DEFAULT_PAGE_SIZE = 50;

/** Hard cap surfaced in input schemas. Servers may use a lower cap if the upstream API requires. */
export const MAX_PAGE_SIZE = 200;

export const PaginationOutputSchema = z
  .object({
    nextCursor: z
      .string()
      .nullable()
      .describe("Opaque cursor for the next page, or null if there are no more pages."),
    hasMore: z.boolean().describe("True iff more pages are available."),
    pageSize: z.number().int().nonnegative().describe("Number of items returned in this page."),
    totalCount: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe("Total items across all pages, when the upstream API exposes it."),
    nextPageInputKey: z
      .string()
      .describe(
        "Name of the input parameter to pass `nextCursor` to on the next call (e.g. 'pageToken', 'after', 'bookmark', 'cursor', 'start', 'startIndex', 'page')."
      ),
  })
  .describe("Uniform pagination metadata. Same shape across every list tool in every server.");

export type PaginationOutput = z.infer<typeof PaginationOutputSchema>;

export interface BuildPaginationInput {
  /** Cursor returned by the upstream API for the next page, or null/undefined if exhausted. */
  nextCursor: string | null | undefined;
  /** Items returned in this page. */
  pageSize: number;
  /** Total items across all pages, if known. */
  totalCount?: number;
  /** Name of the input parameter that accepts `nextCursor` on the next call. */
  nextPageInputKey: string;
}

/**
 * Build a uniform pagination output block. Pass-through cursor coercion + hasMore inference.
 */
export function buildPaginationOutput(input: BuildPaginationInput): PaginationOutput {
  const nextCursor = input.nextCursor ?? null;
  const result: PaginationOutput = {
    nextCursor,
    hasMore: nextCursor !== null && nextCursor !== "",
    pageSize: input.pageSize,
    nextPageInputKey: input.nextPageInputKey,
  };
  if (input.totalCount !== undefined) {
    result.totalCount = input.totalCount;
  }
  return result;
}

/**
 * Render a one-line, model-friendly hint describing how to fetch the next page.
 * Returns an empty string when `hasMore` is false.
 */
export function formatPaginationHint(p: PaginationOutput): string {
  if (!p.hasMore || p.nextCursor === null) return "";
  return `\n\nMore results available. Call again with ${p.nextPageInputKey}: ${JSON.stringify(p.nextCursor)}`;
}

/**
 * Canonical key set every list tool's `pagination` output block must expose.
 * `totalCount` is optional, all others are required.
 */
export const PAGINATION_REQUIRED_KEYS = [
  "nextCursor",
  "hasMore",
  "pageSize",
  "nextPageInputKey",
] as const;
export const PAGINATION_OPTIONAL_KEYS = ["totalCount"] as const;

interface ToolLike {
  name: string;
  outputSchema?: { _def?: unknown } | unknown;
}

export interface PaginationConformanceViolation {
  tool: string;
  reason:
    | "pagination-key-missing-required"
    | "pagination-key-unexpected"
    | "pagination-not-object";
  details: string;
}

/**
 * Walk a list of tool definitions and report any tool whose `outputSchema`
 * declares a `pagination` field that does not match the canonical
 * `PaginationOutputSchema` shape.
 *
 * Tools without a `pagination` field are ignored — many list endpoints
 * legitimately return all results in one shot (account lists, user
 * profiles) and do not paginate.
 */
export function findPaginationConformanceViolations(
  tools: ReadonlyArray<ToolLike>
): PaginationConformanceViolation[] {
  const violations: PaginationConformanceViolation[] = [];

  for (const tool of tools) {
    const outputSchema = tool.outputSchema as { _def?: { shape?: unknown } } | undefined;
    if (!outputSchema?._def) continue;

    const shapeSrc = (outputSchema._def as { shape?: unknown }).shape;
    const shape =
      typeof shapeSrc === "function"
        ? (shapeSrc as () => Record<string, unknown>)()
        : (shapeSrc as Record<string, unknown> | undefined);
    if (!shape || typeof shape !== "object") continue;

    const paginationField = shape["pagination"] as { _def?: { shape?: unknown } } | undefined;
    if (!paginationField) continue;

    const innerSrc = paginationField._def?.shape;
    const innerShape =
      typeof innerSrc === "function"
        ? (innerSrc as () => Record<string, unknown>)()
        : (innerSrc as Record<string, unknown> | undefined);

    if (!innerShape || typeof innerShape !== "object") {
      violations.push({
        tool: tool.name,
        reason: "pagination-not-object",
        details: "outputSchema.pagination is not a Zod object schema",
      });
      continue;
    }

    const innerKeys = new Set(Object.keys(innerShape));
    const allowed = new Set<string>([
      ...PAGINATION_REQUIRED_KEYS,
      ...PAGINATION_OPTIONAL_KEYS,
    ]);

    for (const required of PAGINATION_REQUIRED_KEYS) {
      if (!innerKeys.has(required)) {
        violations.push({
          tool: tool.name,
          reason: "pagination-key-missing-required",
          details: `pagination output is missing required key '${required}'`,
        });
      }
    }
    for (const key of innerKeys) {
      if (!allowed.has(key)) {
        violations.push({
          tool: tool.name,
          reason: "pagination-key-unexpected",
          details: `pagination output has unexpected key '${key}' (not in canonical PaginationOutputSchema)`,
        });
      }
    }
  }

  return violations;
}
