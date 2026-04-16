import { describe, it, expect } from "vitest";
import {
  csvToJson,
  parseNumericValue,
  parseIntValue,
  parseDateValue,
  mapToBidManagerRow,
  parseCSVContent,
  aggregateToDeliveryMetrics,
  aggregateToHistoricalData,
  parseCSVToDeliveryMetrics,
  parseCSVToHistoricalData,
  calculatePerformanceMetrics,
} from "../../src/services/bid-manager/report-parser.js";

// =============================================================================
// csvToJson — Generic CSV parser
// =============================================================================

describe("csvToJson", () => {
  it("parses basic CSV with headers and rows", () => {
    const csv = "Name,Age\nAlice,30\nBob,25";
    const result = csvToJson(csv);

    expect(result).toEqual([
      { Name: "Alice", Age: "30" },
      { Name: "Bob", Age: "25" },
    ]);
  });

  it("handles quoted fields containing commas", () => {
    const csv = 'Name,Description\nAlice,"Hello, World"\nBob,"Good, Day"';
    const result = csvToJson(csv);

    expect(result).toEqual([
      { Name: "Alice", Description: "Hello, World" },
      { Name: "Bob", Description: "Good, Day" },
    ]);
  });

  it("handles escaped quotes (double-double quotes inside quoted fields)", () => {
    // The shared parseCSV helper is RFC 4180 compliant: it preserves inner
    // quotes produced by "" escapes and does not strip outer quotes, so a
    // field like "She said ""hi""" round-trips as She said "hi".
    const csv = 'Name,Value\nAlice,"She said ""hi"""\nBob,Simple';
    const result = csvToJson(csv);

    expect(result).toEqual([
      { Name: "Alice", Value: 'She said "hi"' },
      { Name: "Bob", Value: "Simple" },
    ]);
  });

  it("handles escaped quotes within quoted field (no trailing quote in content)", () => {
    // When the escaped content doesn't end with a quote, it works as expected
    const csv = 'Name,Value\nAlice,"She said ""hi"" today"\nBob,Simple';
    const result = csvToJson(csv);

    expect(result).toEqual([
      { Name: "Alice", Value: 'She said "hi" today' },
      { Name: "Bob", Value: "Simple" },
    ]);
  });

  it("skips rows with mismatched column count", () => {
    const csv = "A,B,C\n1,2,3\n4,5\n6,7,8";
    const result = csvToJson(csv);

    expect(result).toEqual([
      { A: "1", B: "2", C: "3" },
      // Row "4,5" has 2 values but 3 headers → skipped
      { A: "6", B: "7", C: "8" },
    ]);
  });

  it("skips rows with empty non-nullable fields", () => {
    const csv = "A,B\n1,2\n3,\n5,6";
    const result = csvToJson(csv);

    expect(result).toEqual([
      { A: "1", B: "2" },
      // Row "3," has empty B field, not in nullableFields → skipped
      { A: "5", B: "6" },
    ]);
  });

  it("allows empty values for nullable fields", () => {
    const csv = "A,B\n1,2\n3,\n5,6";
    const result = csvToJson(csv, ",", ["B"]);

    expect(result).toEqual([
      { A: "1", B: "2" },
      { A: "3", B: "" },
      { A: "5", B: "6" },
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(csvToJson("")).toEqual([]);
    expect(csvToJson("  \n  \n  ")).toEqual([]);
  });

  it("returns empty array for header-only CSV", () => {
    expect(csvToJson("A,B,C")).toEqual([]);
  });

  // Tab delimiter support was removed in Phase 2 when csvToJson switched to
  // the shared parseCSV helper. Bid Manager reports are always CSV, so this
  // isn't a capability the service actually needs.

  it("trims whitespace around values", () => {
    const csv = "A,B\n  hello  ,  world  ";
    const result = csvToJson(csv);

    expect(result).toEqual([{ A: "hello", B: "world" }]);
  });
});

// =============================================================================
// parseNumericValue
// =============================================================================

describe("parseNumericValue", () => {
  it("parses plain numbers", () => {
    expect(parseNumericValue("123.45")).toBe(123.45);
    expect(parseNumericValue("0")).toBe(0);
    expect(parseNumericValue("42")).toBe(42);
  });

  it("strips currency symbols", () => {
    expect(parseNumericValue("$123.45")).toBe(123.45);
    expect(parseNumericValue("$1,234.56")).toBe(1234.56);
  });

  it("strips commas", () => {
    expect(parseNumericValue("1,000")).toBe(1000);
    expect(parseNumericValue("1,234,567")).toBe(1234567);
  });

  it("handles percentage values (divides by 100)", () => {
    expect(parseNumericValue("50%")).toBe(0.5);
    expect(parseNumericValue("100%")).toBe(1);
    expect(parseNumericValue("2.5%")).toBe(0.025);
  });

  it("returns 0 for undefined", () => {
    expect(parseNumericValue(undefined)).toBe(0);
  });

  it("returns 0 for empty string", () => {
    expect(parseNumericValue("")).toBe(0);
  });

  it("returns 0 for dash", () => {
    expect(parseNumericValue("-")).toBe(0);
  });

  it("returns 0 for non-numeric string", () => {
    expect(parseNumericValue("abc")).toBe(0);
  });

  it("strips spaces and quotes", () => {
    expect(parseNumericValue(" 42 ")).toBe(42);
    expect(parseNumericValue("'100'")).toBe(100);
  });
});

// =============================================================================
// parseIntValue
// =============================================================================

describe("parseIntValue", () => {
  it("parses plain integers", () => {
    expect(parseIntValue("123")).toBe(123);
    expect(parseIntValue("0")).toBe(0);
  });

  it("strips commas", () => {
    expect(parseIntValue("1,000")).toBe(1000);
    expect(parseIntValue("1,234,567")).toBe(1234567);
  });

  it("truncates decimal values", () => {
    expect(parseIntValue("123.45")).toBe(123);
  });

  it("returns 0 for undefined", () => {
    expect(parseIntValue(undefined)).toBe(0);
  });

  it("returns 0 for empty string", () => {
    expect(parseIntValue("")).toBe(0);
  });

  it("returns 0 for dash", () => {
    expect(parseIntValue("-")).toBe(0);
  });

  it("returns 0 for non-numeric string", () => {
    expect(parseIntValue("abc")).toBe(0);
  });

  it("strips spaces and quotes", () => {
    expect(parseIntValue(" 42 ")).toBe(42);
    expect(parseIntValue("'100'")).toBe(100);
  });
});

// =============================================================================
// parseDateValue
// =============================================================================

describe("parseDateValue", () => {
  it("returns ISO dates (YYYY-MM-DD) as-is", () => {
    expect(parseDateValue("2025-01-15")).toBe("2025-01-15");
    expect(parseDateValue("2024-12-31")).toBe("2024-12-31");
  });

  it("converts MM/DD/YYYY to YYYY-MM-DD", () => {
    expect(parseDateValue("1/15/2025")).toBe("2025-01-15");
    expect(parseDateValue("12/31/2024")).toBe("2024-12-31");
    expect(parseDateValue("01/05/2025")).toBe("2025-01-05");
  });

  it("converts YYYYMMDD to YYYY-MM-DD", () => {
    expect(parseDateValue("20250115")).toBe("2025-01-15");
    expect(parseDateValue("20241231")).toBe("2024-12-31");
  });

  it("returns undefined for undefined", () => {
    expect(parseDateValue(undefined)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(parseDateValue("")).toBeUndefined();
  });

  it("returns undefined for dash", () => {
    expect(parseDateValue("-")).toBeUndefined();
  });

  it("returns unrecognized format as-is (trimmed)", () => {
    expect(parseDateValue("Jan 15, 2025")).toBe("Jan 15, 2025");
  });

  it("trims whitespace and surrounding quotes", () => {
    expect(parseDateValue("  2025-01-15  ")).toBe("2025-01-15");
    expect(parseDateValue('"2025-01-15"')).toBe("2025-01-15");
  });
});

// =============================================================================
// mapToBidManagerRow — field mapping
// =============================================================================

describe("mapToBidManagerRow", () => {
  it("maps standard Bid Manager column names", () => {
    const record = {
      Date: "2025-01-15",
      Campaign: "test-campaign",
      "Advertiser ID": "adv-123",
      "Insertion Order": "io-456",
      "Line Item": "li-789",
      Impressions: "100000",
      Clicks: "500",
      "Media Cost (Advertiser Currency)": "$250.00",
      "Total Conversions": "25",
      "Revenue (Advertiser Currency)": "$1000.00",
    };

    const row = mapToBidManagerRow(record);

    expect(row.date).toBe("2025-01-15");
    expect(row.campaign).toBe("test-campaign");
    expect(row.advertiserId).toBe("adv-123");
    expect(row.insertionOrder).toBe("io-456");
    expect(row.lineItem).toBe("li-789");
    expect(row.impressions).toBe(100000);
    expect(row.clicks).toBe(500);
    expect(row.spend).toBe(250);
    expect(row.conversions).toBe(25);
    expect(row.revenue).toBe(1000);
  });

  it("maps alternative column names (lowercase)", () => {
    const record = {
      date: "20250115",
      campaign: "test",
      impressions: "5000",
      clicks: "100",
      Spend: "$50.00",
      Conversions: "10",
      Revenue: "$200.00",
    };

    const row = mapToBidManagerRow(record);

    expect(row.date).toBe("2025-01-15");
    expect(row.campaign).toBe("test");
    expect(row.impressions).toBe(5000);
    expect(row.clicks).toBe(100);
    expect(row.spend).toBe(50);
    expect(row.conversions).toBe(10);
    expect(row.revenue).toBe(200);
  });

  it("maps alternative spend column (Total Media Cost)", () => {
    const record = {
      Impressions: "1000",
      Clicks: "10",
      "Total Media Cost (Advertiser Currency)": "$100.00",
      "Total Conversions": "5",
      "Total Revenue": "$300.00",
    };

    const row = mapToBidManagerRow(record);
    expect(row.spend).toBe(100);
    expect(row.revenue).toBe(300);
  });

  it("defaults numeric values to 0 for missing fields", () => {
    const record: Record<string, string> = {};
    const row = mapToBidManagerRow(record);

    expect(row.impressions).toBe(0);
    expect(row.clicks).toBe(0);
    expect(row.spend).toBe(0);
    expect(row.conversions).toBe(0);
    expect(row.revenue).toBe(0);
    expect(row.date).toBeUndefined();
    expect(row.campaign).toBeUndefined();
  });
});

// =============================================================================
// parseCSVContent
// =============================================================================

describe("parseCSVContent", () => {
  const CSV_HEADER =
    "Date,Campaign,Impressions,Clicks,Media Cost (Advertiser Currency),Total Conversions,Revenue (Advertiser Currency)";

  it("parses CSV into typed rows", () => {
    const csv = `${CSV_HEADER}\n2025-01-15,Campaign A,10000,50,$25.00,5,$100.00`;
    const rows = parseCSVContent(csv);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      date: "2025-01-15",
      campaign: "Campaign A",
      impressions: 10000,
      clicks: 50,
      spend: 25,
      conversions: 5,
      revenue: 100,
    });
  });

  it("skips zero rows by default", () => {
    const csv = `${CSV_HEADER}\n2025-01-15,A,10000,50,$25.00,5,$100.00\n2025-01-16,B,0,0,$0.00,0,$0.00`;
    const rows = parseCSVContent(csv);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.campaign).toBe("A");
  });

  it("includes zero rows when skipZeroRows is false", () => {
    const csv = `${CSV_HEADER}\n2025-01-15,A,10000,50,$25.00,5,$100.00\n2025-01-16,B,0,0,$0.00,0,$0.00`;
    const rows = parseCSVContent(csv, false);

    expect(rows).toHaveLength(2);
  });

  it("returns empty array for empty CSV", () => {
    expect(parseCSVContent("")).toEqual([]);
  });

  it("returns empty array for header-only CSV", () => {
    expect(parseCSVContent(CSV_HEADER)).toEqual([]);
  });

  it("parses multiple rows correctly", () => {
    const csv = [
      CSV_HEADER,
      "2025-01-15,A,10000,50,$25.00,5,$100.00",
      "2025-01-16,B,20000,100,$50.00,10,$200.00",
      "2025-01-17,C,30000,150,$75.00,15,$300.00",
    ].join("\n");

    const rows = parseCSVContent(csv);
    expect(rows).toHaveLength(3);
    expect(rows[2]?.impressions).toBe(30000);
  });
});

