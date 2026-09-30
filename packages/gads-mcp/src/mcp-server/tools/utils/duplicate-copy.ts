// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Builds the `campaigns:mutate` create body for `gads_duplicate_entity`.
 *
 * Field names, types and enums below come from the googleads v25 Discovery
 * document (revision 20260929), `GoogleAdsGoogleadsV25Resources__Campaign` and
 * the `Common__*` bidding-scheme schemas it references. Execute and the
 * `validateOnly` dry run both send the body built here.
 */

import { McpError, JsonRpcErrorCode } from "@cesteral/shared";
import { unwrapResource } from "./capture-snapshot.js";

/**
 * The status every duplicate is created with. `Resources__Campaign.status`:
 * "When a new campaign is added, the status defaults to ENABLED", so a copy of
 * a live campaign would spend at once unless PAUSED is sent explicitly.
 * dv360, msads and pinterest land copies in a non-running state too.
 */
export const GADS_DUPLICATE_COPY_STATUS = "PAUSED";

/**
 * Standard (non-portfolio) bidding schemes: `biddingStrategyType` value →
 * the `Resources__Campaign` field that carries that scheme on create, plus
 * the scheme's scalar parameters to read. `biddingStrategyType` itself is
 * "Output only… A bidding strategy can be created by setting either the
 * bidding scheme to create a standard bidding strategy or the
 * `bidding_strategy` field to create a portfolio bidding strategy."
 *
 * Parameters are the scalar properties of each `Common__<Scheme>` schema.
 * An empty list means the scheme has no parameters (`Common__ManualCpm`,
 * `ManualCpv`, `TargetCpv`, `ManualCpa` have no properties) and is sent as `{}`.
 */
const STANDARD_SCHEMES: Record<string, { field: string; params: readonly string[] }> = {
  MANUAL_CPC: { field: "manualCpc", params: ["enhancedCpcEnabled"] },
  MANUAL_CPM: { field: "manualCpm", params: [] },
  MANUAL_CPV: { field: "manualCpv", params: [] },
  MANUAL_CPA: { field: "manualCpa", params: [] },
  TARGET_CPV: { field: "targetCpv", params: [] },
  MAXIMIZE_CONVERSIONS: {
    field: "maximizeConversions",
    params: ["targetCpaMicros", "cpcBidCeilingMicros", "cpcBidFloorMicros"],
  },
  MAXIMIZE_CONVERSION_VALUE: {
    field: "maximizeConversionValue",
    params: [
      "targetRoas",
      "targetRoasTolerancePercentMillis",
      "cpcBidCeilingMicros",
      "cpcBidFloorMicros",
    ],
  },
  TARGET_CPA: {
    field: "targetCpa",
    params: ["targetCpaMicros", "cpcBidCeilingMicros", "cpcBidFloorMicros"],
  },
  TARGET_ROAS: {
    field: "targetRoas",
    params: [
      "targetRoas",
      "targetRoasTolerancePercentMillis",
      "cpcBidCeilingMicros",
      "cpcBidFloorMicros",
    ],
  },
  TARGET_SPEND: { field: "targetSpend", params: ["targetSpendMicros", "cpcBidCeilingMicros"] },
  TARGET_IMPRESSION_SHARE: {
    field: "targetImpressionShare",
    params: ["location", "locationFractionMicros", "cpcBidCeilingMicros"],
  },
  PERCENT_CPC: { field: "percentCpc", params: ["cpcBidCeilingMicros", "enhancedCpcEnabled"] },
  COMMISSION: { field: "commission", params: ["commissionRateMicros"] },
  TARGET_CPC: { field: "targetCpc", params: ["targetCpcMicros"] },
};

/**
 * Every `Resources__Campaign` field that holds a bidding scheme, including the
 * two this module refuses to copy (`targetCpm`, `fixedCpm`: their frequency
 * goals are nested messages this read does not select, so a copy would
 * silently drop them). All are stripped from the copied source before the
 * one chosen scheme is set.
 */
const ALL_SCHEME_FIELDS: readonly string[] = [
  ...Object.values(STANDARD_SCHEMES).map((s) => s.field),
  "targetCpm",
  "fixedCpm",
];

const toSnake = (camel: string): string => camel.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/**
 * GAQL fields the duplicate read adds to the campaign's default SELECT.
 * basis: unverified — field names are the snake_case of the Discovery
 * properties above; that each is GAQL-selectable could not be checked
 * (developers.google.com's field reference is unreachable from here).
 * `campaign.bidding_strategy_type` / `campaign.bidding_strategy` are also
 * selected by the sa360 v0 catalog and Google's client examples.
 */
export const CAMPAIGN_BIDDING_SELECT_FIELDS: readonly string[] = [
  "campaign.bidding_strategy_type",
  "campaign.bidding_strategy",
  ...Object.values(STANDARD_SCHEMES).flatMap((s) =>
    s.params.map((p) => `campaign.${toSnake(s.field)}.${toSnake(p)}`)
  ),
];

/** Date part ("yyyy-MM-dd") of `now` in the given UTC offset (hours). */
function dateAtOffset(now: Date, offsetHours: number): string {
  return new Date(now.getTime() + offsetHours * 3_600_000).toISOString().slice(0, 10);
}

export interface DuplicateCopy {
  payload: Record<string, unknown>;
  /** The `status` asked for in `options` that was ignored (not PAUSED). */
  ignoredStatus?: unknown;
  /** Human-readable changes made to the source's values in the copy. */
  adjustments: string[];
}

