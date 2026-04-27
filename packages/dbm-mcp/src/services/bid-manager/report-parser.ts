// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * CSV Report Parser for Bid Manager API reports
 *
 * Generic CSV parsing with Bid Manager specific field mappings.
 */

import type { DeliveryMetrics, HistoricalDataPoint, PerformanceMetrics } from "./types.js";
import { calculateAllMetrics } from "../../utils/metrics.js";
import { parseCSV as sharedParseCSV } from "@cesteral/shared";

// =============================================================================
// Types
// =============================================================================

/**
 * Parsed row with Bid Manager specific fields
 */
export interface ParsedRow {
  date?: string;
  campaign?: string;
  advertiserId?: string;
  insertionOrder?: string;
  lineItem?: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  revenue: number;
  [key: string]: string | number | undefined;
}

// =============================================================================
// Generic CSV Parser
// =============================================================================

/**
 * Generic CSV to JSON parser for Bid Manager reports.
 *
 * Delegates CSV tokenization to the shared `parseCSV` helper (quote/CRLF/BOM
 * handling), then applies the DBM-specific "drop any row where a non-nullable
 * field is empty" filter that discards Bid Manager's summary/footer rows.
 *
 * Note: the `delimiter` parameter is retained for API compatibility but is
 * ignored — Bid Manager reports are always comma-delimited, and the shared
 * parser is comma-only.
 */
export function csvToJson(
  csv: string,
  _delimiter: string = ",",
  nullableFields: string[] = []
): Record<string, string>[] {
  const { headers, rows } = sharedParseCSV(csv);
  if (headers.length === 0) return [];

  const nullable = new Set(nullableFields);
  return rows
    .map((record) => {
      const cleaned: Record<string, string> = {};
      let allFieldsHaveValues = true;
      for (const header of headers) {
        const value = (record[header] ?? "").trim();
        if (value === "" && !nullable.has(header)) {
          allFieldsHaveValues = false;
        } else {
          cleaned[header] = value;
        }
      }
      return allFieldsHaveValues ? cleaned : null;
    })
    .filter((row): row is Record<string, string> => row !== null);
}

// =============================================================================
// Value Parsers
// =============================================================================

/**
 * Parse a numeric value from CSV, handling currency symbols and commas
 */
