// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { TikTokHttpClient } from "./tiktok-http-client.js";
import type { RateLimiter } from "../../utils/security/rate-limiter.js";
import type { RequestContext } from "@cesteral/shared";
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
} from "@cesteral/shared";
import type { Logger } from "pino";

/** TikTok report task status values */
export type ReportTaskStatus = "PENDING" | "RUNNING" | "DONE" | "FAILED";

/** TikTok report task check response */
interface ReportTaskCheckData {
  status: ReportTaskStatus;
  download_url?: string;
  task_id: string;
}

/** TikTok report configuration */
export interface TikTokReportConfig {
  report_type?: "BASIC" | "AUDIENCE" | "PLAYABLE_MATERIAL";
  dimensions: string[];
  metrics: string[];
  start_date: string;
  end_date: string;
  page?: number;
  page_size?: number;
  filtering?: Record<string, unknown>[];
  order_field?: string;
  order_type?: "ASC" | "DESC";
}

/**
 * TikTok Reporting Service — Handles async reporting via TikTok Marketing API.
 *
 * TikTok reporting uses an async polling pattern:
 * 1. POST to create a report task → get task_id
 * 2. GET to poll task status until DONE or FAILED
 * 3. GET download URL to retrieve CSV report data
 */
export class TikTokReportingService {
  constructor(
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: TikTokHttpClient,
    private readonly logger: Logger,
    private readonly pollIntervalMs: number = DEFAULT_REPORT_POLL_INTERVAL_MS,
    private readonly maxPollAttempts: number = DEFAULT_REPORT_MAX_POLL_ATTEMPTS,
    private readonly apiVersion: string = "v1.3"
  ) {}

  /**
   * Submit a report task.
   * Returns the task_id for polling.
   */
  async submitReport(
    reportConfig: TikTokReportConfig,
    context?: RequestContext
  ): Promise<{ task_id: string }> {
    await this.rateLimiter.consume(`tiktok:reporting`);

    const result = (await this.httpClient.post(
      `/open_api/${this.apiVersion}/report/task/create/`,
      {
        report_type: reportConfig.report_type ?? "BASIC",
        dimensions: reportConfig.dimensions,
        metrics: reportConfig.metrics,
        start_date: reportConfig.start_date,
        end_date: reportConfig.end_date,
        ...(reportConfig.page ? { page: reportConfig.page } : {}),
        ...(reportConfig.page_size ? { page_size: reportConfig.page_size } : {}),
        ...(reportConfig.filtering ? { filtering: reportConfig.filtering } : {}),
        ...(reportConfig.order_field ? { order_field: reportConfig.order_field } : {}),
        ...(reportConfig.order_type ? { order_type: reportConfig.order_type } : {}),
      },
      context
    )) as { task_id: string };

    return result;
  }

  /**
   * Poll a report task until it is DONE or FAILED.
   */
  async pollReport(
    taskId: string,
    context?: RequestContext
  ): Promise<ReportTaskCheckData> {
    this.logger.debug({ taskId, maxPollAttempts: this.maxPollAttempts }, "Starting report poll");

    try {
      return await pollUntilComplete<ReportTaskCheckData>({
        fetchStatus: async () => {
          await this.rateLimiter.consume(`tiktok:reporting`);
          return (await this.httpClient.get(
            `/open_api/${this.apiVersion}/report/task/check/`,
            { task_id: taskId },
            context
          )) as ReportTaskCheckData;
        },
        isComplete: (r) => r.status === "DONE",
        isFailed: (r) => r.status === "FAILED",
        initialDelayMs: this.pollIntervalMs,
        maxDelayMs: DEFAULT_REPORT_MAX_BACKOFF_MS,
        maxAttempts: this.maxPollAttempts,
      });
    } catch (err) {
      if (err instanceof ReportFailedError) {
        // Surface the full task payload (which carries status=FAILED) to callers
        // that previously received it from the old direct-return path.
        return err.status as ReportTaskCheckData;
      }
      throw err;
    }
  }

  /**
   * Single status check for a report task. No polling, no sleep.
   * Returns current status and download URL if DONE.
   */
  async checkReportStatus(
    taskId: string,
    context?: RequestContext
  ): Promise<{ taskId: string; status: ReportTaskStatus; downloadUrl?: string }> {
    await this.rateLimiter.consume(`tiktok:reporting`);

    const result = (await this.httpClient.get(
      `/open_api/${this.apiVersion}/report/task/check/`,
      { task_id: taskId },
      context
    )) as ReportTaskCheckData;

    return {
      taskId: result.task_id,
      status: result.status,
      downloadUrl: result.download_url,
    };
  }

