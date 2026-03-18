// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { TikTokHttpClient } from "./tiktok-http-client.js";
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
  private static readonly MAX_BACKOFF_MS = DEFAULT_REPORT_MAX_BACKOFF_MS;

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

    for (let attempt = 0; attempt < this.maxPollAttempts; attempt++) {
      await this.rateLimiter.consume(`tiktok:reporting`);

      const result = (await this.httpClient.get(
        `/open_api/${this.apiVersion}/report/task/check/`,
        { task_id: taskId },
        context
      )) as ReportTaskCheckData;

      if (result.status === "DONE" || result.status === "FAILED") {
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
      await this.sleep(this.computeBackoff(attempt));
    }

    throw new Error(
      `Report task ${taskId} did not complete after ${this.maxPollAttempts} polling attempts`
    );
  }

  private computeBackoff(attempt: number): number {
    return Math.min(this.pollIntervalMs * Math.pow(2, attempt), TikTokReportingService.MAX_BACKOFF_MS);
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
   */
  async downloadReport(
    downloadUrl: string,
    maxRows = DEFAULT_REPORT_MAX_ROWS,
    context?: RequestContext
  ): Promise<{ rows: string[][]; headers: string[]; totalRows: number }> {
    const response = await fetchWithTimeout(downloadUrl, DEFAULT_REPORT_DOWNLOAD_TIMEOUT_MS, context);

    if (!response.ok) {
      throw new Error(
        `Failed to download TikTok report: ${response.status} ${response.statusText}`
      );
    }

    const contentLength = response.headers?.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > DEFAULT_REPORT_MAX_SIZE_BYTES) {
      throw new Error(
        `TikTok report too large (${contentLength} bytes, limit ${DEFAULT_REPORT_MAX_SIZE_BYTES}). Use more restrictive filters or date ranges.`
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
    reportConfig: TikTokReportConfig,
    context?: RequestContext
  ): Promise<{ rows: string[][]; headers: string[]; totalRows: number; taskId: string }> {
    const { task_id } = await this.submitReport(reportConfig, context);
    const taskResult = await this.pollReport(task_id, context);

    if (taskResult.status === "FAILED") {
      throw new Error(`TikTok report task ${task_id} failed`);
    }

    if (!taskResult.download_url) {
      throw new Error(`TikTok report task ${task_id} completed but has no download URL`);
    }

    const reportData = await this.downloadReport(taskResult.download_url, DEFAULT_REPORT_MAX_ROWS, context);

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
    context?: RequestContext
  ): Promise<{ rows: string[][]; headers: string[]; totalRows: number; taskId: string }> {
    const configWithBreakdowns: TikTokReportConfig = {
      ...reportConfig,
      dimensions: [...reportConfig.dimensions, ...breakdowns],
    };

    return this.getReport(configWithBreakdowns, context);
  }

  private sleep(ms: number): Promise<void> {
    return delay(ms);
  }
}

/**
 * Parse a single CSV line, handling quoted fields with commas.
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
