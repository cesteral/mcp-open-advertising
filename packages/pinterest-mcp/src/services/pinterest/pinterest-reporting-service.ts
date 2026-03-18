// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { PinterestHttpClient } from "./pinterest-http-client.js";
import type { RateLimiter } from "../../utils/security/rate-limiter.js";
import type { RequestContext } from "@cesteral/shared";
import {
  fetchWithTimeout,
  DEFAULT_REPORT_MAX_BACKOFF_MS,
  DEFAULT_REPORT_POLL_INTERVAL_MS,
  DEFAULT_REPORT_MAX_POLL_ATTEMPTS,
  DEFAULT_REPORT_DOWNLOAD_TIMEOUT_MS,
  DEFAULT_REPORT_MAX_SIZE_BYTES,
  DEFAULT_REPORT_MAX_ROWS,
  REPORT_POLL_WARNING_THRESHOLD,
  delay,
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
  private static readonly MAX_BACKOFF_MS = DEFAULT_REPORT_MAX_BACKOFF_MS;

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
  async pollReport(
    taskId: string,
    context?: RequestContext
  ): Promise<ReportTaskCheckData> {
    this.logger.debug({ taskId, maxPollAttempts: this.maxPollAttempts }, "Starting report poll");

    const adAccountId = this.httpClient.accountId;

    for (let attempt = 0; attempt < this.maxPollAttempts; attempt++) {
      await this.rateLimiter.consume(`pinterest:reporting`);

      const result = (await this.httpClient.get(
        `/v5/ad_accounts/${adAccountId}/reports`,
        { token: taskId },
        context
      )) as ReportTaskCheckData;

      if (
        result.report_status === "FINISHED" ||
        result.report_status === "FAILED" ||
        result.report_status === "EXPIRED" ||
        result.report_status === "DOES_NOT_EXIST"
      ) {
        this.logger.debug({ taskId, status: result.report_status, attempt }, "Report poll complete");
        return result;
      }

      const attemptsRemaining = this.maxPollAttempts - attempt - 1;
      if (attemptsRemaining <= REPORT_POLL_WARNING_THRESHOLD) {
        this.logger.warn({ taskId, attemptsRemaining, status: result.report_status }, "Report poll nearing attempt limit");
      } else {
        this.logger.debug({ taskId, attempt, status: result.report_status }, "Report still pending, waiting");
      }

      // Wait before next poll (exponential backoff)
      await this.sleep(this.computeBackoff(attempt));
    }

    throw new Error(
      `Report task ${taskId} did not complete after ${this.maxPollAttempts} polling attempts`
    );
  }

  private computeBackoff(attempt: number): number {
    return Math.min(this.pollIntervalMs * Math.pow(2, attempt), PinterestReportingService.MAX_BACKOFF_MS);
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
   */
  async downloadReport(
    downloadUrl: string,
    maxRows = DEFAULT_REPORT_MAX_ROWS,
    context?: RequestContext
  ): Promise<{ rows: string[][]; headers: string[]; totalRows: number }> {
    const response = await fetchWithTimeout(downloadUrl, DEFAULT_REPORT_DOWNLOAD_TIMEOUT_MS, context);

    if (!response.ok) {
      throw new Error(
        `Failed to download Pinterest report: ${response.status} ${response.statusText}`
      );
    }

    const contentLength = response.headers?.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > DEFAULT_REPORT_MAX_SIZE_BYTES) {
      throw new Error(
        `Pinterest report too large (${contentLength} bytes, limit ${DEFAULT_REPORT_MAX_SIZE_BYTES}). Use more restrictive filters or date ranges.`
      );
    }

    let csvText = await response.text();
    // Strip BOM if present
    if (csvText.charCodeAt(0) === 0xFEFF) {
      csvText = csvText.slice(1);
    }
    const normalizedCsvText = csvText.replace(/\r\n/g, "\n").trim();

    if (normalizedCsvText.length === 0) {
      return { rows: [], headers: [], totalRows: 0 };
    }

    const lines = normalizedCsvText.split("\n");

    if (lines.length === 0) {
      return { rows: [], headers: [], totalRows: 0 };
    }

    const headers = parseCsvLine(lines[0]);
    const dataLines = lines.slice(1);
    const limitedLines = dataLines.slice(0, maxRows);
    const rows = limitedLines.map(parseCsvLine);

    return {
      rows,
      headers,
      totalRows: dataLines.length,
    };
  }

  /**
   * Full async report flow: submit → poll → download.
   */
  async getReport(
    reportConfig: PinterestReportConfig,
    context?: RequestContext
  ): Promise<{ rows: string[][]; headers: string[]; totalRows: number; taskId: string }> {
    const { task_id } = await this.submitReport(reportConfig, context);
    const taskResult = await this.pollReport(task_id, context);

    if (taskResult.report_status === "FAILED" || taskResult.report_status === "EXPIRED" || taskResult.report_status === "DOES_NOT_EXIST") {
      throw new Error(`Pinterest report task ${task_id} failed with status: ${taskResult.report_status}`);
    }

    if (!taskResult.url) {
      throw new Error(`Pinterest report task ${task_id} completed but has no download URL`);
    }

    const reportData = await this.downloadReport(taskResult.url, DEFAULT_REPORT_MAX_ROWS, context);

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
    context?: RequestContext
  ): Promise<{ rows: string[][]; headers: string[]; totalRows: number; taskId: string }> {
    const configWithBreakdowns: PinterestReportConfig = {
      ...reportConfig,
      columns: [...reportConfig.columns, ...breakdowns],
    };

    return this.getReport(configWithBreakdowns, context);
  }

  private sleep(ms: number): Promise<void> {
    return delay(ms);
  }
}

/**
 * Parse a single CSV line, handling quoted fields with commas.
 * Limitation: does not handle newlines within quoted fields, BOM characters,
 * or mixed quoting. Sufficient for Pinterest's machine-generated report output.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}
