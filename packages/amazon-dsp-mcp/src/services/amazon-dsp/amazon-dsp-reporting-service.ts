// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { AmazonDspHttpClient } from "./amazon-dsp-http-client.js";
import type { RateLimiter } from "@cesteral/shared";
import {
  fetchWithTimeout,
  McpError,
  JsonRpcErrorCode,
  DEFAULT_REPORT_MAX_BACKOFF_MS,
  DEFAULT_REPORT_POLL_INTERVAL_MS,
  DEFAULT_REPORT_MAX_POLL_ATTEMPTS,
  DEFAULT_REPORT_DOWNLOAD_TIMEOUT_MS,
  DEFAULT_REPORT_MAX_SIZE_BYTES,
  DEFAULT_REPORT_MAX_ROWS,
  parseCSV,
  pollUntilComplete,
  ReportFailedError,
  type RequestContext,
} from "@cesteral/shared";
import type { Logger } from "pino";
import { AMAZON_DSP_REPORTING_CONTRACT } from "./amazon-dsp-api-contract.js";
import { encodePathSegment } from "../../mcp-server/tools/utils/entity-mapping.js";

/** Amazon DSP report task status values (DSP reports v3). */
export type ReportTaskStatus = (typeof AMAZON_DSP_REPORTING_CONTRACT.statuses)[number];

/** Amazon DSP report task status response shape (DSP reports v3). */
interface ReportTaskCheckData {
  reportId: string;
  status: ReportTaskStatus;
  /** Presigned S3 URL — populated once status === "SUCCESS". */
  location?: string;
  /** Report type (echoed from submit). */
  type?: string;
  /** Output format (JSON for legacy DSP reports). */
  format?: string;
  statusDetails?: string;
  expiration?: number;
}

/** Amazon DSP report config (DSP reports v3 body shape + path scope). */
export interface AmazonDspReportConfig {
  /** DSP advertiser ID — the `{accountId}` path segment (not the profile ID). */
  accountId: string;
  /** Start date, YYYY-MM-DD (sent as-is). */
  startDate: string;
  /** End date, YYYY-MM-DD (sent as-is). */
  endDate: string;
  /** Report type — one of AMAZON_DSP_REPORTING_CONTRACT.reportTypes. */
  type: string;
  /** Optional grouping dimensions (type-specific allowed values). */
  dimensions?: string[];
  /** Metric names. Sent to Amazon as a JSON array. */
  metrics?: string[];
  /** Time unit (legacy API accepts "DAILY" or "SUMMARY"). */
  timeUnit?: "DAILY" | "SUMMARY";
}

function reportPath(template: string, accountId: string, reportId?: string): string {
  const path = template.replace("{accountId}", encodePathSegment(accountId, "accountId"));
  return reportId === undefined
    ? path
    : path.replace("{reportId}", encodePathSegment(reportId, "taskId"));
}

/**
 * AmazonDsp Reporting Service — async reporting via DSP reports v3
 * (contract + source in AMAZON_DSP_REPORTING_CONTRACT).
 *
 * Async polling flow:
 * 1. POST /accounts/{accountId}/dsp/reports → 202 with reportId
 * 2. GET /accounts/{accountId}/dsp/reports/{reportId} → poll until
 *    status === "SUCCESS" or "FAILURE"
 * 3. GET location (presigned S3 URL) to retrieve report body (JSON)
 */
export class AmazonDspReportingService {
  constructor(
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: AmazonDspHttpClient,
    private readonly logger: Logger,
    private readonly pollIntervalMs: number = DEFAULT_REPORT_POLL_INTERVAL_MS,
    private readonly maxPollAttempts: number = DEFAULT_REPORT_MAX_POLL_ATTEMPTS
  ) {}

