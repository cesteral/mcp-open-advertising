// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Utility helpers for parsing DV360 list-API responses.
 *
 * The DV360 API returns entity arrays under keys that are pluralised forms of
 * the entity type (e.g. "campaigns", "lineItems").  The exact key varies per
 * entity, so this module centralises the lookup logic and removes the need for
 * `as any` casts in the calling code.
 */

/**
 * Common list-response shape from the DV360 API.
 */
export interface DV360ListResponse {
  [key: string]: unknown;
  nextPageToken?: string;
}

/**
 * Result of extracting entities from a list response.
 */
export interface ExtractedEntities {
  /** The array of entity objects found in the response. */
  entities: unknown[];
  /** Token for fetching the next page, if present. */
  nextPageToken?: string;
}

/**
 * Build a set of candidate plural keys for a given entity type.
 *
 * Handles the three most common English pluralisation patterns that appear in
 * the DV360 API surface:
 *
 *  - Regular:  campaign   → campaigns
 *  - "-es":    adGroupAd  → adGroupAds  (also catches "es" endings like "statuses")
 *  - "-ies":   frequency  → frequencies  (words ending in consonant + "y")
 */
function pluralCandidates(entityType: string): string[] {
  const candidates: string[] = [];

  // Most entity types just append "s" (campaigns, lineItems, insertionOrders …)
  candidates.push(`${entityType}s`);

  // Words ending in "y" preceded by a consonant → drop "y", add "ies"
  if (/[^aeiou]y$/i.test(entityType)) {
    candidates.push(`${entityType.slice(0, -1)}ies`);
  }

  // Words ending in s, x, z, ch, sh → add "es"
  if (/(?:s|x|z|ch|sh)$/i.test(entityType)) {
    candidates.push(`${entityType}es`);
  }

  return candidates;
}

/**
 * Extract the entity array from a DV360 list-API response.
 *
 * Strategy:
 *  1. Try common pluralisation patterns derived from `entityType`.
 *  2. Fall back to scanning all top-level keys for the first array value.
 *
 * @param response     The validated API response object.
 * @param entityType   The singular entity type key (e.g. "campaign", "lineItem").
 * @returns            An object with the entity array and an optional `nextPageToken`.
 */
export function extractEntitiesFromListResponse(
  response: unknown,
  entityType: string,
): ExtractedEntities {
  if (response === null || response === undefined || typeof response !== "object") {
    return { entities: [] };
  }

  const obj = response as Record<string, unknown>;

  // --- 1. Try well-known pluralisation patterns --------------------------------
  for (const key of pluralCandidates(entityType)) {
    if (Array.isArray(obj[key])) {
      return {
        entities: obj[key] as unknown[],
        nextPageToken: typeof obj.nextPageToken === "string" ? obj.nextPageToken : undefined,
      };
    }
  }

  // --- 2. Fallback: pick the first key whose value is an array -----------------
  for (const [key, value] of Object.entries(obj)) {
    if (key === "nextPageToken") continue;
    if (Array.isArray(value)) {
      return {
        entities: value as unknown[],
        nextPageToken: typeof obj.nextPageToken === "string" ? obj.nextPageToken : undefined,
      };
    }
  }

  // Nothing found — return empty set rather than throwing.
  return {
    entities: [],
    nextPageToken: typeof obj.nextPageToken === "string" ? obj.nextPageToken : undefined,
  };
}