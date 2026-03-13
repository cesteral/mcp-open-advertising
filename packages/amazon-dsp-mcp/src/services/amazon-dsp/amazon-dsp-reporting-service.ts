import type { AmazonDspHttpClient } from "./amazon-dsp-http-client.js";
import type { RateLimiter } from "../../utils/security/rate-limiter.js";
import type { RequestContext } from "@cesteral/shared";
import { fetchWithTimeout } from "@cesteral/shared";
import type { Logger } from "pino";

/** Amazon DSP report task status values */
export type ReportTaskStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILURE";

/** Amazon DSP report task check response */
interface ReportTaskCheckData {
  reportId: string;
  status: ReportTaskStatus;
  url?: string;
  fileSize?: number;
}

/** Amazon DSP report configuration */
export interface AmazonDspReportConfig {
  name?: string;
  startDate: string;
  endDate: string;
  configuration: {
    adProduct?: string;
    groupBy: string[];
    columns: string[];
    reportTypeId: string;
    timeUnit?: "DAILY" | "SUMMARY";
    format?: "JSON" | "GZIP_JSON";
  };
}

/**
 * AmazonDsp Reporting Service — Handles async reporting via Amazon DSP Reporting API.
 *
 * Amazon DSP reporting uses an async polling pattern:
 * 1. POST /reporting/reports → get reportId
 * 2. GET /reporting/reports/{reportId} → poll until COMPLETED or FAILURE
 * 3. GET url (presigned) to retrieve report data
 */
export class AmazonDspReportingService {
  private static readonly MAX_BACKOFF_MS = 10_000;

  constructor(
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: AmazonDspHttpClient,
    private readonly logger: Logger,
    private readonly pollIntervalMs: number = 2_000,
    private readonly maxPollAttempts: number = 30
  ) {}

  /**
   * Submit a report task.
   * Returns the reportId for polling.
   */
  async submitReport(
    reportConfig: AmazonDspReportConfig,
    context?: RequestContext
  ): Promise<{ task_id: string }> {
    await this.rateLimiter.consume(`amazon_dsp:reporting`);

    const result = (await this.httpClient.post(
      "/reporting/reports",
      {
        name: reportConfig.name ?? "MCP Report",
        startDate: reportConfig.startDate,
        endDate: reportConfig.endDate,
        configuration: {
          adProduct: reportConfig.configuration.adProduct ?? "DSP",
          groupBy: reportConfig.configuration.groupBy,
          columns: reportConfig.configuration.columns,
          reportTypeId: reportConfig.configuration.reportTypeId,
          timeUnit: reportConfig.configuration.timeUnit ?? "DAILY",
          format: reportConfig.configuration.format ?? "JSON",
        },
      },
      context
    )) as { reportId: string; status: string };

    return { task_id: result.reportId };
  }

  /**
   * Poll a report task until it is COMPLETED or FAILURE.
   */
  async pollReport(
    taskId: string,
    context?: RequestContext
  ): Promise<ReportTaskCheckData> {
    this.logger.debug({ taskId, maxPollAttempts: this.maxPollAttempts }, "Starting report poll");

    for (let attempt = 0; attempt < this.maxPollAttempts; attempt++) {
      await this.rateLimiter.consume(`amazon_dsp:reporting`);

      const result = (await this.httpClient.get(
        `/reporting/reports/${taskId}`,
        undefined,
        context
      )) as ReportTaskCheckData;

      if (result.status === "COMPLETED" || result.status === "FAILURE") {
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
    return Math.min(this.pollIntervalMs * Math.pow(2, attempt), AmazonDspReportingService.MAX_BACKOFF_MS);
  }

  /**
   * Single status check for a report task. No polling, no sleep.
   * Returns current status and download URL if COMPLETED.
   */
  async checkReportStatus(
    taskId: string,
    context?: RequestContext
  ): Promise<{ taskId: string; status: ReportTaskStatus; downloadUrl?: string }> {
    await this.rateLimiter.consume(`amazon_dsp:reporting`);

    const result = (await this.httpClient.get(
      `/reporting/reports/${taskId}`,
      undefined,
      context
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
    maxRows = 10_000,
    context?: RequestContext
  ): Promise<{ rows: string[][]; headers: string[]; totalRows: number }> {
    const response = await fetchWithTimeout(downloadUrl, 60_000, context);

    if (!response.ok) {
      throw new Error(
        `Failed to download Amazon DSP report: ${response.status} ${response.statusText}`
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
    reportConfig: AmazonDspReportConfig,
    context?: RequestContext
  ): Promise<{ rows: string[][]; headers: string[]; totalRows: number; taskId: string }> {
    const { task_id } = await this.submitReport(reportConfig, context);
    const taskResult = await this.pollReport(task_id, context);

    if (taskResult.status === "FAILURE") {
      throw new Error(`Amazon DSP report task ${task_id} failed`);
    }

    if (!taskResult.url) {
      throw new Error(`Amazon DSP report task ${task_id} completed but has no download URL`);
    }

    const reportData = await this.downloadReport(taskResult.url, 10_000, context);

    return {
      ...reportData,
      taskId: task_id,
    };
  }

  /**
   * Get report with dimensional breakdowns.
   * Adds breakdown groupBy dimensions to the report config.
   */
  async getReportBreakdowns(
    reportConfig: AmazonDspReportConfig,
    breakdowns: string[],
    context?: RequestContext
  ): Promise<{ rows: string[][]; headers: string[]; totalRows: number; taskId: string }> {
    const configWithBreakdowns: AmazonDspReportConfig = {
      ...reportConfig,
      configuration: {
        ...reportConfig.configuration,
        groupBy: [...reportConfig.configuration.groupBy, ...breakdowns],
      },
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