  /**
   * Submit a report task to /accounts/{accountId}/dsp/reports.
   * Returns the reportId for polling.
   */
  async submitReport(
    reportConfig: AmazonDspReportConfig,
    context?: RequestContext
  ): Promise<{ taskId: string }> {
    await this.rateLimiter.consume(`amazon_dsp:reporting`);

    const body: Record<string, unknown> = {
      startDate: reportConfig.startDate,
      endDate: reportConfig.endDate,
      type: reportConfig.type,
      timeUnit: reportConfig.timeUnit ?? AMAZON_DSP_REPORTING_CONTRACT.defaultTimeUnit,
    };
    if (reportConfig.dimensions && reportConfig.dimensions.length > 0) {
      body.dimensions = reportConfig.dimensions;
    }
    if (reportConfig.metrics && reportConfig.metrics.length > 0) {
      body.metrics = reportConfig.metrics;
    }

    const result = (await this.httpClient.post(
      reportPath(AMAZON_DSP_REPORTING_CONTRACT.submitPathTemplate, reportConfig.accountId),
      body,
      context,
      AMAZON_DSP_REPORTING_CONTRACT.submitAccept
    )) as { reportId: string; status: string };

    return { taskId: result.reportId };
  }

  /**
   * Poll a report task until it is SUCCESS or FAILURE.
   */
  async pollReport(
    accountId: string,
    taskId: string,
    context?: RequestContext
  ): Promise<ReportTaskCheckData> {
    this.logger.debug({ taskId, maxPollAttempts: this.maxPollAttempts }, "Starting report poll");

    const path = reportPath(AMAZON_DSP_REPORTING_CONTRACT.statusPathTemplate, accountId, taskId);

    try {
      return await pollUntilComplete<ReportTaskCheckData>({
        fetchStatus: async () => {
          await this.rateLimiter.consume(`amazon_dsp:reporting`);
          return (await this.httpClient.get(
            path,
            undefined,
            context,
            AMAZON_DSP_REPORTING_CONTRACT.statusAccept
          )) as ReportTaskCheckData;
        },
        isComplete: (r) => r.status === "SUCCESS",
        isFailed: (r) => r.status === "FAILURE",
        initialDelayMs: this.pollIntervalMs,
        maxDelayMs: DEFAULT_REPORT_MAX_BACKOFF_MS,
        maxAttempts: this.maxPollAttempts,
      });
    } catch (err) {
      if (err instanceof ReportFailedError) {
        return err.status as ReportTaskCheckData;
      }
      throw err;
    }
  }

  /**
   * Single status check for a report task. No polling, no sleep.
   * Returns current status and download URL if SUCCESS.
   */
  async checkReportStatus(
    accountId: string,
    taskId: string,
    context?: RequestContext
  ): Promise<{ taskId: string; status: ReportTaskStatus; downloadUrl?: string }> {
    await this.rateLimiter.consume(`amazon_dsp:reporting`);

    const path = reportPath(AMAZON_DSP_REPORTING_CONTRACT.statusPathTemplate, accountId, taskId);

    const result = (await this.httpClient.get(
      path,
      undefined,
      context,
      AMAZON_DSP_REPORTING_CONTRACT.statusAccept
    )) as ReportTaskCheckData;

    return {
      taskId: result.reportId,
      status: result.status,
      downloadUrl: result.location,
    };
  }

  /**
   * Download a report from a URL.
   *
   * When `includeRawCsv` is true, the original response body is returned
   * alongside the parsed rows so callers can persist it via `ReportCsvStore`.
   * Amazon DSP reports may be JSON or CSV depending on report type — the raw
   * body is stored as-is; consumers inspect the mimeType hint on the entry.
   */
  async downloadReport(
    downloadUrl: string,
    maxRows = DEFAULT_REPORT_MAX_ROWS,
    context?: RequestContext,
    options: { includeRawCsv?: boolean } = {}
  ): Promise<{
    rows: string[][];
    headers: string[];
    totalRows: number;
    rawCsv?: string;
    rawMimeType?: string;
  }> {
    const response = await fetchWithTimeout(
      downloadUrl,
      DEFAULT_REPORT_DOWNLOAD_TIMEOUT_MS,
      context
    );

    if (!response.ok) {
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        `Failed to download Amazon DSP report: ${response.status} ${response.statusText}`
      );
    }

