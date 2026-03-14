import type { Logger } from "pino";
import type { MsAdsHttpClient } from "./msads-http-client.js";
import { fetchWithTimeout } from "@cesteral/shared";
import type { RequestContext } from "@cesteral/shared";

/**
 * Microsoft Ads Reporting Service.
 *
 * Async reporting flow:
 * 1. SubmitGenerateReport → returns ReportRequestId
 * 2. PollGenerateReport → returns Status + ReportDownloadUrl
 * 3. Download CSV/TSV from ReportDownloadUrl
 */

interface SubmitReportResponse {
  ReportRequestId: string;
}

interface PollReportResponse {
  ReportRequestStatus: {
    ReportDownloadUrl?: string;
    Status: "Pending" | "InProgress" | "Success" | "Error";
  };
}

export interface ReportConfig {
  reportType: string;
  accountId: string;
  columns: string[];
  dateRange: {
    startDate: string;
    endDate: string;
  };
  aggregation?: string;
  filters?: Record<string, unknown>[];
}

export class MsAdsReportingService {
  constructor(
    private readonly httpClient: MsAdsHttpClient,
    private readonly logger: Logger,
    private readonly pollIntervalMs: number = 3_000,
    private readonly maxPollAttempts: number = 30
  ) {}

  /**
   * Submit a report request. Returns the ReportRequestId.
   */
  async submitReport(
    config: ReportConfig,
    context?: RequestContext
  ): Promise<string> {
    const body = this.buildReportRequest(config);
    this.logger.info({ reportType: config.reportType }, "Submitting report");

    const response = (await this.httpClient.post(
      "/Reports/Submit",
      body,
      context
    )) as SubmitReportResponse;

    return response.ReportRequestId;
  }

  /**
   * Poll for report completion. Returns download URL when ready.
   */
  async pollReport(
    reportRequestId: string,
    context?: RequestContext
  ): Promise<string> {
    this.logger.debug({ reportRequestId }, "Starting report poll");

    for (let attempt = 0; attempt < this.maxPollAttempts; attempt++) {
      const status = await this.checkReportStatus(reportRequestId, context);

      if (status.status === "Success" && status.downloadUrl) {
        this.logger.info({ reportRequestId, attempts: attempt + 1 }, "Report ready");
        return status.downloadUrl;
      }

      if (status.status === "Error") {
        throw new Error(
          `Microsoft Ads report failed: reportRequestId=${reportRequestId}`
        );
      }

      this.logger.debug(
        { reportRequestId, status: status.status, attempt },
        "Report not ready, polling"
      );

      await this.sleep(this.pollIntervalMs);
    }

    throw new Error(
      `Microsoft Ads report timed out after ${this.maxPollAttempts} attempts: reportRequestId=${reportRequestId}`
    );
  }

  /**
   * Single status check for a submitted report.
   */
  async checkReportStatus(
    reportRequestId: string,
    context?: RequestContext
  ): Promise<{ status: string; downloadUrl?: string }> {
    const response = (await this.httpClient.post(
      "/Reports/Poll",
      { ReportRequestId: reportRequestId },
      context
    )) as PollReportResponse;

    return {
      status: response.ReportRequestStatus.Status,
      downloadUrl: response.ReportRequestStatus.ReportDownloadUrl,
    };
  }

  /**
   * Download and parse a report from the download URL.
   */
  async downloadReport(
    downloadUrl: string,
    maxRows?: number,
    context?: RequestContext
  ): Promise<{ headers: string[]; rows: string[][] }> {
    this.logger.info({ downloadUrl: downloadUrl.substring(0, 80) }, "Downloading report");

    const response = await fetchWithTimeout(downloadUrl, 60_000, context);

    if (!response.ok) {
      throw new Error(
        `Failed to download report: ${response.status} ${response.statusText}`
      );
    }

    const text = await response.text();
    return this.parseCsv(text, maxRows);
  }

  /**
   * Full report flow: submit → poll → download (blocking).
   */
  async getReport(
    config: ReportConfig,
    maxRows?: number,
    context?: RequestContext
  ): Promise<{ headers: string[]; rows: string[][]; reportRequestId: string }> {
    const reportRequestId = await this.submitReport(config, context);
    const downloadUrl = await this.pollReport(reportRequestId, context);
    const data = await this.downloadReport(downloadUrl, maxRows, context);
    return { ...data, reportRequestId };
  }

  private buildReportRequest(config: ReportConfig): Record<string, unknown> {
    const request: Record<string, unknown> = {
      ReportName: `${config.reportType}_${Date.now()}`,
      Format: "Csv",
      ReturnOnlyCompleteData: false,
      Aggregation: config.aggregation ?? "Daily",
      Columns: config.columns,
      Scope: {
        AccountIds: [Number(config.accountId)],
      },
      Time: {
        CustomDateRangeStart: this.parseDate(config.dateRange.startDate),
        CustomDateRangeEnd: this.parseDate(config.dateRange.endDate),
      },
    };

    if (config.filters && config.filters.length > 0) {
      request.Filter = config.filters;
    }

    // Wrap in report-type-specific container
    return {
      ReportRequest: {
        Type: config.reportType,
        ...request,
      },
    };
  }

  private parseDate(dateStr: string): { Year: number; Month: number; Day: number } {
    const [year, month, day] = dateStr.split("-").map(Number);
    return { Year: year!, Month: month!, Day: day! };
  }

  private parseCsv(text: string, maxRows?: number): { headers: string[]; rows: string[][] } {
    // Microsoft Ads CSV reports may have metadata lines before the header
    const lines = text.split("\n").filter((line) => line.trim().length > 0);

    // Find the header line (skip lines that start with "@" or are metadata)
    let headerIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (!line.startsWith("@") && !line.startsWith('"@')) {
        headerIndex = i;
        break;
      }
    }

    if (lines.length <= headerIndex) {
      return { headers: [], rows: [] };
    }

    const headers = this.parseCsvLine(lines[headerIndex]!);
    const dataLines = lines.slice(headerIndex + 1);

    // Filter out summary/footer lines
    const dataRows = dataLines
      .filter((line) => !line.startsWith("©") && !line.startsWith('"©'))
      .map((line) => this.parseCsvLine(line));

    const limitedRows = maxRows ? dataRows.slice(0, maxRows) : dataRows;

    return { headers, rows: limitedRows };
  }

  private parseCsvLine(line: string): string[] {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i]!;

      if (inQuotes) {
        if (char === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ",") {
          fields.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
    }

    fields.push(current.trim());
    return fields;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