  /**
   * Download a report CSV from a URL.
   *
   * When `includeRawCsv` is true, the original (BOM-stripped, LF-only) CSV
   * body is returned alongside the parsed rows so callers can persist it
   * via `ReportCsvStore`.
   */
  async downloadReport(
    downloadUrl: string,
    maxRows = DEFAULT_REPORT_MAX_ROWS,
    context?: RequestContext,
    options: { includeRawCsv?: boolean } = {}
  ): Promise<{ rows: string[][]; headers: string[]; totalRows: number; rawCsv?: string }> {
    const response = await fetchWithTimeout(downloadUrl, DEFAULT_REPORT_DOWNLOAD_TIMEOUT_MS, context);

    if (!response.ok) {
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        `Failed to download TikTok report: ${response.status} ${response.statusText}`
      );
    }

    const contentLength = response.headers?.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > DEFAULT_REPORT_MAX_SIZE_BYTES) {
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        `TikTok report too large (${contentLength} bytes, limit ${DEFAULT_REPORT_MAX_SIZE_BYTES}). Use more restrictive filters or date ranges.`
      );
    }

    const csvText = await response.text();
    const normalizedCsvText = csvText.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
    // Guard against BOM-only or whitespace-only bodies before delegating to
    // the shared parser — parseCSV treats a whitespace line as a header row
    // of a single empty column, which would mislead downstream bounded-view
    // consumers for a truly-empty report.
    if (normalizedCsvText === "") {
      return {
        rows: [],
        headers: [],
        totalRows: 0,
        ...(options.includeRawCsv ? { rawCsv: "" } : {}),
      };
    }
    const { headers, rows } = parseCSV(normalizedCsvText);

    if (headers.length === 0 && rows.length === 0) {
      return {
        rows: [],
        headers: [],
        totalRows: 0,
        ...(options.includeRawCsv ? { rawCsv: normalizedCsvText } : {}),
      };
    }

    const limitedRecords = rows.slice(0, maxRows);
    const rowArrays = limitedRecords.map((record) =>
      headers.map((h) => record[h] ?? "")
    );

    return {
      rows: rowArrays,
      headers,
      totalRows: rows.length,
      ...(options.includeRawCsv ? { rawCsv: normalizedCsvText } : {}),
    };
  }

  /**
   * Full async report flow: submit → poll → download.
   */
  async getReport(
    reportConfig: TikTokReportConfig,
    maxRowsOrContext: number | RequestContext = DEFAULT_REPORT_MAX_ROWS,
    context?: RequestContext
  ): Promise<{ rows: string[][]; headers: string[]; totalRows: number; taskId: string }> {
    const maxRows = typeof maxRowsOrContext === "number" ? maxRowsOrContext : DEFAULT_REPORT_MAX_ROWS;
    const requestContext = typeof maxRowsOrContext === "number" ? context : maxRowsOrContext;

    const { task_id } = await this.submitReport(reportConfig, requestContext);
    const taskResult = await this.pollReport(task_id, requestContext);

    if (taskResult.status === "FAILED") {
      throw new McpError(JsonRpcErrorCode.InternalError, `TikTok report task ${task_id} failed`);
    }

    if (!taskResult.download_url) {
      throw new McpError(JsonRpcErrorCode.InternalError, `TikTok report task ${task_id} completed but has no download URL`);
    }

    const reportData = await this.downloadReport(taskResult.download_url, maxRows, requestContext);

    return {
      ...reportData,
      taskId: task_id,
    };
  }

  /**
   * Get report with dimensional breakdowns.
   * Adds breakdown dimensions to the report config.
   */
  async getReportBreakdowns(
    reportConfig: TikTokReportConfig,
    breakdowns: string[],
    maxRowsOrContext: number | RequestContext = DEFAULT_REPORT_MAX_ROWS,
    context?: RequestContext
  ): Promise<{ rows: string[][]; headers: string[]; totalRows: number; taskId: string }> {
    const configWithBreakdowns: TikTokReportConfig = {
      ...reportConfig,
      dimensions: [...reportConfig.dimensions, ...breakdowns],
    };

    return this.getReport(configWithBreakdowns, maxRowsOrContext, context);
  }

}
