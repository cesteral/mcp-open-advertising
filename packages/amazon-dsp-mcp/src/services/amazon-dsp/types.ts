// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

// ─── Unified API entities (#234) ────────────────────────────────────────────

/**
 * A Unified API DSP entity as Amazon returns it (`DSPCampaign`, `DSPAdGroup`,
 * `DSPAd`, `DSPTarget`, `DSPAdAssociation` in unified-api-dsp.json). Kept as
 * an open record: the tools pass platform objects through, and the shapes are
 * large oneOf trees that this server does not interpret beyond the fields
 * named in capture-snapshot.ts.
 */
export type AmazonDspUnifiedEntity = Record<string, unknown>;

/** One entry of a multi-status `error[]` (spec `ErrorsIndex` / `Error`). */
export interface AmazonDspUnifiedErrorIndex {
  index: number;
  errors: Array<{ code?: string; message?: string; fieldLocation?: string }>;
}

/** One page of a Unified `query/*` response. */
export interface AmazonDspUnifiedPage {
  entities: AmazonDspUnifiedEntity[];
  /** Amazon's `nextToken`; undefined on the last page. */
  nextToken: string | undefined;
}

// ─── Legacy advertiser listing (`GET /dsp/advertisers`) ─────────────────────

export interface AmazonDspAdvertiser {
  advertiserId: string;
  name: string;
  countryCode?: string;
  currencyCode?: string;
  timeZone?: string;
}

// ─── Offset pagination (legacy `/dsp/advertisers` only) ─────────────────────

export interface AmazonDspPageInfo {
  startIndex: number;
  /** The page size that was *requested* — not the number of rows returned. */
  count: number;
  /** Amazon's `totalResults`, or `undefined` when the response omitted it. */
  totalResults: number | undefined;
}

/**
 * Offset-pagination cursor for an Amazon DSP list page: the next `startIndex`,
 * or `null` on the last page.
 *
 * Advances by the rows actually returned. When Amazon reports `totalResults`
 * it decides; when it omits it, a full page means "there may be more" — an
 * absent total used to be read as 0, which silently ended pagination after
 * page 1 (fleet review amazon-dsp #13).
 */
export function nextAmazonDspStartIndex(
  pageInfo: AmazonDspPageInfo,
  returned: number
): number | null {
  if (returned === 0) return null;
  const next = pageInfo.startIndex + returned;
  const hasMore =
    pageInfo.totalResults !== undefined ? next < pageInfo.totalResults : returned >= pageInfo.count;
  return hasMore ? next : null;
}

// ─── Error Type ──────────────────────────────────────────────────────────────

export interface AmazonDspApiError {
  code?: string;
  message: string;
  details?: string;
  status?: number;
}

export function isAmazonDspApiError(value: unknown): value is AmazonDspApiError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AmazonDspApiError).message === "string"
  );
}
