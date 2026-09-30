// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { SnapchatHttpClient } from "./snapchat-http-client.js";
import type { RateLimiter } from "@cesteral/shared";
import {
  type RequestContext,
  type DatePreset,
  McpError,
  JsonRpcErrorCode,
  resolveDatePreset,
} from "@cesteral/shared";
import type { ReportDimension } from "./report-dimensions.js";
import { accountDayRange, assertOnHourBoundary } from "../../utils/report-time.js";
import {
  fetchWithTimeout,
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

/** Snapchat report task status values exposed through MCP */
export type ReportTaskStatus = "PENDING" | "RUNNING" | "COMPLETE" | "FAILED";

/** Snapchat async stats report check response */
interface ReportTaskCheckData {
  status: ReportTaskStatus;
  download_url?: string;
  id: string;
}

/** Snapchat report filter */
export interface SnapchatReportFilter {
  field: string;
  operator: string;
  values: string[];
}

/** Snapchat report configuration */
export interface SnapchatReportConfig {
  fields: string[];
  granularity?: "TOTAL" | "DAY" | "HOUR" | "LIFETIME";
  start_time: string;
  end_time: string;
  dimension_type?: "CAMPAIGN" | "AD_SQUAD" | "AD";
  /** Insight-level breakdown, sent as the `report_dimension` query parameter. */
  report_dimension?: ReportDimension;
}

/**
 * Snapchat Reporting Service — Handles async reporting via Snapchat Ads API v1.
 *
 * Snapchat reporting uses an async polling pattern:
 * 1. GET /v1/adaccounts/{adAccountId}/stats?async=true → get report_run_id
 * 2. GET /v1/adaccounts/{adAccountId}/stats_report?report_run_id=... → poll until complete
 * 3. GET download URL to retrieve CSV report data
 */
export class SnapchatReportingService {
  constructor(
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: SnapchatHttpClient,
    private readonly adAccountId: string,
    private readonly logger: Logger,
    private readonly pollIntervalMs: number = DEFAULT_REPORT_POLL_INTERVAL_MS,
    private readonly maxPollAttempts: number = DEFAULT_REPORT_MAX_POLL_ATTEMPTS
  ) {}

  /**
   * Submit a report task.
   * Returns the report id for polling.
   */
  async submitReport(
    reportConfig: SnapchatReportConfig,
    context?: RequestContext
  ): Promise<{ task_id: string }> {
    const granularity = reportConfig.granularity ?? "DAY";
    if (granularity === "DAY" || granularity === "HOUR") {
      assertOnHourBoundary("start_time", reportConfig.start_time);
      assertOnHourBoundary("end_time", reportConfig.end_time);
    }

    await this.rateLimiter.consume(`snapchat:reporting`);

    const queryParams: Record<string, string> = {
      async: "true",
      async_format: "csv",
      fields: reportConfig.fields.join(","),
      granularity,
      start_time: reportConfig.start_time,
      end_time: reportConfig.end_time,
      ...(reportConfig.dimension_type
        ? { breakdown: this.mapDimensionType(reportConfig.dimension_type) }
        : {}),
      ...(reportConfig.report_dimension ? { report_dimension: reportConfig.report_dimension } : {}),
    };

    const result = (await this.httpClient.get(
      `/v1/adaccounts/${this.adAccountId}/stats`,
      queryParams,
      context
    )) as {
      request_status: string;
      async_stats_reports?: Array<{
        async_stats_report?: { report_run_id?: string; async_status?: string };
      }>;
    };

    const reportId = result.async_stats_reports?.[0]?.async_stats_report?.report_run_id;
    if (!reportId) {
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        "Snapchat async reporting: no report id returned from submit"
      );
    }

    return { task_id: reportId };
  }

  /**
   * Poll a report task until it is COMPLETE or FAILED.
   */
  async pollReport(taskId: string, context?: RequestContext): Promise<ReportTaskCheckData> {
    this.logger.debug({ taskId, maxPollAttempts: this.maxPollAttempts }, "Starting report poll");

    try {
      return await pollUntilComplete<ReportTaskCheckData>({
        fetchStatus: async () => {
          await this.rateLimiter.consume(`snapchat:reporting`);
          const envelope = (await this.httpClient.get(
            `/v1/adaccounts/${this.adAccountId}/stats_report`,
            { report_run_id: taskId },
            context
          )) as {
            request_status: string;
            async_stats_reports?: Array<{
              async_stats_report?: {
                report_run_id?: string;
                async_status?: string;
                result?: string;
              };
            }>;
          };
          const report = envelope.async_stats_reports?.[0]?.async_stats_report;
          if (!report) {
            throw new McpError(
              JsonRpcErrorCode.InternalError,
              `Snapchat report poll: unexpected response shape for task ${taskId}`
            );
          }
          return {
            id: report.report_run_id ?? taskId,
            status: this.normalizeReportStatus(report.async_status),
            download_url: report.result,
          };
        },
        isComplete: (r) => r.status === "COMPLETE",
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
   * Returns current status and download URL if COMPLETE.
   */
  async checkReportStatus(
    taskId: string,
    context?: RequestContext
  ): Promise<{ taskId: string; status: ReportTaskStatus; downloadUrl?: string }> {
    await this.rateLimiter.consume(`snapchat:reporting`);

    const envelope = (await this.httpClient.get(
      `/v1/adaccounts/${this.adAccountId}/stats_report`,
      { report_run_id: taskId },
      context
    )) as {
      request_status: string;
      async_stats_reports?: Array<{
        async_stats_report?: { report_run_id?: string; async_status?: string; result?: string };
      }>;
    };

    const report = envelope.async_stats_reports?.[0]?.async_stats_report;
    if (!report) {
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        `Snapchat report status: unexpected response shape for task ${taskId}`
      );
    }

    return {
      taskId: report.report_run_id ?? taskId,
      status: this.normalizeReportStatus(report.async_status),
      downloadUrl: report.result,
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
    const response = await fetchWithTimeout(
      downloadUrl,
      DEFAULT_REPORT_DOWNLOAD_TIMEOUT_MS,
      context
    );

    if (!response.ok) {
      throw new McpError(
        JsonRpcErrorCode.ServiceUnavailable,
        `Failed to download Snapchat report: ${response.status} ${response.statusText}`
      );
    }

    const contentLength = response.headers?.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > DEFAULT_REPORT_MAX_SIZE_BYTES) {
      throw new McpError(
        JsonRpcErrorCode.InvalidRequest,
        `Snapchat report too large (${contentLength} bytes, limit ${DEFAULT_REPORT_MAX_SIZE_BYTES}). Use more restrictive filters or date ranges.`
      );
    }

    const csvText = await response.text();
    const normalizedCsvText = csvText
      .replace(/^\uFEFF/, "")
      .replace(/\r\n/g, "\n")
      .trim();
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

    const limited = rows.slice(0, maxRows);
    const rowArrays = limited.map((record) => headers.map((h) => record[h] ?? ""));

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
    reportConfig: SnapchatReportConfig,
    maxRowsOrContext: number | RequestContext = DEFAULT_REPORT_MAX_ROWS,
    context?: RequestContext
  ): Promise<{ rows: string[][]; headers: string[]; totalRows: number; taskId: string }> {
    const maxRows =
      typeof maxRowsOrContext === "number" ? maxRowsOrContext : DEFAULT_REPORT_MAX_ROWS;
    const requestContext = typeof maxRowsOrContext === "number" ? context : maxRowsOrContext;

    const { task_id } = await this.submitReport(reportConfig, requestContext);
    const taskResult = await this.pollReport(task_id, requestContext);

    if (taskResult.status === "FAILED") {
      throw new McpError(JsonRpcErrorCode.InternalError, `Snapchat report task ${task_id} failed`);
    }

    if (!taskResult.download_url) {
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        `Snapchat report task ${task_id} completed but has no download URL`
      );
    }

    const reportData = await this.downloadReport(taskResult.download_url, maxRows, requestContext);

    return {
      ...reportData,
      taskId: task_id,
    };
  }

  /**
   * Get report with an insight-level breakdown (`report_dimension`): geo,
   * demographic, device or interest splits. The dimension is its own query
   * parameter, not a stats field. See `report-dimensions.ts` for the values.
   */
  async getReportBreakdowns(
    reportConfig: SnapchatReportConfig,
    reportDimension: ReportDimension,
    maxRowsOrContext: number | RequestContext = DEFAULT_REPORT_MAX_ROWS,
    context?: RequestContext
  ): Promise<{ rows: string[][]; headers: string[]; totalRows: number; taskId: string }> {
    return this.getReport(
      { ...reportConfig, report_dimension: reportDimension },
      maxRowsOrContext,
      context
    );
  }

  /**
   * The ad account's IANA timezone (e.g. "America/Los_Angeles"), read once per
   * session. Snap measures days in it, so date presets must be resolved in it.
   */
  private adAccountTimezone?: string;

  private async getAdAccountTimezone(context?: RequestContext): Promise<string> {
    if (this.adAccountTimezone) return this.adAccountTimezone;

    await this.rateLimiter.consume(`snapchat:default`);
    const response = (await this.httpClient.get(
      `/v1/adaccounts/${this.adAccountId}`,
      {},
      context
    )) as {
      adaccounts?: Array<{ sub_request_status?: string; adaccount?: { timezone?: unknown } }>;
    };

    const item = response.adaccounts?.find(
      (a) => a.sub_request_status === undefined || a.sub_request_status === "SUCCESS"
    );
    const timezone = item?.adaccount?.timezone;
    if (typeof timezone !== "string" || timezone.length === 0) {
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        `Could not read the timezone of Snapchat ad account ${this.adAccountId}. Snapchat measures days in the account's timezone, so a date preset cannot be resolved; pass explicit startTime/endTime on the account's day boundaries instead.`
      );
    }
    this.adAccountTimezone = timezone;
    return timezone;
  }

  /**
   * Resolve a date preset to the `start_time` / `end_time` Snap expects: local
   * midnight of the first day to local midnight after the last, in the ad
   * account's timezone.
   */
  async resolveDatePresetRange(
    preset: DatePreset,
    context?: RequestContext
  ): Promise<{ start_time: string; end_time: string }> {
    const timezone = await this.getAdAccountTimezone(context);
    return accountDayRange(resolveDatePreset(preset), timezone);
  }

  private normalizeReportStatus(status: string | undefined): ReportTaskStatus {
    switch (status?.toUpperCase()) {
      case "STARTED":
      case "RUNNING":
        return "RUNNING";
      case "COMPLETED":
        return "COMPLETE";
      case "FAILED":
        return "FAILED";
      default:
        return "PENDING";
    }
  }

  private mapDimensionType(dimensionType: SnapchatReportConfig["dimension_type"]): string {
    switch (dimensionType) {
      case "CAMPAIGN":
        return "campaign";
      case "AD_SQUAD":
        return "adsquad";
      case "AD":
        return "ad";
      default:
        throw new McpError(
          JsonRpcErrorCode.InvalidParams,
          `Unsupported Snapchat report dimension type: ${dimensionType}`
        );
    }
  }
}
