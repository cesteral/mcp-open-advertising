// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { TikTokHttpClient } from "./tiktok-http-client.js";
import type { RateLimiter } from "@cesteral/shared";
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

/** TikTok report task status values this server recognizes. */
export type ReportTaskStatus = "PENDING" | "RUNNING" | "DONE" | "FAILED";

/**
 * TikTok `report/task/check/` response data.
 *
 * The official SDK spec (report_task_check.yml) maps only `status` and
 * `message` from this response — it documents no `task_id` echo and no
 * download URL. `download_url` is read best-effort in case TikTok returns one.
 */
interface ReportTaskCheckData {
  status?: string;
  message?: string;
  download_url?: string;
}

/** `report/task/create/` data_level values (official SDK enum ReportDataLevel). */
export const TIKTOK_REPORT_DATA_LEVELS = [
  "AUCTION_ADVERTISER",
  "AUCTION_CAMPAIGN",
  "AUCTION_ADGROUP",
  "AUCTION_AD",
  "RESERVATION_ADVERTISER",
  "RESERVATION_CAMPAIGN",
  "RESERVATION_ADGROUP",
  "RESERVATION_AD",
] as const;
export type TikTokReportDataLevel = (typeof TIKTOK_REPORT_DATA_LEVELS)[number];

/** `service_type` values (official SDK enum ReportServiceType). */
export const TIKTOK_REPORT_SERVICE_TYPES = ["AUCTION", "RESERVATION"] as const;
export type TikTokReportServiceType = (typeof TIKTOK_REPORT_SERVICE_TYPES)[number];

/** TikTok report configuration */
export interface TikTokReportConfig {
  report_type?: "BASIC" | "AUDIENCE" | "PLAYABLE_MATERIAL";
  /** Required by the spec's request rule (defaults to AUCTION, as the SDK does). */
  service_type?: TikTokReportServiceType;
  data_level?: TikTokReportDataLevel;
  dimensions: string[];
  metrics: string[];
  start_date: string;
  end_date: string;
  filtering?: Record<string, unknown>[];
  order_field?: string;
  order_type?: "ASC" | "DESC";
}

/** Canonical state for a TikTok report task, plus why it is terminal when unrecognized. */
export interface TikTokReportTaskState {
  state: "pending" | "running" | "complete" | "failed";
  errors?: string[];
}

/**
 * Map a raw `report/task/check/` status to a canonical state.
 *
 * TikTok's spec does not enumerate the status strings, so only the four this
 * server was written against are recognized. Anything else — including a
 * missing status — is TERMINAL (`failed`) with the raw value in `errors`.
 * The shared `fromTikTokStatus` maps unknown values to `pending`, which made
 * pollers wait out their full budget and `check_report_status` report
 * "pending" forever for a status nobody anticipated.
 */
export function mapTikTokReportTaskStatus(raw: {
  status?: string;
  message?: string;
}): TikTokReportTaskState {
  switch (raw.status) {
    case "PENDING":
      return { state: "pending" };
    case "RUNNING":
      return { state: "running" };
    case "DONE":
      return { state: "complete" };
    case "FAILED":
      return { state: "failed", ...(raw.message ? { errors: [raw.message] } : {}) };
    default:
      return {
        state: "failed",
        errors: [
          `Unrecognized TikTok report task status ${JSON.stringify(raw.status ?? null)}` +
            (raw.message ? ` (message: ${raw.message})` : "") +
            ". Treated as terminal rather than pending so it cannot be polled forever.",
        ],
      };
  }
}

/** Page size cap for `report/integrated/get/` (spec: page_size maximum 1000). */
const INTEGRATED_REPORT_MAX_PAGE_SIZE = 1000;

interface IntegratedReportData {
  list?: Array<Record<string, unknown>>;
  page_info?: { page?: number; page_size?: number; total_number?: number; total_page?: number };
}