export function parseNumericValue(value: string | undefined): number {
  if (!value || value === "" || value === "-") return 0;

  const cleaned = value.replace(/[$,\s'"]/g, "");
  if (cleaned.endsWith("%")) {
    return parseFloat(cleaned.slice(0, -1)) / 100;
  }

  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Parse integer value from CSV
 */
export function parseIntValue(value: string | undefined): number {
  if (!value || value === "" || value === "-") return 0;

  const cleaned = value.replace(/[,\s'"]/g, "");
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? 0 : num;
}

/**
 * Parse date from various formats into YYYY-MM-DD
 */
export function parseDateValue(value: string | undefined): string | undefined {
  if (!value || value === "" || value === "-") return undefined;

  const cleaned = value.trim().replace(/^"|"$/g, "");

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;

  // MM/DD/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleaned)) {
    const [month, day, year] = cleaned.split("/");
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  // YYYYMMDD
  if (/^\d{8}$/.test(cleaned)) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`;
  }

  return cleaned;
}

// =============================================================================
// Bid Manager Field Mapping
// =============================================================================

/** Column name variations for Bid Manager reports */
const COLUMN_MAPPINGS = {
  date: ["Date", "date", "Day"],
  campaign: ["Campaign", "Campaign ID", "campaign"],
  advertiserId: ["Advertiser", "Advertiser ID", "advertiserId"],
  insertionOrder: ["Insertion Order", "IO", "insertionOrder"],
  lineItem: ["Line Item", "Line Item ID", "lineItem"],
  impressions: ["Impressions", "impressions"],
  clicks: ["Clicks", "clicks"],
  spend: [
    "Media Cost (Advertiser Currency)",
    "Total Media Cost (Advertiser Currency)",
    "Spend",
    "Media Cost",
  ],
  conversions: ["Total Conversions", "Conversions", "Post-Click Conversions"],
  revenue: ["Revenue (Advertiser Currency)", "Revenue", "Total Revenue"],
};

/**
 * Get value from record using column name variations
 */
function getField(record: Record<string, string>, variations: string[]): string | undefined {
  for (const name of variations) {
    if (record[name] !== undefined) return record[name];
  }
  return undefined;
}

/**
 * Map generic record to typed Bid Manager row
 */
export function mapToBidManagerRow(record: Record<string, string>): ParsedRow {
  return {
    date: parseDateValue(getField(record, COLUMN_MAPPINGS.date)),
    campaign: getField(record, COLUMN_MAPPINGS.campaign),
    advertiserId: getField(record, COLUMN_MAPPINGS.advertiserId),
    insertionOrder: getField(record, COLUMN_MAPPINGS.insertionOrder),
    lineItem: getField(record, COLUMN_MAPPINGS.lineItem),
    impressions: parseIntValue(getField(record, COLUMN_MAPPINGS.impressions)),
    clicks: parseIntValue(getField(record, COLUMN_MAPPINGS.clicks)),
    spend: parseNumericValue(getField(record, COLUMN_MAPPINGS.spend)),
    conversions: parseIntValue(getField(record, COLUMN_MAPPINGS.conversions)),
    revenue: parseNumericValue(getField(record, COLUMN_MAPPINGS.revenue)),
  };
}

/**
 * Parse CSV and return typed Bid Manager rows
 */
export function parseCSVContent(csv: string, skipZeroRows: boolean = true): ParsedRow[] {
  const records = csvToJson(csv);
  const rows = records.map(mapToBidManagerRow);

  if (skipZeroRows) {
    return rows.filter((row) => row.impressions > 0 || row.clicks > 0 || row.spend > 0);
  }

  return rows;
}

// =============================================================================
// Aggregation Functions
// =============================================================================

/**
 * Aggregate parsed rows into delivery metrics
 */
export function aggregateToDeliveryMetrics(rows: ParsedRow[]): DeliveryMetrics {
  return rows.reduce(
    (acc, row) => ({
      impressions: acc.impressions + row.impressions,
      clicks: acc.clicks + row.clicks,
      spend: acc.spend + row.spend,
      conversions: acc.conversions + row.conversions,
      revenue: acc.revenue + row.revenue,
    }),
    { impressions: 0, clicks: 0, spend: 0, conversions: 0, revenue: 0 }
  );
}

/**
 * Group rows by date and aggregate into historical data points
 */
export function aggregateToHistoricalData(rows: ParsedRow[]): HistoricalDataPoint[] {
  const byDate = new Map<string, ParsedRow[]>();

  for (const row of rows) {
    if (!row.date) continue;
    const existing = byDate.get(row.date) || [];
    existing.push(row);
    byDate.set(row.date, existing);
  }

  const result: HistoricalDataPoint[] = [];
  for (const [date, dateRows] of byDate) {
    result.push({
      date,
      metrics: aggregateToDeliveryMetrics(dateRows),
    });
  }

  return result.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Calculate performance metrics from delivery metrics
 */
export function calculatePerformanceMetrics(delivery: DeliveryMetrics): PerformanceMetrics {
  return calculateAllMetrics(delivery);
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Parse CSV and return delivery metrics
 */
export function parseCSVToDeliveryMetrics(csv: string): DeliveryMetrics {
  const rows = parseCSVContent(csv);
  return aggregateToDeliveryMetrics(rows);
}

/**
 * Parse CSV and return historical data points
 */
export function parseCSVToHistoricalData(csv: string): HistoricalDataPoint[] {
  const rows = parseCSVContent(csv);
  return aggregateToHistoricalData(rows);
}
