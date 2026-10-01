// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * What LinkedIn's `/rest/adAnalytics` accepts for `fields` and `pivot`.
 *
 * Source: LinkedIn's Ad Analytics docs, read 2026-10-01 (the page and its schema):
 * - https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/ads-reporting
 * - https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/ads-reporting-schema
 *
 * The docs say: metrics must be named in `fields`, otherwise only `impressions`
 * and `clicks` come back; at most 20 may be requested; `dateRange` and
 * `pivotValues` are themselves fields, and are what attribute a row to a date and
 * a pivot value; the endpoint does not support pagination and a response is
 * limited to 15,000 elements.
 */

import { McpError, JsonRpcErrorCode } from "@cesteral/shared";

/** LinkedIn: "Request up to 20 metrics." `dateRange` and `pivotValues` are counted. */
export const ANALYTICS_MAX_FIELDS = 20;

/** LinkedIn: "Response is limited to 15,000 elements." There is no next page. */
export const ANALYTICS_MAX_ELEMENTS = 15_000;

/** Fields that attribute a row to a date and to a pivot value. */
export const ANALYTICS_ATTRIBUTION_FIELDS = ["dateRange", "pivotValues"] as const;

/**
 * Metrics requested when the caller names none. Every one is a row in
 * LinkedIn's metrics table. `costInLocalCurrency` is here because an account's
 * currency is not necessarily USD.
 */
export const DEFAULT_ANALYTICS_METRICS = [
  "impressions",
  "clicks",
  "costInUsd",
  "costInLocalCurrency",
  "externalWebsiteConversions",
  "leadGenerationMailContactInfoShares",
  "oneClickLeads",
] as const;

/**
 * `pivot` values for the `q=analytics` finder at the pinned version (202608), from
 * the schema page's `pivot.value` enum. Notes:
 * - The geo pivots are the `_V2` ones. `MEMBER_COUNTRY` / `MEMBER_REGION` are not
 *   in the enum; `MEMBER_GEO_COUNTRY` never was.
 * - `MEMBER_DESIGNATED_MARKET_AREA` is "available starting with the 202609
 *   version" and needs a Nielsen DMA notice, so it is left out until the pin moves.
 * - `MEMBER_COUNTY` is not in the enum but has a documented sample request.
 * - `q=statistics` (up to three pivots) takes none of the `MEMBER_*` pivots, so
 *   it is not used here.
 */
export const LINKEDIN_ANALYTICS_PIVOTS = [
  "COMPANY",
  "ACCOUNT",
  "SHARE",
  "CAMPAIGN",
  "CREATIVE",
  "CAMPAIGN_GROUP",
  "CONVERSION",
  "CONVERSATION_NODE",
  "CONVERSATION_NODE_OPTION_INDEX",
  "SERVING_LOCATION",
  "CARD_INDEX",
  "MEMBER_COMPANY_SIZE",
  "MEMBER_INDUSTRY",
  "MEMBER_SENIORITY",
  "MEMBER_JOB_TITLE",
  "MEMBER_JOB_FUNCTION",
  "MEMBER_COUNTRY_V2",
  "MEMBER_REGION_V2",
  "MEMBER_COUNTY",
  "MEMBER_COMPANY",
  "PLACEMENT_NAME",
  "IMPRESSION_DEVICE_TYPE",
  "EVENT_STAGE",
] as const;

export type LinkedInAnalyticsPivot = (typeof LINKEDIN_ANALYTICS_PIVOTS)[number];

/**
 * Names that look like metrics but are not fields in LinkedIn's table, with what
 * to use instead. Refused here, with the answer, rather than sent to LinkedIn to
 * come back as a 400. Computable ones point at `includeComputedMetrics`.
 */
const NOT_A_FIELD: Record<string, string> = {
  conversions:
    "Use externalWebsiteConversions (website conversions) or oneClickLeads (leads); there is no plain `conversions` field.",
  reach: "Use approximateMemberReach (non-demographic pivots, date ranges of 92 days or less).",
  averageDailyReach:
    "There is no daily reach field; use approximateMemberReach (non-demographic pivots, date ranges of 92 days or less).",
  videoStarted: "Use videoStarts.",
  frequency: "LinkedIn has no frequency field; compute it client-side.",
  clickThroughRate: "LinkedIn has no CTR field; set includeComputedMetrics to compute it.",
  costPerConversion:
    "LinkedIn has no cost-per-conversion field; set includeComputedMetrics to compute it.",
};

/**
 * The `fields` list to send: the caller's metrics (or the defaults), then
 * `dateRange` and `pivotValues` unless already present, so every row says which
 * date and pivot value it belongs to. Throws, before any request, on a name
 * LinkedIn does not have or on more fields than LinkedIn allows.
 */
export function resolveAnalyticsFields(metrics: readonly string[] | undefined): string[] {
  const requested = metrics && metrics.length > 0 ? metrics : DEFAULT_ANALYTICS_METRICS;

  const fields: string[] = [];
  for (const name of requested) {
    const hint = NOT_A_FIELD[name];
    if (hint) {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `"${name}" is not a LinkedIn adAnalytics field. ${hint}`
      );
    }
    if (!fields.includes(name)) fields.push(name);
  }
  for (const name of ANALYTICS_ATTRIBUTION_FIELDS) {
    if (!fields.includes(name)) fields.push(name);
  }

  if (fields.length > ANALYTICS_MAX_FIELDS) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `LinkedIn allows at most ${ANALYTICS_MAX_FIELDS} fields per adAnalytics request, and ${ANALYTICS_ATTRIBUTION_FIELDS.join(" and ")} (added automatically so rows can be attributed) count toward it. This request has ${fields.length}: ask for ${ANALYTICS_MAX_FIELDS - ANALYTICS_ATTRIBUTION_FIELDS.length} metrics or fewer, or split it.`
    );
  }
  return fields;
}

/**
 * LinkedIn does not paginate adAnalytics and caps a response at 15,000 elements,
 * so a response that size has probably been cut off with no way to fetch the rest.
 */
export function analyticsTruncationWarning(elementCount: number): string | undefined {
  if (elementCount < ANALYTICS_MAX_ELEMENTS) return undefined;
  return `LinkedIn returned ${ANALYTICS_MAX_ELEMENTS.toLocaleString("en-US")} rows, its limit for adAnalytics, and does not paginate it, so the result is probably cut off. Narrow the date range, use a coarser timeGranularity or pivot, or request fewer pivot values.`;
}
