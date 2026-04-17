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
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "amazon_dsp_download_report";
const TOOL_TITLE = "Download AmazonDsp Report";
const TOOL_DESCRIPTION = `Download and parse a AmazonDsp report from a download URL.

After a report task is COMPLETED (via \`amazon_dsp_check_report_status\`), use the \`downloadUrl\` to fetch and parse the report data.

**Workflow:**
1. \`amazon_dsp_submit_report\` → get \`taskId\`
2. \`amazon_dsp_check_report_status\` → get \`downloadUrl\` when COMPLETED
3. \`amazon_dsp_download_report\` with that URL → get a bounded summary or paged row slice

**Options:**
- \`mode: "summary"\` (default) returns headers, counts, and a small preview
- \`mode: "rows"\` returns one bounded page of rows
- \`columns\` projects returned rows to selected columns
- \`offset\` and \`maxRows\` page through rows; \`maxRows\` is capped at 200`;

export const DownloadReportInputSchema = z
  .object({
    downloadUrl: z
      .string()
      .url()
      .describe("Report download URL from amazon_dsp_check_report_status"),
    storeRawCsv: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Persist the full report body (JSON or CSV, depending on report type) in " +
        "the in-process report-csv store and return a `report-csv://{id}` resource URI. " +
        "Entries expire after 30 minutes."
      ),
  })
  .merge(ReportViewInputSchema)
  .merge(ComputedMetricsFlagSchema)
  .describe("Parameters for downloading a AmazonDsp report");

export const DownloadReportOutputSchema = z
  .object({
    ...ReportViewOutputSchema.shape,
    timestamp: z.string().datetime(),
    rawCsvResourceUri: z
      .string()
      .optional()
      .describe("MCP resource URI of the persisted raw body (only present when storeRawCsv is true)"),
    rawCsvByteLength: z
      .number()
      .optional()
      .describe("Stored body size in bytes (after redaction and any truncation)"),
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
  })
  .describe("Downloaded report data");

type DownloadInput = z.infer<typeof DownloadReportInputSchema>;
type DownloadOutput = z.infer<typeof DownloadReportOutputSchema>;

const AMAZON_DSP_COMPUTED_METRIC_ALIASES = {
  cost: ["totalCost", "cost", "spend"],
  impressions: ["impressions"],
  clicks: ["clickThroughs", "clicks"],
  conversions: ["purchases14d", "purchases", "totalPurchases"],
  conversionValue: ["sales14d", "totalSales", "purchasesValue14d"],
};

/**
 * Derive a stable filename hint from an Amazon DSP report download URL. The
 * last non-empty path segment (usually a report/task token) is a reasonable
 * key; malformed URLs fall back to the literal string "report".
 */
function extractAmazonDspReportId(downloadUrl: string): string {
  try {
    const u = new URL(downloadUrl);
    const segments = u.pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? "report";
  } catch {
    return "report";
  }
}

export async function downloadReportLogic(
  input: DownloadInput,
  _context: RequestContext,
  sdkContext?: SdkContext
): Promise<DownloadOutput> {
  const { amazonDspReportingService } = resolveSessionServices(sdkContext);

  // Always ask the service for raw body — storeRawCsv controls the in-memory
  // MCP resource store, while REPORT_SPILL_BUCKET controls the GCS spill.
  // Both paths need the raw body, and holding the string for the duration
  // of this handler is free (parseCSV materializes it anyway).
  const spillEnabled = !!process.env.REPORT_SPILL_BUCKET;
  const needRawCsv = input.storeRawCsv === true || spillEnabled;
  const result = await amazonDspReportingService.downloadReport(
    input.downloadUrl,
    getReportViewFetchLimit(input),
    undefined,
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
    ? appendComputedMetricsToRows(recordRows, AMAZON_DSP_COMPUTED_METRIC_ALIASES)
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
    spill?: DownloadOutput["spill"];
  } = {};
  if (input.storeRawCsv === true && result.rawCsv !== undefined) {
    const entry = reportCsvStore.store({
      csv: result.rawCsv,
      mimeType: result.rawMimeType ?? "text/csv",
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
  // the response. Amazon DSP reports can be JSON or CSV — thread
  // rawMimeType through so the stored GCS object carries the right
  // Content-Type.
  if (result.rawCsv !== undefined) {
    const spill = await spillCsvToGcs({
      csv: result.rawCsv,
      mimeType: result.rawMimeType ?? "text/csv",
      sessionId: sdkContext?.sessionId,
      server: "amazonDsp",
      reportId: extractAmazonDspReportId(input.downloadUrl),
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

export function downloadReportResponseFormatter(result: DownloadOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: formatReportViewResponse(result, "Report data"),
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
    openWorldHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Download report summary preview",
      input: {
        downloadUrl: "https://analytics.amazonDsp.com/reports/task-abc123/report.csv",
      },
    },
    {
      label: "Download selected columns as a paged row slice",
      input: {
        downloadUrl: "https://analytics.amazonDsp.com/reports/task-xyz789/report.csv",
        mode: "rows",
        columns: ["lineItem", "impressions", "totalCost"],
        maxRows: 50,
      },
    },
  ],
  logic: downloadReportLogic,
  responseFormatter: downloadReportResponseFormatter,
};