/**
 * TikTok Reporting Service.
 *
 * Two paths, both from TikTok's official SDK spec:
 * - Synchronous: `GET report/integrated/get/` returns rows directly
 *   (`list` + `page_info`). Used by getReport / getReportBreakdowns.
 * - Async task: `POST report/task/create/` → `GET report/task/check/`. The
 *   spec documents only `status`/`message` on the check response — no download
 *   URL and no download endpoint — so the task path is exposed as submit +
 *   status check, and results are fetched only if TikTok supplies a URL.
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

    // Body per report_task_create.yml: report_type + dimensions are required;
    // service_type is required by the spec's request rule (SDK default AUCTION).
    // page/page_size are not fields of this body and are not sent.
    const result = (await this.httpClient.post(
      `/open_api/${this.apiVersion}/report/task/create/`,
      {
        report_type: reportConfig.report_type ?? "BASIC",
        service_type: reportConfig.service_type ?? "AUCTION",
        ...(reportConfig.data_level ? { data_level: reportConfig.data_level } : {}),
        dimensions: reportConfig.dimensions,
        metrics: reportConfig.metrics,
        start_date: reportConfig.start_date,
        end_date: reportConfig.end_date,
        ...(reportConfig.filtering ? { filtering: reportConfig.filtering } : {}),
        ...(reportConfig.order_field ? { order_field: reportConfig.order_field } : {}),
        ...(reportConfig.order_type ? { order_type: reportConfig.order_type } : {}),
      },
      context
    )) as { task_id: string };

    return result;
  }

  /**
   * Poll a report task until it reaches a terminal state. Unrecognized
   * statuses are terminal (see mapTikTokReportTaskStatus), so an unexpected
   * status string ends the poll immediately instead of timing out.
   */
  async pollReport(taskId: string, context?: RequestContext): Promise<ReportTaskCheckData> {
    this.logger.debug({ taskId, maxPollAttempts: this.maxPollAttempts }, "Starting report poll");

    try {
      return await pollUntilComplete<ReportTaskCheckData>({
        fetchStatus: async () => {
          await this.rateLimiter.consume(`tiktok:reporting`);
          return ((await this.httpClient.get(
            `/open_api/${this.apiVersion}/report/task/check/`,
            { task_id: taskId },
            context
          )) ?? {}) as ReportTaskCheckData;
        },
        isComplete: (r) => mapTikTokReportTaskStatus(r).state === "complete",
        isFailed: (r) => mapTikTokReportTaskStatus(r).state === "failed",
        initialDelayMs: this.pollIntervalMs,
        maxDelayMs: DEFAULT_REPORT_MAX_BACKOFF_MS,
        maxAttempts: this.maxPollAttempts,
      });
    } catch (err) {
      if (err instanceof ReportFailedError) {
        // Surface the terminal task payload to the caller.
        return err.status as ReportTaskCheckData;
      }
      throw err;
    }
  }

  /**
   * Single status check for a report task. No polling, no sleep.
   * The task id is echoed from the request — the spec's check response does
   * not return one.
   */
  async checkReportStatus(
    taskId: string,
    context?: RequestContext
  ): Promise<{
    taskId: string;
    status: string | undefined;
    message?: string;
    downloadUrl?: string;
  }> {
    await this.rateLimiter.consume(`tiktok:reporting`);

    const result = ((await this.httpClient.get(
      `/open_api/${this.apiVersion}/report/task/check/`,
      { task_id: taskId },
      context
    )) ?? {}) as ReportTaskCheckData;

    return {
      taskId,
      status: result.status,
      ...(result.message ? { message: result.message } : {}),
      ...(result.download_url ? { downloadUrl: result.download_url } : {}),
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
    const normalizedCsvText = csvText
      .replace(/^\uFEFF/, "")
      .replace(/\r\n/g, "\n")
      .trim();
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
    const rowArrays = limitedRecords.map((record) => headers.map((h) => record[h] ?? ""));

    return {
      rows: rowArrays,
      headers,
      totalRows: rows.length,
      ...(options.includeRawCsv ? { rawCsv: normalizedCsvText } : {}),
    };
  }

  /**
   * Run a report synchronously via `GET report/integrated/get/`, paging until
   * `maxRows` rows are collected or the last page is reached.
   *
   * This replaced a submit → poll → download chain that could not complete
   * against the spec: it waited for a `download_url` that report/task/check/
   * does not document, and TikTok's SDK defines no task download endpoint.
   * The integrated endpoint's response is spec'd (`list` ← stats_data,
   * `page_info`). Each row is `{ dimensions: {...}, metrics: {...} }`; both are
   * flattened into one record (a flat row is used as-is).
   */
  async getReport(
    reportConfig: TikTokReportConfig,
    maxRowsOrContext: number | RequestContext = DEFAULT_REPORT_MAX_ROWS,
    context?: RequestContext
  ): Promise<{ rows: string[][]; headers: string[]; totalRows: number }> {
    const maxRows =
      typeof maxRowsOrContext === "number" ? maxRowsOrContext : DEFAULT_REPORT_MAX_ROWS;
    const requestContext = typeof maxRowsOrContext === "number" ? context : maxRowsOrContext;
    const pageSize = Math.min(INTEGRATED_REPORT_MAX_PAGE_SIZE, Math.max(1, maxRows));

    const baseParams: Record<string, string> = {
      report_type: reportConfig.report_type ?? "BASIC",
      service_type: reportConfig.service_type ?? "AUCTION",
      ...(reportConfig.data_level ? { data_level: reportConfig.data_level } : {}),
      dimensions: JSON.stringify(reportConfig.dimensions),
      metrics: JSON.stringify(reportConfig.metrics),
      start_date: reportConfig.start_date,
      end_date: reportConfig.end_date,
      ...(reportConfig.filtering ? { filtering: JSON.stringify(reportConfig.filtering) } : {}),
      ...(reportConfig.order_field ? { order_field: reportConfig.order_field } : {}),
      ...(reportConfig.order_type ? { order_type: reportConfig.order_type } : {}),
      page_size: String(pageSize),
    };

    const records: Array<Record<string, unknown>> = [];
    let totalNumber: number | undefined;
    for (let page = 1; ; page++) {
      await this.rateLimiter.consume(`tiktok:reporting`);
      const data = ((await this.httpClient.get(
        `/open_api/${this.apiVersion}/report/integrated/get/`,
        { ...baseParams, page: String(page) },
        requestContext
      )) ?? {}) as IntegratedReportData;

      const list = Array.isArray(data.list) ? data.list : [];
      for (const item of list) {
        records.push(flattenIntegratedRow(item));
      }
      if (typeof data.page_info?.total_number === "number") {
        totalNumber = data.page_info.total_number;
      }
      const totalPage = data.page_info?.total_page;
      if (
        list.length === 0 ||
        records.length >= maxRows ||
        typeof totalPage !== "number" ||
        page >= totalPage
      ) {
        break;
      }
    }

    const headers = [...reportConfig.dimensions, ...reportConfig.metrics];
    for (const record of records) {
      for (const key of Object.keys(record)) {
        if (!headers.includes(key)) headers.push(key);
      }
    }
    const rows = records
      .slice(0, maxRows)
      .map((record) => headers.map((h) => stringifyCell(record[h])));

    return { rows, headers, totalRows: totalNumber ?? records.length };
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
  ): Promise<{ rows: string[][]; headers: string[]; totalRows: number }> {
    const configWithBreakdowns: TikTokReportConfig = {
      ...reportConfig,
      dimensions: [...reportConfig.dimensions, ...breakdowns],
    };

    return this.getReport(configWithBreakdowns, maxRowsOrContext, context);
  }
}

function flattenIntegratedRow(item: Record<string, unknown>): Record<string, unknown> {
  const dims = item.dimensions;
  const mets = item.metrics;
  const isObj = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);
  if (isObj(dims) || isObj(mets)) {
    return { ...(isObj(dims) ? dims : {}), ...(isObj(mets) ? mets : {}) };
  }
  return item;
}

function stringifyCell(value: unknown): string {
  if (value === undefined || value === null) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
