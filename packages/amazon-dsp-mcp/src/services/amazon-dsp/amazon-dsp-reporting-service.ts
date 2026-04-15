// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { AmazonDspHttpClient } from "./amazon-dsp-http-client.js";
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
  REPORT_POLL_WARNING_THRESHOLD,
  delay,
  parseCsvLine,
  computeExponentialBackoff,
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
  private static readonly MAX_BACKOFF_MS = DEFAULT_REPORT_MAX_BACKOFF_MS;

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
          adProduct: reportConfig.configuration.adProduct ?? AMAZON_DSP_REPORTING_CONTRACT.defaultAdProduct,
          groupBy: reportConfig.configuration.groupBy,
          columns: reportConfig.configuration.columns,
          reportTypeId: reportConfig.configuration.reportTypeId,
          timeUnit: reportConfig.configuration.timeUnit ?? AMAZON_DSP_REPORTING_CONTRACT.defaultTimeUnit,
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
    this.logger.debug({ accountId, taskId, maxPollAttempts: this.maxPollAttempts }, "Starting report poll");

    const path = AMAZON_DSP_REPORTING_CONTRACT.statusPathTemplate
      .replace("{accountId}", encodeURIComponent(accountId))
      .replace("{reportId}", encodeURIComponent(taskId));

    for (let attempt = 0; attempt < this.maxPollAttempts; attempt++) {
      await this.rateLimiter.consume(`amazon_dsp:reporting`);

      const result = (await this.httpClient.get(
        path,
        undefined,
        context,
        AMAZON_DSP_REPORTING_CONTRACT.statusAcceptMediaType
      )) as ReportTaskCheckData;

      if (result.status === "COMPLETED" || result.status === "FAILED") {
        this.logger.debug({ taskId, status: result.status, attempt }, "Report poll complete");
        return result;
      }

      const attemptsRemaining = this.maxPollAttempts - attempt - 1;
      if (attemptsRemaining <= REPORT_POLL_WARNING_THRESHOLD) {
        this.logger.warn({ taskId, attemptsRemaining, status: result.status }, "Report poll nearing attempt limit");
      } else {
        this.logger.debug({ taskId, attempt, status: result.status }, "Report still pending, waiting");
      }

      // Wait before next poll (exponential backoff)
      await delay(computeExponentialBackoff(attempt, this.pollIntervalMs, AmazonDspReportingService.MAX_BACKOFF_MS));
    }

    throw new McpError(
      JsonRpcErrorCode.Timeout,
      `Report task ${taskId} did not complete after ${this.maxPollAttempts} polling attempts`
    );
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
   */
  async downloadReport(
    downloadUrl: string,
    maxRows = DEFAULT_REPORT_MAX_ROWS,
    context?: RequestContext
  ): Promise<{ rows: string[][]; headers: string[]; totalRows: number }> {
    const response = await fetchWithTimeout(downloadUrl, DEFAULT_REPORT_DOWNLOAD_TIMEOUT_MS, context);

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

    if (looksLikeJson) {
      const parsed = JSON.parse(text) as Record<string, unknown>[];
      const data = Array.isArray(parsed) ? parsed : [parsed];
      if (data.length === 0) {
        return { rows: [], headers: [], totalRows: 0 };
      }
      const headers = Object.keys(data[0]);
      const totalRows = data.length;
      const limitedData = data.slice(0, maxRows);
      const rows = limitedData.map((row) => headers.map((h) => String(row[h] ?? "")));
      return { rows, headers, totalRows };
    }

    // CSV/TSV fallback
    const lines = text.replace(/\r\n/g, "\n").trim().split("\n");
    if (lines.length === 0) {
      return { rows: [], headers: [], totalRows: 0 };
    }
    const headers = parseCsvLine(lines[0]);
    const dataLines = lines.slice(1);
    const limitedLines = dataLines.slice(0, maxRows);
    const rows = limitedLines.map(parseCsvLine);
    return { rows, headers, totalRows: dataLines.length };
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
    const maxRows = typeof maxRowsOrContext === "number" ? maxRowsOrContext : DEFAULT_REPORT_MAX_ROWS;
    const requestContext = typeof maxRowsOrContext === "number" ? context : maxRowsOrContext;

    const { taskId } = await this.submitReport(accountId, reportConfig, requestContext);
    const taskResult = await this.pollReport(accountId, taskId, requestContext);

    if (taskResult.status === "FAILED") {
      throw new McpError(JsonRpcErrorCode.InternalError, `Amazon DSP report task ${taskId} failed`);
    }

    if (!taskResult.url) {
      throw new McpError(JsonRpcErrorCode.InternalError, `Amazon DSP report task ${taskId} completed but has no download URL`);
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