// =============================================================================
// aggregateToDeliveryMetrics
// =============================================================================

describe("aggregateToDeliveryMetrics", () => {
  it("sums all delivery fields across rows", () => {
    const rows = [
      { impressions: 1000, clicks: 10, spend: 5, conversions: 1, revenue: 20 },
      { impressions: 2000, clicks: 20, spend: 10, conversions: 2, revenue: 40 },
      { impressions: 3000, clicks: 30, spend: 15, conversions: 3, revenue: 60 },
    ];

    const result = aggregateToDeliveryMetrics(rows);

    expect(result).toEqual({
      impressions: 6000,
      clicks: 60,
      spend: 30,
      conversions: 6,
      revenue: 120,
    });
  });

  it("returns zeros for empty array", () => {
    expect(aggregateToDeliveryMetrics([])).toEqual({
      impressions: 0,
      clicks: 0,
      spend: 0,
      conversions: 0,
      revenue: 0,
    });
  });

  it("handles single row", () => {
    const rows = [
      { impressions: 5000, clicks: 50, spend: 25, conversions: 5, revenue: 100 },
    ];

    const result = aggregateToDeliveryMetrics(rows);

    expect(result).toEqual({
      impressions: 5000,
      clicks: 50,
      spend: 25,
      conversions: 5,
      revenue: 100,
    });
  });
});