function refuse(message: string): never {
  throw new McpError(JsonRpcErrorCode.InvalidParams, message);
}

/** Choose the bidding fields for the copy: a portfolio strategy or one standard scheme. */
function copyBidding(source: Record<string, unknown>): Record<string, unknown> {
  const portfolio = source.biddingStrategy;
  if (typeof portfolio === "string" && portfolio.length > 0) {
    return { biddingStrategy: portfolio };
  }
  const type = source.biddingStrategyType;
  if (typeof type !== "string" || type.length === 0) {
    refuse(
      "The source campaign's bidding strategy could not be read (no biddingStrategyType), so a faithful copy cannot be built. Create the copy with gads_create_entity and set its bidding scheme explicitly."
    );
  }
  const scheme = STANDARD_SCHEMES[type];
  if (!scheme) {
    refuse(
      `The source campaign uses bidding strategy type ${type}, which gads_duplicate_entity cannot copy faithfully. Create the copy with gads_create_entity and set its bidding scheme explicitly.`
    );
  }
  const read = source[scheme.field];
  const params: Record<string, unknown> = {};
  if (read && typeof read === "object") {
    for (const key of scheme.params) {
      const value = (read as Record<string, unknown>)[key];
      if (value !== undefined && value !== null) params[key] = value;
    }
  }
  return { [scheme.field]: params };
}

/**
 * The copy's start/end, given that `startDateTime` and `endDateTime` are
 * "yyyy-MM-dd HH:mm:ss" in the customer's time zone, which this read does
 * not know. Discovery's `CampaignError` / `DateRangeError`
 * `CANNOT_SET_DATE_TO_PAST` ("Trying to modify a date into the past") is the
 * rejection a past date meets; whether it also fires on create is not stated,
 * so this is conservative. Dates are compared against the latest calendar
 * date anywhere (UTC+14):
 *
 * - a start on or before that date may already have passed for the customer,
 *   so it is omitted and Google applies its own default;
 * - an end before that date may have passed, and dropping it would make the
 *   copy run indefinitely ("On create, defaults to running indefinitely"), so
 *   the duplicate is refused unless `options` sets `endDateTime` (a new end,
 *   or `null` to run indefinitely).
 *
 * Values the caller sets in `options` are the caller's and are not adjusted.
 */
function copyDates(
  source: Record<string, unknown>,
  options: Record<string, unknown>,
  now: Date
): { dates: Record<string, unknown>; adjustments: string[] } {
  const latestToday = dateAtOffset(now, 14);
  const dates: Record<string, unknown> = {};
  const adjustments: string[] = [];

  const start = source.startDateTime;
  if (typeof start === "string" && start.length > 0 && !("startDateTime" in options)) {
    if (start.slice(0, 10) <= latestToday) {
      adjustments.push(
        `startDateTime omitted: the source's ${start} may already have passed in the customer's time zone, and Google does not accept dates set in the past. Google applies its default start; set options.startDateTime to choose one.`
      );
    } else {
      dates.startDateTime = start;
    }
  }

  const end = source.endDateTime;
  if (typeof end === "string" && end.length > 0 && !("endDateTime" in options)) {
    if (end.slice(0, 10) < latestToday) {
      refuse(
        `The source campaign's endDateTime ${end} may already have passed, and Google does not accept dates set in the past. Pass options.endDateTime with a future "yyyy-MM-dd HH:mm:ss" date, or options.endDateTime = null to let the copy run indefinitely.`
      );
    }
    dates.endDateTime = end;
  }

  return { dates, adjustments };
}

/**
 * Project the GAQL-read source row into the copy's create body: the source
 * minus server-assigned and output-only fields, its bidding copied, its
 * dates made creatable, `options` applied (a `null` option removes the
 * field), and `status` forced to {@link GADS_DUPLICATE_COPY_STATUS}.
 */
export function buildGAdsDuplicateCopy(
  entityType: string,
  row: Record<string, unknown>,
  options: Record<string, unknown> = {},
  now: Date = new Date()
): DuplicateCopy {
  const source = unwrapResource(entityType, row) ?? {};
  const payload: Record<string, unknown> = {};
  const skip = new Set([
    // Server-assigned; the mutate-create endpoint rejects them.
    "id",
    "resourceName",
    // Always forced below.
    "status",
    // Output only.
    "biddingStrategyType",
    // Re-derived by copyBidding / copyDates.
    "biddingStrategy",
    "startDateTime",
    "endDateTime",
    ...ALL_SCHEME_FIELDS,
  ]);
  for (const [key, val] of Object.entries(source)) {
    if (!skip.has(key)) payload[key] = val;
  }
  if (Object.keys(payload).length === 0) return { payload, adjustments: [] };

  // A bidding scheme or portfolio strategy in `options` replaces the source's
  // outright; copying the source's too would send two schemes.
  const callerSetsBidding = ["biddingStrategy", ...ALL_SCHEME_FIELDS].some((k) => k in options);
  if (!callerSetsBidding) Object.assign(payload, copyBidding(source));
  const { dates, adjustments } = copyDates(source, options, now);
  Object.assign(payload, dates);

  for (const [key, val] of Object.entries(options)) {
    if (key === "status") continue;
    if (val === null) delete payload[key];
    else payload[key] = val;
  }
  payload.status = GADS_DUPLICATE_COPY_STATUS;

  const requested = options.status;
  return requested !== undefined && requested !== GADS_DUPLICATE_COPY_STATUS
    ? { payload, ignoredStatus: requested, adjustments }
    : { payload, adjustments };
}
