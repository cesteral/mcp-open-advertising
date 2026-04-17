// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { reportCsvStore } from "../../../services/session-services.js";
import {
  appendComputedMetricsToRows,
  buildReportCsvUri,
  ComputedMetricsFlagSchema,
  createReportView,
  formatReportViewResponse,
  getReportViewFetchLimit,
  ReportViewInputSchema,
  ReportViewOutputSchema,
  spillCsvToGcs,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "msads_download_report";
const TOOL_TITLE = "Download Microsoft Ads Report";
const TOOL_DESCRIPTION = `Download and parse a completed Microsoft Advertising report from its download URL.

Use after msads_check_report_status returns a downloadUrl. Returns a bounded summary or paged row slice.`;

export const DownloadReportInputSchema = z
  .object({
    downloadUrl: z
      .string()
      .url()
      .describe("Report download URL from check-report-status"),
    storeRawCsv: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Persist the full CSV body in the in-process report-csv store and return " +
        "a `report-csv://{id}` resource URI. Entries expire after 30 minutes."
      ),
  })
  .merge(ReportViewInputSchema)
  .merge(ComputedMetricsFlagSchema)
  .describe("Parameters for downloading a Microsoft Ads report");

export const DownloadReportOutputSchema = z
  .object({
    ...ReportViewOutputSchema.shape,
    timestamp: z.string().datetime(),
    rawCsvResourceUri: z
      .string()
      .optional()
      .describe("MCP resource URI of the persisted raw CSV (only present when storeRawCsv is true)"),
    rawCsvByteLength: z
      .number()
      .optional()
      .describe("Stored CSV size in bytes (after redaction and any truncation)"),
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
          "On success carries a signed URL to the full CSV; on failure carries { error } and the " +
          "bounded-view path is still returned.",
      ),
  })
  .describe("Downloaded report data");

type DownloadReportInput = z.infer<typeof DownloadReportInputSchema>;
type DownloadReportOutput = z.infer<typeof DownloadReportOutputSchema>;

const MSADS_COMPUTED_METRIC_ALIASES = {
  cost: ["Spend", "spend", "Cost", "cost"],
  impressions: ["Impressions", "impressions"],
  clicks: ["Clicks", "clicks"],
  conversions: ["Conversions", "conversions", "AllConversions"],
  conversionValue: ["Revenue", "revenue", "AllRevenue"],
};

/**
 * Derive a stable filename hint from a Microsoft Ads report download URL. The
 * last non-empty path segment is a reasonable key; malformed URLs fall back
 * to the literal string "report".
 */
function extractMsAdsReportId(downloadUrl: string): string {
  try {
    const u = new URL(downloadUrl);
    const segments = u.pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? "report";
  } catch {
    return "report";
  }
}

export async function downloadReportLogic(
  input: DownloadReportInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<DownloadReportOutput> {
  const { msadsReportingService } = resolveSessionServices(sdkContext);

  // Always ask the service for raw CSV — storeRawCsv controls the in-memory
  // MCP resource store, while REPORT_SPILL_BUCKET controls the GCS spill.
  // Both paths need the raw body, and holding the string for the duration
  // of this handler is free (parseCSV materializes it anyway).
  const spillEnabled = !!process.env.REPORT_SPILL_BUCKET;
  const needRawCsv = input.storeRawCsv === true || spillEnabled;
  const result = await msadsReportingService.downloadReport(
    input.downloadUrl,
    getReportViewFetchLimit(input),
    context,
    { includeRawCsv: needRawCsv }
  );

  const recordRows: Record<string, string>[] = result.rows.map((row) => {
    const record: Record<string, string> = {};
    for (let i = 0; i < result.headers.length; i++) {
      record[result.headers[i] ?? String(i)] = row[i] ?? "";
    }
    return record;
  });
  const augmented = input.includeComputedMetrics
    ? appendComputedMetricsToRows(recordRows, MSADS_COMPUTED_METRIC_ALIASES)
    : recordRows;
  const computedWarning = input.includeComputedMetrics
    ? augmented[0]?._computedMetricsWarnings
    : undefined;
  const augmentedHeaders = input.includeComputedMetrics
    ? [...result.headers, "cpa", "roas", "cpm", "ctr", "cpc"]
    : result.headers;

  const view = createReportView({
    headers: augmentedHeaders,
    rows: augmented,
    totalRows: result.totalRows,
    input,
    warnings: computedWarning
      ? [`computed metrics: ${computedWarning}`]
      : undefined,
  });

  const extras: {
    rawCsvResourceUri?: string;
    rawCsvByteLength?: number;
    spill?: DownloadReportOutput["spill"];
  } = {};
  if (input.storeRawCsv === true && result.rawCsv !== undefined) {
    const entry = reportCsvStore.store({
      csv: result.rawCsv,
      mimeType: "text/csv",
      sessionId: sdkContext?.sessionId,
    });
    extras.rawCsvResourceUri = buildReportCsvUri(entry.resourceId);
    extras.rawCsvByteLength = entry.byteLength;
    if (entry.warnings.length > 0) {
      view.warnings = [...view.warnings, ...entry.warnings];
    }
  }

  // Attempt GCS spill. The helper is a no-op when REPORT_SPILL_BUCKET is
  // unset or the payload is under thresholds; any failure is captured as
  // { error } and surfaces as a bounded-view warning rather than breaking
  // the response.
  if (result.rawCsv !== undefined) {
    const spill = await spillCsvToGcs({
      csv: result.rawCsv,
      mimeType: "text/csv",
      sessionId: sdkContext?.sessionId,
      server: "microsoft",
      reportId: extractMsAdsReportId(input.downloadUrl),
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

export function downloadReportResponseFormatter(result: DownloadReportOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: formatReportViewResponse(result, "Downloaded report"),
    },
  ];
}

export const downloadReportTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: DownloadReportInputSchema,
  outputSchema: DownloadReportOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Download a report",
      input: {
        downloadUrl: "https://download.api.bingads.microsoft.com/reports/...",
        mode: "rows",
        maxRows: 50,
      },
    },
  ],
  logic: downloadReportLogic,
  responseFormatter: downloadReportResponseFormatter,
};