// =============================================================================
// aggregateToHistoricalData
// =============================================================================

describe("aggregateToHistoricalData", () => {
  it("groups rows by date and aggregates", () => {
    const rows = [
      { date: "2025-01-15", impressions: 1000, clicks: 10, spend: 5, conversions: 1, revenue: 20 },
      { date: "2025-01-15", impressions: 2000, clicks: 20, spend: 10, conversions: 2, revenue: 40 },
      { date: "2025-01-16", impressions: 3000, clicks: 30, spend: 15, conversions: 3, revenue: 60 },
    ];

    const result = aggregateToHistoricalData(rows);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      date: "2025-01-15",
      metrics: { impressions: 3000, clicks: 30, spend: 15, conversions: 3, revenue: 60 },
    });
    expect(result[1]).toEqual({
      date: "2025-01-16",
      metrics: { impressions: 3000, clicks: 30, spend: 15, conversions: 3, revenue: 60 },
    });
  });

  it("sorts results by date ascending", () => {
    const rows = [
      { date: "2025-01-17", impressions: 100, clicks: 1, spend: 1, conversions: 0, revenue: 0 },
      { date: "2025-01-15", impressions: 100, clicks: 1, spend: 1, conversions: 0, revenue: 0 },
      { date: "2025-01-16", impressions: 100, clicks: 1, spend: 1, conversions: 0, revenue: 0 },
    ];

    const result = aggregateToHistoricalData(rows);

    expect(result.map((r) => r.date)).toEqual(["2025-01-15", "2025-01-16", "2025-01-17"]);
  });

  it("skips rows without dates", () => {
    const rows = [
      { date: "2025-01-15", impressions: 1000, clicks: 10, spend: 5, conversions: 1, revenue: 20 },
      { impressions: 2000, clicks: 20, spend: 10, conversions: 2, revenue: 40 },
    ];

    const result = aggregateToHistoricalData(rows);

    expect(result).toHaveLength(1);
    expect(result[0]?.date).toBe("2025-01-15");
  });

  it("returns empty array for empty input", () => {
    expect(aggregateToHistoricalData([])).toEqual([]);
  });
});

