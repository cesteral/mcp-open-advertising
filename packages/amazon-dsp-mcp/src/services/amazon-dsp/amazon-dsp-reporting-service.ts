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

/** Amazon DSP report task status values (per Reporting v3 OpenAPI spec) */
export type ReportTaskStatus = (typeof AMAZON_DSP_REPORTING_CONTRACT.statuses)[number];

/** Amazon DSP report task check response */
interface ReportTaskCheckData {
  reportId: string;
  status: ReportTaskStatus;
  url?: string;
  fileSize?: number;
}

/** Amazon DSP report configuration (per Reporting v3 OpenAPI spec) */
export interface AmazonDspReportConfig {
  name?: string;
  /** Start date in YYYY-MM-DD format */
  startDate: string;
  /** End date in YYYY-MM-DD format */
  endDate: string;
  configuration: {
    /** Ad product (e.g. DEMAND_SIDE_PLATFORM, SPONSORED_PRODUCTS) */
    adProduct?: string;
    groupBy: string[];
    columns: string[];
    reportTypeId: string;
    timeUnit?: "DAILY" | "SUMMARY";
    format?: "GZIP_JSON";
  };
}

/**
 * AmazonDsp Reporting Service — Handles async reporting via Amazon DSP Reporting v3 API.
 *
 * Amazon DSP reporting uses an async polling pattern:
 * 1. POST /accounts/{accountId}/dsp/reports → get reportId
 * 2. GET /accounts/{accountId}/dsp/reports/{reportId} → poll until COMPLETED or FAILURE
 * 3. GET url (presigned) to retrieve report data
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
   * Submit a report task.
   * Returns the reportId for polling.
   */
  async submitReport(
    accountId: string,
    reportConfig: AmazonDspReportConfig,
    context?: RequestContext
  ): Promise<{ taskId: string }> {
    await this.rateLimiter.consume(`amazon_dsp:reporting`);

    const path = AMAZON_DSP_REPORTING_CONTRACT.submitPathTemplate.replace(
      "{accountId}",
      encodeURIComponent(accountId)
    );
    const result = (await this.httpClient.post(
      path,
      {
        name: reportConfig.name ?? "MCP Report",
        startDate: reportConfig.startDate,
        endDate: reportConfig.endDate,
        configuration: {
          adProduct:
            reportConfig.configuration.adProduct ?? AMAZON_DSP_REPORTING_CONTRACT.defaultAdProduct,
          groupBy: reportConfig.configuration.groupBy,
          columns: reportConfig.configuration.columns,
          reportTypeId: reportConfig.configuration.reportTypeId,
          timeUnit:
            reportConfig.configuration.timeUnit ?? AMAZON_DSP_REPORTING_CONTRACT.defaultTimeUnit,
          format: reportConfig.configuration.format ?? AMAZON_DSP_REPORTING_CONTRACT.defaultFormat,
        },
      },
      context,
      AMAZON_DSP_REPORTING_CONTRACT.submitAcceptMediaType
    )) as { reportId: string; status: string };

    return { taskId: result.reportId };
  }

  /**
   * Poll a report task until it is COMPLETED or FAILURE.
   */
  async pollReport(
    accountId: string,
    taskId: string,
    context?: RequestContext
  ): Promise<ReportTaskCheckData> {
    this.logger.debug(
      { accountId, taskId, maxPollAttempts: this.maxPollAttempts },
      "Starting report poll"
    );

    const path = AMAZON_DSP_REPORTING_CONTRACT.statusPathTemplate
      .replace("{accountId}", encodeURIComponent(accountId))
      .replace("{reportId}", encodeURIComponent(taskId));

    try {
      return await pollUntilComplete<ReportTaskCheckData>({
        fetchStatus: async () => {
          await this.rateLimiter.consume(`amazon_dsp:reporting`);
          return (await this.httpClient.get(
            path,
            undefined,
            context,
            AMAZON_DSP_REPORTING_CONTRACT.statusAcceptMediaType
          )) as ReportTaskCheckData;
        },
        isComplete: (r) => r.status === "COMPLETED",
        isFailed: (r) => r.status === "FAILED",
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
   * Returns current status and download URL if COMPLETED.
   */
  async checkReportStatus(
    accountId: string,
    taskId: string,
    context?: RequestContext
  ): Promise<{ taskId: string; status: ReportTaskStatus; downloadUrl?: string }> {
    await this.rateLimiter.consume(`amazon_dsp:reporting`);

    const path = AMAZON_DSP_REPORTING_CONTRACT.statusPathTemplate
      .replace("{accountId}", encodeURIComponent(accountId))
      .replace("{reportId}", encodeURIComponent(taskId));

    const result = (await this.httpClient.get(
      path,
      undefined,
      context,
      AMAZON_DSP_REPORTING_CONTRACT.statusAcceptMediaType
    )) as ReportTaskCheckData;

    return {
      taskId: result.reportId,
      status: result.status,
      downloadUrl: result.url,
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
    accountId: string,
    reportConfig: AmazonDspReportConfig,
    maxRowsOrContext: number | RequestContext = DEFAULT_REPORT_MAX_ROWS,
    context?: RequestContext
  ): Promise<{ rows: string[][]; headers: string[]; totalRows: number; taskId: string }> {
    const maxRows =
      typeof maxRowsOrContext === "number" ? maxRowsOrContext : DEFAULT_REPORT_MAX_ROWS;
    const requestContext = typeof maxRowsOrContext === "number" ? context : maxRowsOrContext;

    const { taskId } = await this.submitReport(accountId, reportConfig, requestContext);
    const taskResult = await this.pollReport(accountId, taskId, requestContext);

    if (taskResult.status === "FAILED") {
      throw new McpError(JsonRpcErrorCode.InternalError, `Amazon DSP report task ${taskId} failed`);
    }

    if (!taskResult.url) {
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        `Amazon DSP report task ${taskId} completed but has no download URL`
      );
    }

    const reportData = await this.downloadReport(taskResult.url, maxRows, requestContext);

    return {
      ...reportData,
      taskId,
    };
  }

  /**
   * Get report with dimensional breakdowns.
   * Adds breakdown groupBy dimensions to the report config.
   */
  async getReportBreakdowns(
    accountId: string,
    reportConfig: AmazonDspReportConfig,
    breakdowns: string[],
    maxRowsOrContext: number | RequestContext = DEFAULT_REPORT_MAX_ROWS,
    context?: RequestContext
  ): Promise<{ rows: string[][]; headers: string[]; totalRows: number; taskId: string }> {
    const configWithBreakdowns: AmazonDspReportConfig = {
      ...reportConfig,
      configuration: {
        ...reportConfig.configuration,
        groupBy: [...reportConfig.configuration.groupBy, ...breakdowns],
      },
    };

    return this.getReport(accountId, configWithBreakdowns, maxRowsOrContext, context);
  }
}
