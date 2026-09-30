// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Values of the stats `report_dimension` query parameter ("Insight-level
 * breakdown"), from Snap's Measurement docs
 * (https://developers.snap.com/api/marketing-api/Ads-API/measurement), read
 * 2026-09-30:
 *
 *   Geo          country | region | dma | country,os
 *   Demographic  gender | age | age,gender
 *   Device       os | os,country | make
 *   Interest     lifestyle_category
 *
 * Snap: "You can only query one dimension at a time unless you are querying
 * age & gender which may be combined" (country+os is listed as its own value).
 * The parameter replaced `dimension` / `pivots`, deprecated 2020-03-20 and
 * sunset 2020-06-20.
 */
export const REPORT_DIMENSIONS = [
  "country",
  "region",
  "dma",
  "country,os",
  "gender",
  "age",
  "age,gender",
  "os",
  "os,country",
  "make",
  "lifestyle_category",
] as const;

export type ReportDimension = (typeof REPORT_DIMENSIONS)[number];

/**
 * Dimensions that only support delivery metrics: "conversion metrics are not
 * available for the dimensions lifestyle_category, region, dma or make".
 */
export const DELIVERY_ONLY_REPORT_DIMENSIONS: readonly ReportDimension[] = [
  "region",
  "dma",
  "make",
  "lifestyle_category",
];
