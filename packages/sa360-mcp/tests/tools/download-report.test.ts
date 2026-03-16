import { describe, it, expect } from "vitest";
import { DownloadReportInputSchema } from "../../src/mcp-server/tools/definitions/download-report.tool.js";
import { parseCSVLine } from "../../src/mcp-server/tools/definitions/download-report.tool.js";

describe("DownloadReportInputSchema", () => {
  it("accepts valid input with defaults", () => {
    const result = DownloadReportInputSchema.safeParse({
      downloadUrl: "https://www.googleapis.com/doubleclicksearch/v2/reports/123/files/0",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxRows).toBe(1000);
    }
  });

  it("requires downloadUrl", () => {
    const result = DownloadReportInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects empty downloadUrl", () => {
    const result = DownloadReportInputSchema.safeParse({ downloadUrl: "" });
    expect(result.success).toBe(false);
  });

  it("accepts custom maxRows", () => {
    const result = DownloadReportInputSchema.safeParse({
      downloadUrl: "https://example.com/file",
      maxRows: 500,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxRows).toBe(500);
    }
  });

  it("rejects maxRows over 10000", () => {
    const result = DownloadReportInputSchema.safeParse({
      downloadUrl: "https://example.com/file",
      maxRows: 10001,
    });
    expect(result.success).toBe(false);
  });

  it("rejects maxRows less than 1", () => {
    const result = DownloadReportInputSchema.safeParse({
      downloadUrl: "https://example.com/file",
      maxRows: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("parseCSVLine", () => {
  it("parses simple comma-separated values", () => {
    expect(parseCSVLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("handles quoted fields with commas", () => {
    expect(parseCSVLine('"hello, world",b,c')).toEqual(["hello, world", "b", "c"]);
  });

  it("handles escaped quotes within quoted fields", () => {
    expect(parseCSVLine('"say ""hello""",b')).toEqual(['say "hello"', "b"]);
  });

  it("handles empty fields", () => {
    expect(parseCSVLine("a,,c")).toEqual(["a", "", "c"]);
  });

  it("handles single field", () => {
    expect(parseCSVLine("hello")).toEqual(["hello"]);
  });

  it("trims whitespace around fields", () => {
    expect(parseCSVLine(" a , b , c ")).toEqual(["a", "b", "c"]);
  });

  it("handles empty string", () => {
    expect(parseCSVLine("")).toEqual([""]);
  });

  it("handles all quoted fields", () => {
    expect(parseCSVLine('"Campaign A","100","200"')).toEqual(["Campaign A", "100", "200"]);
  });
});
