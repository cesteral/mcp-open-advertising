// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { PinterestHttpClient } from "./pinterest-http-client.js";
import type { RateLimiter } from "../../utils/security/rate-limiter.js";
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

/** Pinterest report task status values */
export type ReportTaskStatus = "IN_PROGRESS" | "FINISHED" | "FAILED" | "EXPIRED" | "DOES_NOT_EXIST";

/** Pinterest report task check response */
interface ReportTaskCheckData {
  report_status: ReportTaskStatus;
  url?: string;
  size?: number;
  token: string;
}

/** Pinterest report configuration */
export interface PinterestReportConfig {
  type?: "CAMPAIGN" | "AD_GROUP" | "AD" | "KEYWORD" | "ACCOUNT";
  columns: string[];
  start_date: string;
  end_date: string;
  granularity?: "TOTAL" | "DAY" | "HOUR" | "WEEK" | "MONTH";
  campaign_ids?: string[];
  ad_group_ids?: string[];
  ad_ids?: string[];
}

/**
 * Pinterest Reporting Service — Handles async reporting via Pinterest Marketing API v5.
 *
 * Pinterest reporting uses an async polling pattern:
 * 1. POST /v5/ad_accounts/{adAccountId}/reports → get token
 * 2. GET /v5/ad_accounts/{adAccountId}/reports/{token} → poll until FINISHED
 * 3. GET download url to retrieve CSV report data
 */
export class PinterestReportingService {
  constructor(
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: PinterestHttpClient,
    private readonly logger: Logger,
    private readonly pollIntervalMs: number = DEFAULT_REPORT_POLL_INTERVAL_MS,
    private readonly maxPollAttempts: number = DEFAULT_REPORT_MAX_POLL_ATTEMPTS
  ) {}

  /**
   * Submit a report task.
   * Returns the token (report ID) for polling.
   */
  async submitReport(
    reportConfig: PinterestReportConfig,
    context?: RequestContext
  ): Promise<{ task_id: string }> {
    await this.rateLimiter.consume(`pinterest:reporting`);

    const adAccountId = this.httpClient.accountId;

    const result = (await this.httpClient.post(
      `/v5/ad_accounts/${adAccountId}/reports`,
      {
        type: reportConfig.type ?? "CAMPAIGN",
        columns: reportConfig.columns,
        start_date: reportConfig.start_date,
        end_date: reportConfig.end_date,
        ...(reportConfig.granularity ? { granularity: reportConfig.granularity } : {}),
        ...(reportConfig.campaign_ids ? { campaign_ids: reportConfig.campaign_ids } : {}),
        ...(reportConfig.ad_group_ids ? { ad_group_ids: reportConfig.ad_group_ids } : {}),
        ...(reportConfig.ad_ids ? { ad_ids: reportConfig.ad_ids } : {}),
      },
      context
    )) as { token: string };

    return { task_id: result.token };
  }

