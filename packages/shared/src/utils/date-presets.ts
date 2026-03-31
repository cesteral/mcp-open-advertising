// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Date preset resolver for MCP reporting tools.
 *
 * Converts human-friendly date range presets to YYYY-MM-DD start/end pairs.
 * Used by servers that don't natively support preset date ranges in their API
 * (e.g. TikTok, Snapchat, Pinterest, Amazon DSP, MS Ads, LinkedIn, CM360).
 *
 * Servers with native preset support (gads-mcp, sa360-mcp, meta-mcp) can pass
 * presets directly to their APIs and do not need this utility.
 */

export const DATE_PRESET_VALUES = [
  "TODAY",
  "YESTERDAY",
  "LAST_7_DAYS",
  "LAST_14_DAYS",
  "LAST_30_DAYS",
  "THIS_MONTH",
  "LAST_MONTH",
  "LAST_90_DAYS",
] as const;

export type DatePreset = (typeof DATE_PRESET_VALUES)[number];

export interface ResolvedDateRange {
  startDate: string;
  endDate: string;
}

/**
 * Resolve a date preset to a concrete YYYY-MM-DD start/end date range.
 * Dates are computed relative to today in the local timezone.
 *
 * @param preset - One of the DATE_PRESET_VALUES
 * @returns Object with startDate and endDate as YYYY-MM-DD strings
 */
export function resolveDatePreset(preset: DatePreset): ResolvedDateRange {
  const today = new Date();

  switch (preset) {
    case "TODAY": {
      const d = formatDate(today);
      return { startDate: d, endDate: d };
    }
    case "YESTERDAY": {
      const d = formatDate(addDays(today, -1));
      return { startDate: d, endDate: d };
    }
    case "LAST_7_DAYS": {
      return {
        startDate: formatDate(addDays(today, -7)),
        endDate: formatDate(addDays(today, -1)),
      };
    }
    case "LAST_14_DAYS": {
      return {
        startDate: formatDate(addDays(today, -14)),
        endDate: formatDate(addDays(today, -1)),
      };
    }
    case "LAST_30_DAYS": {
      return {
        startDate: formatDate(addDays(today, -30)),
        endDate: formatDate(addDays(today, -1)),
      };
    }
    case "THIS_MONTH": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return {
        startDate: formatDate(start),
        endDate: formatDate(today),
      };
    }
    case "LAST_MONTH": {
      const firstOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastOfLastMonth = addDays(firstOfThisMonth, -1);
      const firstOfLastMonth = new Date(lastOfLastMonth.getFullYear(), lastOfLastMonth.getMonth(), 1);
      return {
        startDate: formatDate(firstOfLastMonth),
        endDate: formatDate(lastOfLastMonth),
      };
    }
    case "LAST_90_DAYS": {
      return {
        startDate: formatDate(addDays(today, -90)),
        endDate: formatDate(addDays(today, -1)),
      };
    }
  }
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