// =============================================================================
// calculatePerformanceMetrics
// =============================================================================

describe("calculatePerformanceMetrics", () => {
  it("calculates all performance metrics from delivery data", () => {
    const delivery = {
      impressions: 100_000,
      clicks: 500,
      spend: 250,
      conversions: 25,
      revenue: 1000,
    };

    const result = calculatePerformanceMetrics(delivery);

    expect(result.impressions).toBe(100_000);
    expect(result.clicks).toBe(500);
    expect(result.spend).toBe(250);
    expect(result.conversions).toBe(25);
    expect(result.revenue).toBe(1000);
    expect(result.cpm).toBe(2.5);
    expect(result.ctr).toBe(0.5);
    expect(result.cpc).toBe(0.5);
    expect(result.cpa).toBe(10);
    expect(result.roas).toBe(4);
  });
});

// =============================================================================
// Convenience functions (end-to-end)
// =============================================================================

describe("parseCSVToDeliveryMetrics", () => {
  it("parses CSV and returns aggregated delivery metrics", () => {
    const csv = [
      "Date,Campaign,Impressions,Clicks,Media Cost (Advertiser Currency),Total Conversions,Revenue (Advertiser Currency)",
      "2025-01-15,A,10000,50,$25.00,5,$100.00",
      "2025-01-16,A,20000,100,$50.00,10,$200.00",
    ].join("\n");

    const result = parseCSVToDeliveryMetrics(csv);

    expect(result).toEqual({
      impressions: 30000,
      clicks: 150,
      spend: 75,
      conversions: 15,
      revenue: 300,
    });
  });

  it("returns zeros for empty CSV", () => {
    const result = parseCSVToDeliveryMetrics("");

    expect(result).toEqual({
      impressions: 0,
      clicks: 0,
      spend: 0,
      conversions: 0,
      revenue: 0,
    });
  });
});

describe("parseCSVToHistoricalData", () => {
  it("parses CSV and returns historical data points", () => {
    const csv = [
      "Date,Campaign,Impressions,Clicks,Media Cost (Advertiser Currency),Total Conversions,Revenue (Advertiser Currency)",
      "2025-01-15,A,10000,50,$25.00,5,$100.00",
      "2025-01-15,B,5000,25,$12.50,2,$50.00",
      "2025-01-16,A,20000,100,$50.00,10,$200.00",
    ].join("\n");

    const result = parseCSVToHistoricalData(csv);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      date: "2025-01-15",
      metrics: { impressions: 15000, clicks: 75, spend: 37.5, conversions: 7, revenue: 150 },
    });
    expect(result[1]).toEqual({
      date: "2025-01-16",
      metrics: { impressions: 20000, clicks: 100, spend: 50, conversions: 10, revenue: 200 },
    });
  });
});
