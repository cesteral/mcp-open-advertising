// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { PinterestHttpClient } from "./pinterest-http-client.js";
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

/** Pinterest report task status values (v5 `BulkReportingJobStatus`) */
export type ReportTaskStatus =
  | "IN_PROGRESS"
  | "FINISHED"
  | "FAILED"
  | "EXPIRED"
  | "DOES_NOT_EXIST"
  | "CANCELLED";

/** Report statuses after which the report will never become downloadable. */
export const TERMINAL_FAILED_REPORT_STATUSES: readonly string[] = [
  "FAILED",
  "EXPIRED",
  "DOES_NOT_EXIST",
  "CANCELLED",
];

/**
 * Pinterest report task check response (v5 `AdsAnalyticsGetAsyncResponse`).
 * It carries no `token` — the caller already holds it.
 */
interface ReportTaskCheckData {
  report_status: ReportTaskStatus;
  url?: string | null;
  size?: number | null;
}

/** Report type as exposed by this server's tools. */
export type PinterestReportType = "CAMPAIGN" | "AD_GROUP" | "AD" | "KEYWORD" | "ACCOUNT";

/**
 * Tool report type → v5 `MetricsReportingLevel`. Pinterest calls ads "pin
 * promotions" in reporting (the Ad schema's `summary_status` is a
 * `PinPromotionSummaryStatus`) and the account level `ADVERTISER`.
 */
const REPORT_LEVEL: Record<PinterestReportType, string> = {
  CAMPAIGN: "CAMPAIGN",
  AD_GROUP: "AD_GROUP",
  AD: "PIN_PROMOTION",
  KEYWORD: "KEYWORD",
  ACCOUNT: "ADVERTISER",
};

/**
 * Tool report type → the `*_TARGETING` level that `targeting_types` breakdowns
 * require. KEYWORD has no targeting variant in `MetricsReportingLevel`.
 */
const TARGETING_REPORT_LEVEL: Partial<Record<PinterestReportType, string>> = {
  CAMPAIGN: "CAMPAIGN_TARGETING",
  AD_GROUP: "AD_GROUP_TARGETING",
  AD: "PIN_PROMOTION_TARGETING",
  ACCOUNT: "ADVERTISER_TARGETING",
};

/** v5 `AdAdsAnalyticsAsyncTargetingTypes` — valid `targeting_types` breakdowns. */
export const PINTEREST_REPORT_TARGETING_TYPES = [
  "KEYWORD",
  "APPTYPE",
  "GENDER",
  "LOCATION",
  "PLACEMENT",
  "COUNTRY",
  "TARGETED_INTEREST",
  "PINNER_INTEREST",
  "AUDIENCE_INCLUDE",
  "GEO",
  "AGE_BUCKET",
  "REGION",
  "MEDIA_TYPE",
  "AGE_BUCKET_AND_GENDER",
  "AUDIENCE_MULTIPLIER",
  "CREATIVE_ENHANCEMENTS",
  "LOCAL_ADS_STORE_CODE",
] as const;

/** Pinterest report configuration */
export interface PinterestReportConfig {
  type?: PinterestReportType;
  columns: string[];
  start_date: string;
  end_date: string;
  granularity?: "TOTAL" | "DAY" | "HOUR" | "WEEK" | "MONTH";
  campaign_ids?: string[];
  ad_group_ids?: string[];
  ad_ids?: string[];
  /** Breakdowns; switches the level to the report type's `*_TARGETING` variant. */
  targeting_types?: string[];
}

/**
 * Build the v5 `AdsAnalyticsCreateAsyncRequest` body.
 *
 * - `level`, not `type` — `type` is not a field of the request.
 * - `report_format: "CSV"` — the default is JSON, and `downloadReport` parses CSV.
 * - `granularity` is required by the spec; defaults to DAY (the tools' default).
 * - `targeting_types` requires a level ending in `_TARGETING`.
 */
export function buildReportRequestBody(config: PinterestReportConfig): Record<string, unknown> {
  const reportType = config.type ?? "CAMPAIGN";
  const targetingTypes = config.targeting_types?.length ? config.targeting_types : undefined;
  let level: string;
  if (targetingTypes) {
    const targetingLevel = TARGETING_REPORT_LEVEL[reportType];
    if (!targetingLevel) {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `Pinterest has no targeting-breakdown report at the ${reportType} level; use CAMPAIGN, AD_GROUP, AD or ACCOUNT`,
        { reportType }
      );
    }
    level = targetingLevel;
  } else {
    level = REPORT_LEVEL[reportType];
  }

  return {
    level,
    report_format: "CSV",
    columns: config.columns,
    start_date: config.start_date,
    end_date: config.end_date,
    granularity: config.granularity ?? "DAY",
    ...(targetingTypes ? { targeting_types: targetingTypes } : {}),
    ...(config.campaign_ids ? { campaign_ids: config.campaign_ids } : {}),
    ...(config.ad_group_ids ? { ad_group_ids: config.ad_group_ids } : {}),
    ...(config.ad_ids ? { ad_ids: config.ad_ids } : {}),
  };
}

/**
 * Pinterest Reporting Service — Handles async reporting via Pinterest Marketing API v5.
 *
 * Pinterest reporting uses an async polling pattern:
 * 1. POST /v5/ad_accounts/{adAccountId}/reports (JSON body, `report_format: "CSV"`) → get token
 * 2. GET /v5/ad_accounts/{adAccountId}/reports?token={token} → poll until FINISHED
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
    const adAccountId = this.httpClient.accountId;

    const body = buildReportRequestBody(reportConfig);

    await this.rateLimiter.consume(`pinterest:reporting`);

    const result = (await this.httpClient.post(
      `/v5/ad_accounts/${adAccountId}/reports`,
      body,
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
        isFailed: (r) => TERMINAL_FAILED_REPORT_STATUSES.includes(r.report_status),
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

    // The GET response has no `token` field; the task id is the token we polled with.
    return {
      taskId,
      status: result.report_status,
      ...(result.url ? { downloadUrl: result.url } : {}),
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

    if (TERMINAL_FAILED_REPORT_STATUSES.includes(taskResult.report_status)) {
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
   * Get report with targeting breakdowns.
   *
   * Pinterest v5 breakdowns are not columns: they are `targeting_types` on a
   * report whose `level` is the `*_TARGETING` variant of the report type.
   */
  async getReportBreakdowns(
    reportConfig: PinterestReportConfig,
    breakdowns: string[],
    maxRowsOrContext: number | RequestContext = DEFAULT_REPORT_MAX_ROWS,
    context?: RequestContext
  ): Promise<{ rows: string[][]; headers: string[]; totalRows: number; taskId: string }> {
    const configWithBreakdowns: PinterestReportConfig = {
      ...reportConfig,
      targeting_types: breakdowns,
    };

    return this.getReport(configWithBreakdowns, maxRowsOrContext, context);
  }
}