    const contentLength = response.headers?.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > DEFAULT_REPORT_MAX_SIZE_BYTES) {
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        `Amazon DSP report too large (${contentLength} bytes, limit ${DEFAULT_REPORT_MAX_SIZE_BYTES}). Use more restrictive filters or date ranges.`
      );
    }

    const text = await response.text();

    // Amazon DSP reports default to JSON format — detect and parse accordingly
    const contentType = response.headers?.get("content-type") ?? "";
    const looksLikeJson =
      contentType.includes("application/json") ||
      text.trimStart().startsWith("[") ||
      text.trimStart().startsWith("{");

    const rawExtras = options.includeRawCsv
      ? { rawCsv: text, rawMimeType: looksLikeJson ? "application/json" : "text/csv" }
      : {};

    if (looksLikeJson) {
      const parsed = JSON.parse(text) as Record<string, unknown>[];
      const data = Array.isArray(parsed) ? parsed : [parsed];
      if (data.length === 0) {
        return { rows: [], headers: [], totalRows: 0, ...rawExtras };
      }
      const headers = Object.keys(data[0]);
      const totalRows = data.length;
      const limitedData = data.slice(0, maxRows);
      const rows = limitedData.map((row) => headers.map((h) => String(row[h] ?? "")));
      return { rows, headers, totalRows, ...rawExtras };
    }

    // CSV/TSV fallback via shared parseCSV
    if (text.replace(/^\uFEFF/, "").trim() === "") {
      return { rows: [], headers: [], totalRows: 0, ...rawExtras };
    }
    const { headers, rows: recordRows } = parseCSV(text);
    if (headers.length === 0 && recordRows.length === 0) {
      return { rows: [], headers: [], totalRows: 0, ...rawExtras };
    }
    const limited = recordRows.slice(0, maxRows);
    const rows = limited.map((record) => headers.map((h) => record[h] ?? ""));
    return { rows, headers, totalRows: recordRows.length, ...rawExtras };
  }

  /**
   * Full async report flow: submit → poll → download.
   */
  async getReport(
    reportConfig: AmazonDspReportConfig,
    maxRowsOrContext: number | RequestContext = DEFAULT_REPORT_MAX_ROWS,
    context?: RequestContext
  ): Promise<{ rows: string[][]; headers: string[]; totalRows: number; taskId: string }> {
    const maxRows =
      typeof maxRowsOrContext === "number" ? maxRowsOrContext : DEFAULT_REPORT_MAX_ROWS;
    const requestContext = typeof maxRowsOrContext === "number" ? context : maxRowsOrContext;

    const { taskId } = await this.submitReport(reportConfig, requestContext);
    const taskResult = await this.pollReport(reportConfig.accountId, taskId, requestContext);

    if (taskResult.status === "FAILURE") {
      throw new McpError(JsonRpcErrorCode.InternalError, `Amazon DSP report task ${taskId} failed`);
    }

    if (!taskResult.location) {
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        `Amazon DSP report task ${taskId} completed but has no download URL`
      );
    }

    const reportData = await this.downloadReport(taskResult.location, maxRows, requestContext);

    return {
      ...reportData,
      taskId,
    };
  }

  /**
   * Get report with additional dimensional breakdowns.
   * Adds breakdown values to the existing `dimensions` array on the config.
   */
  async getReportBreakdowns(
    reportConfig: AmazonDspReportConfig,
    breakdowns: string[],
    maxRowsOrContext: number | RequestContext = DEFAULT_REPORT_MAX_ROWS,
    context?: RequestContext
  ): Promise<{ rows: string[][]; headers: string[]; totalRows: number; taskId: string }> {
    const configWithBreakdowns: AmazonDspReportConfig = {
      ...reportConfig,
      dimensions: [...(reportConfig.dimensions ?? []), ...breakdowns],
    };

    return this.getReport(configWithBreakdowns, maxRowsOrContext, context);
  }
}
