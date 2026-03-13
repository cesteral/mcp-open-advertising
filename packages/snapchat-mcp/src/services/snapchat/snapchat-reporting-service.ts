import type { SnapchatHttpClient } from "./snapchat-http-client.js";
import type { RateLimiter } from "../../utils/security/rate-limiter.js";
import type { RequestContext } from "@cesteral/shared";
import { fetchWithTimeout } from "@cesteral/shared";
import type { Logger } from "pino";

/** Snapchat report task status values */
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
  granularity?: "DAY" | "HOUR" | "LIFETIME";
  start_time: string;
  end_time: string;
  filters?: SnapchatReportFilter[];
}

/**
 * Snapchat Reporting Service — Handles async reporting via Snapchat Ads API v1.
 *
 * Snapchat reporting uses an async polling pattern:
 * 1. POST /v1/adaccounts/{adAccountId}/stats/async_reporting → get report id
 * 2. GET /v1/adaccounts/{adAccountId}/stats/async_reports/{id} → poll until COMPLETE
 * 3. GET download URL to retrieve CSV report data
 */
export class SnapchatReportingService {
  private static readonly MAX_BACKOFF_MS = 10_000;

  constructor(
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: SnapchatHttpClient,
    private readonly adAccountId: string,
    private readonly logger: Logger,
    private readonly pollIntervalMs: number = 2_000,
    private readonly maxPollAttempts: number = 30
  ) {}

  /**
   * Submit a report task.
   * Returns the report id for polling.
   */
  async submitReport(
    reportConfig: SnapchatReportConfig,
    context?: RequestContext
  ): Promise<{ task_id: string }> {
    await this.rateLimiter.consume(`snapchat:reporting`);

    const result = (await this.httpClient.post(
      `/v1/adaccounts/${this.adAccountId}/stats/async_reporting`,
      {
        fields: reportConfig.fields,
        granularity: reportConfig.granularity ?? "DAY",
        start_time: reportConfig.start_time,
        end_time: reportConfig.end_time,
        ...(reportConfig.filters ? { filters: reportConfig.filters } : {}),
      },
      context
    )) as { request_status: string; async_stats_reports?: Array<{ id: string; status: string; download_url: string | null }> };

    const reportId = result.async_stats_reports?.[0]?.id;
    if (!reportId) {
      throw new Error("Snapchat async reporting: no report id returned from submit");
    }

    return { task_id: reportId };
  }

  /**
   * Poll a report task until it is COMPLETE or FAILED.
   */
  async pollReport(
    taskId: string,
    context?: RequestContext
  ): Promise<ReportTaskCheckData> {
    this.logger.debug({ taskId, maxPollAttempts: this.maxPollAttempts }, "Starting report poll");

    for (let attempt = 0; attempt < this.maxPollAttempts; attempt++) {
      await this.rateLimiter.consume(`snapchat:reporting`);

      const envelope = (await this.httpClient.get(
        `/v1/adaccounts/${this.adAccountId}/stats/async_reports/${taskId}`,
        undefined,
        context
      )) as { request_status: string; async_stats_report?: { id: string; status: string; download_url?: string } };

      const report = envelope.async_stats_report;
      if (!report) {
        throw new Error(`Snapchat report poll: unexpected response shape for task ${taskId}`);
      }

      const result: ReportTaskCheckData = {
        id: report.id,
        status: report.status as ReportTaskStatus,
        download_url: report.download_url,
      };

      if (result.status === "COMPLETE" || result.status === "FAILED") {
        this.logger.debug({ taskId, status: result.status, attempt }, "Report poll complete");
        return result;
      }

      const attemptsRemaining = this.maxPollAttempts - attempt - 1;
      if (attemptsRemaining <= 3) {
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
    return Math.min(this.pollIntervalMs * Math.pow(2, attempt), SnapchatReportingService.MAX_BACKOFF_MS);
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
      `/v1/adaccounts/${this.adAccountId}/stats/async_reports/${taskId}`,
      undefined,
      context
    )) as { request_status: string; async_stats_report?: { id: string; status: string; download_url?: string } };

    const report = envelope.async_stats_report;
    if (!report) {
      throw new Error(`Snapchat report status: unexpected response shape for task ${taskId}`);
    }

    return {
      taskId: report.id,
      status: report.status as ReportTaskStatus,
      downloadUrl: report.download_url,
    };
  }

  /**
   * Download a report CSV from a URL.
   */
  async downloadReport(
    downloadUrl: string,
    maxRows = 10_000,
    context?: RequestContext
  ): Promise<{ rows: string[][]; headers: string[]; totalRows: number }> {
    const response = await fetchWithTimeout(downloadUrl, 60_000, context);

    if (!response.ok) {
      throw new Error(
        `Failed to download Snapchat report: ${response.status} ${response.statusText}`
      );
    }

    const csvText = await response.text();
    const lines = csvText.replace(/\r\n/g, "\n").trim().split("\n");

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
    reportConfig: SnapchatReportConfig,
    context?: RequestContext
  ): Promise<{ rows: string[][]; headers: string[]; totalRows: number; taskId: string }> {
    const { task_id } = await this.submitReport(reportConfig, context);
    const taskResult = await this.pollReport(task_id, context);

    if (taskResult.status === "FAILED") {
      throw new Error(`Snapchat report task ${task_id} failed`);
    }

    if (!taskResult.download_url) {
      throw new Error(`Snapchat report task ${task_id} completed but has no download URL`);
    }

    const reportData = await this.downloadReport(taskResult.download_url, 10_000, context);

    return {
      ...reportData,
      taskId: task_id,
    };
  }

  /**
   * Get report with dimensional breakdowns.
   * Adds breakdown fields to the report config.
   */
  async getReportBreakdowns(
    reportConfig: SnapchatReportConfig,
    breakdowns: string[],
    context?: RequestContext
  ): Promise<{ rows: string[][]; headers: string[]; totalRows: number; taskId: string }> {
    const configWithBreakdowns: SnapchatReportConfig = {
      ...reportConfig,
      fields: [...reportConfig.fields, ...breakdowns],
    };

    return this.getReport(configWithBreakdowns, context);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
