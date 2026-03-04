import type { TikTokHttpClient } from "./tiktok-http-client.js";
import type { RateLimiter } from "../../utils/security/rate-limiter.js";
import type { RequestContext } from "@cesteral/shared";
import { fetchWithTimeout } from "@cesteral/shared";

const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_ATTEMPTS = 30;

/** TikTok report task status values */
type ReportTaskStatus = "PENDING" | "RUNNING" | "DONE" | "FAILED";

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
    private readonly httpClient: TikTokHttpClient
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
      "/open_api/v1.3/report/task/create/",
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
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await this.rateLimiter.consume(`tiktok:reporting`);

      const result = (await this.httpClient.get(
        "/open_api/v1.3/report/task/check/",
        { task_id: taskId },
        context
      )) as ReportTaskCheckData;

      if (result.status === "DONE" || result.status === "FAILED") {
        return result;
      }

      // Wait before next poll
      await this.sleep(POLL_INTERVAL_MS);
    }

    throw new Error(
      `Report task ${taskId} did not complete after ${MAX_POLL_ATTEMPTS} polling attempts (${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s)`
    );
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
        `Failed to download TikTok report: ${response.status} ${response.statusText}`
      );
    }

    const csvText = await response.text();
    const lines = csvText.trim().split("\n");

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

    const reportData = await this.downloadReport(taskResult.download_url, 10_000, context);

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