  /**
   * Poll a report task until it is FINISHED or FAILED/EXPIRED.
   */
  async pollReport(taskId: string, context?: RequestContext): Promise<ReportTaskCheckData> {
    this.logger.debug({ taskId, maxPollAttempts: this.maxPollAttempts }, "Starting report poll");

    const adAccountId = this.httpClient.accountId;

    try {
      return await pollUntilComplete<ReportTaskCheckData>({
        fetchStatus: async () => {
          await this.rateLimiter.consume(`pinterest:reporting`);
          return (await this.httpClient.get(
            `/v5/ad_accounts/${adAccountId}/reports`,
            { token: taskId },
            context
          )) as ReportTaskCheckData;
        },
        isComplete: (r) => r.report_status === "FINISHED",
        isFailed: (r) =>
          r.report_status === "FAILED" ||
          r.report_status === "EXPIRED" ||
          r.report_status === "DOES_NOT_EXIST",
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
   * Returns current status and download URL if FINISHED.
   */
  async checkReportStatus(
    taskId: string,
    context?: RequestContext
  ): Promise<{ taskId: string; status: ReportTaskStatus; downloadUrl?: string }> {
    await this.rateLimiter.consume(`pinterest:reporting`);

    const adAccountId = this.httpClient.accountId;

    const result = (await this.httpClient.get(
      `/v5/ad_accounts/${adAccountId}/reports`,
      { token: taskId },
      context
    )) as ReportTaskCheckData;

    return {
      taskId: result.token,
      status: result.report_status,
      downloadUrl: result.url,
    };
  }

  /**
   * Download a report CSV from a URL.
   *
   * When `includeRawCsv` is true, the original (BOM-stripped, line-normalized)
   * CSV body is returned alongside the parsed rows so callers can persist it
   * via `ReportCsvStore`.
   */
  async downloadReport(
    downloadUrl: string,
    maxRows = DEFAULT_REPORT_MAX_ROWS,
    context?: RequestContext,
    options: { includeRawCsv?: boolean } = {}
  ): Promise<{ rows: string[][]; headers: string[]; totalRows: number; rawCsv?: string }> {
    const response = await fetchWithTimeout(
      downloadUrl,
      DEFAULT_REPORT_DOWNLOAD_TIMEOUT_MS,
      context
    );

    if (!response.ok) {
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        `Failed to download Pinterest report: ${response.status} ${response.statusText}`
      );
    }

    const contentLength = response.headers?.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > DEFAULT_REPORT_MAX_SIZE_BYTES) {
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        `Pinterest report too large (${contentLength} bytes, limit ${DEFAULT_REPORT_MAX_SIZE_BYTES}). Use more restrictive filters or date ranges.`
      );
    }

    const csvText = await response.text();
    // Normalize for downstream ReportCsvStore persistence — BOM-stripped and
    // LF-only so consumers get a stable canonical payload.
    const normalizedCsvText = csvText
      .replace(/^\uFEFF/, "")
      .replace(/\r\n/g, "\n")
      .trim();

    if (normalizedCsvText.length === 0) {
      return {
        rows: [],
        headers: [],
        totalRows: 0,
        ...(options.includeRawCsv ? { rawCsv: "" } : {}),
      };
    }

    const { headers, rows: recordRows } = parseCSV(normalizedCsvText);

    if (headers.length === 0 && recordRows.length === 0) {
      return {
        rows: [],
        headers: [],
        totalRows: 0,
        ...(options.includeRawCsv ? { rawCsv: normalizedCsvText } : {}),
      };
    }

    const limited = recordRows.slice(0, maxRows);
    const rows = limited.map((record) => headers.map((h) => record[h] ?? ""));

    return {
      rows,
      headers,
      totalRows: recordRows.length,
      ...(options.includeRawCsv ? { rawCsv: normalizedCsvText } : {}),
    };
  }

  /**
   * Full async report flow: submit → poll → download.
   */
  async getReport(
    reportConfig: PinterestReportConfig,
    maxRowsOrContext: number | RequestContext = DEFAULT_REPORT_MAX_ROWS,
    context?: RequestContext
  ): Promise<{ rows: string[][]; headers: string[]; totalRows: number; taskId: string }> {
    const maxRows =
      typeof maxRowsOrContext === "number" ? maxRowsOrContext : DEFAULT_REPORT_MAX_ROWS;
    const requestContext = typeof maxRowsOrContext === "number" ? context : maxRowsOrContext;

    const { task_id } = await this.submitReport(reportConfig, requestContext);
    const taskResult = await this.pollReport(task_id, requestContext);

    if (
      taskResult.report_status === "FAILED" ||
      taskResult.report_status === "EXPIRED" ||
      taskResult.report_status === "DOES_NOT_EXIST"
    ) {
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        `Pinterest report task ${task_id} failed with status: ${taskResult.report_status}`
      );
    }

    if (!taskResult.url) {
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        `Pinterest report task ${task_id} completed but has no download URL`
      );
    }

    const reportData = await this.downloadReport(taskResult.url, maxRows, requestContext);

    return {
      ...reportData,
      taskId: task_id,
    };
  }

  /**
   * Get report with dimensional breakdowns.
   * Adds breakdown columns to the report config.
   */
  async getReportBreakdowns(
    reportConfig: PinterestReportConfig,
    breakdowns: string[],
    maxRowsOrContext: number | RequestContext = DEFAULT_REPORT_MAX_ROWS,
    context?: RequestContext
  ): Promise<{ rows: string[][]; headers: string[]; totalRows: number; taskId: string }> {
    const configWithBreakdowns: PinterestReportConfig = {
      ...reportConfig,
      columns: [...reportConfig.columns, ...breakdowns],
    };

    return this.getReport(configWithBreakdowns, maxRowsOrContext, context);
  }
}
