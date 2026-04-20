// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import type { ColumnAliases } from "./computed-metrics.js";
import { appendComputedMetricsToRows } from "./computed-metrics.js";
import { buildReportCsvUri, type ReportCsvStore } from "./report-csv-store.js";
import {
  arrayRowsToRecords,
  createReportView,
  getReportViewFetchLimit,
  type ReportViewInput,
  type ReportViewOutput,
} from "./report-view.js";
import type { SpillCsvOptions, SpillResult } from "./report-spill.js";

export const StoredReportBodyOutputSchema = z.object({
  rawCsvResourceUri: z
    .string()
    .optional()
    .describe("MCP resource URI of the persisted raw report body (only present when storeRawCsv is true)"),
  rawCsvByteLength: z
    .number()
    .optional()
    .describe("Stored report body size in bytes (after redaction and any truncation)"),
  spill: z
    .union([
      z.object({
        bucket: z.string(),
        objectName: z.string(),
        bytes: z.number(),
        rowCount: z.number().optional(),
        signedUrl: z.string(),
        expiresAt: z.string().datetime(),
        mimeType: z.string(),
      }),
      z.object({ error: z.string() }),
    ])
    .optional()
    .describe(
      "GCS spill result. Present only when REPORT_SPILL_BUCKET is set and thresholds are exceeded. " +
        "On success carries a signed URL to the full report body; on failure carries { error } and the " +
        "bounded-view path is still returned.",
    ),
});

export type StoredReportBodyOutput = z.infer<typeof StoredReportBodyOutputSchema>;

export type ServiceDownloadedReport = {
  headers: string[];
  rows: string[][];
  totalRows: number;
  rawCsv?: string;
  rawMimeType?: string;
};

export type ServiceDownloadedReportInput = ReportViewInput & {
  includeComputedMetrics?: boolean;
  storeRawCsv?: boolean;
};

export type ServiceDownloadedReportViewOutput = ReportViewOutput &
  StoredReportBodyOutput & {
    timestamp: string;
  };

export async function createServiceDownloadedReportView(params: {
  input: ServiceDownloadedReportInput;
  sessionId?: string;
  reportCsvStore: Pick<ReportCsvStore, "store">;
  spillCsvToGcs: (opts: SpillCsvOptions) => Promise<SpillResult>;
  spillServer: string;
  reportId: string;
  computedMetricAliases: ColumnAliases;
  defaultMimeType?: string;
  download: (options: {
    fetchLimit: number;
    includeRawCsv: boolean;
  }) => Promise<ServiceDownloadedReport>;
}): Promise<ServiceDownloadedReportViewOutput> {
  const spillEnabled = !!process.env.REPORT_SPILL_BUCKET;
  const includeRawCsv = params.input.storeRawCsv === true || spillEnabled;
  const result = await params.download({
    fetchLimit: getReportViewFetchLimit(params.input),
    includeRawCsv,
  });
  const mimeType = result.rawMimeType ?? params.defaultMimeType ?? "text/csv";

  const recordRows = arrayRowsToRecords(result.headers, result.rows) as Record<string, string>[];
  const augmented = params.input.includeComputedMetrics
    ? appendComputedMetricsToRows(recordRows, params.computedMetricAliases)
    : recordRows;
  const computedWarning = params.input.includeComputedMetrics
    ? augmented[0]?._computedMetricsWarnings
    : undefined;
  const augmentedHeaders = params.input.includeComputedMetrics
    ? [...result.headers, "cpa", "roas", "cpm", "ctr", "cpc"]
    : result.headers;

  const view = createReportView({
    headers: augmentedHeaders,
    rows: augmented,
    totalRows: result.totalRows,
    input: params.input,
    warnings: computedWarning
      ? [`computed metrics: ${computedWarning}`]
      : undefined,
  });

  const extras: StoredReportBodyOutput = {};
  if (params.input.storeRawCsv === true && result.rawCsv !== undefined) {
    const entry = params.reportCsvStore.store({
      csv: result.rawCsv,
      mimeType,
      sessionId: params.sessionId,
    });
    extras.rawCsvResourceUri = buildReportCsvUri(entry.resourceId);
    extras.rawCsvByteLength = entry.byteLength;
    if (entry.warnings.length > 0) {
      view.warnings = [...view.warnings, ...entry.warnings];
    }
  }

  if (result.rawCsv !== undefined) {
    const spill = await params.spillCsvToGcs({
      csv: result.rawCsv,
      mimeType,
      sessionId: params.sessionId,
      server: params.spillServer,
      reportId: params.reportId,
      rowCount: result.totalRows,
    });
    if ("spilled" in spill && spill.spilled) {
      extras.spill = {
        bucket: spill.bucket,
        objectName: spill.objectName,
        bytes: spill.bytes,
        rowCount: spill.rowCount,
        signedUrl: spill.signedUrl,
        expiresAt: spill.expiresAt,
        mimeType: spill.mimeType,
      };
    } else if ("error" in spill) {
      extras.spill = { error: spill.error };
      view.warnings = [...view.warnings, `spill failed: ${spill.error}`];
    }
  }

  return {
    ...view,
    timestamp: new Date().toISOString(),
    ...extras,
  };
}

export function extractReportIdFromUrl(downloadUrl: string): string {
  try {
    const u = new URL(downloadUrl);
    const segments = u.pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? "report";
  } catch {
    return "report";
  }
}
