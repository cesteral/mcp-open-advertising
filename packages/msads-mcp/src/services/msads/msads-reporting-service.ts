// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { inflateRawSync } from "node:zlib";
import type { Logger } from "pino";
import type { RateLimiter } from "@cesteral/shared";
import type { MsAdsHttpClient } from "./msads-http-client.js";
import {
  fetchWithTimeout,
  McpError,
  JsonRpcErrorCode,
  parseCSV,
  pollUntilComplete,
  ReportFailedError,
  DEFAULT_REPORT_DOWNLOAD_TIMEOUT_MS,
  type RequestContext,
} from "@cesteral/shared";
import { MSADS_READ_KEY, MSADS_WRITE_KEY } from "./rate-limit-keys.js";

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

const POLL_BASE_MS = 3_000;
const POLL_MAX_MS = 30_000;
const DEFAULT_MAX_POLL_ATTEMPTS = 60;

export class MsAdsReportingService {
  constructor(
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: MsAdsHttpClient,
    private readonly logger: Logger,
    private readonly maxPollAttempts: number = DEFAULT_MAX_POLL_ATTEMPTS,
    private readonly pollIntervalMs: number = POLL_BASE_MS
  ) {}

  /**
   * Submit a report request. Returns the ReportRequestId.
   */
  async submitReport(config: ReportConfig, context?: RequestContext): Promise<string> {
    await this.rateLimiter.consume(MSADS_WRITE_KEY, 3);
    const body = this.buildReportRequest(config);
    this.logger.info({ reportType: config.reportType }, "Submitting report");

    const response = (await this.httpClient.post(
      "/GenerateReport/Submit",
      body,
      context
    )) as SubmitReportResponse;

    return response.ReportRequestId;
  }

  /**
   * Poll for report completion. Returns download URL when ready.
   */
  async pollReport(reportRequestId: string, context?: RequestContext): Promise<string> {
    this.logger.debug({ reportRequestId }, "Starting report poll");

    try {
      const status = await pollUntilComplete<{ status: string; downloadUrl?: string }>({
        fetchStatus: async () => this.checkReportStatus(reportRequestId, context),
        isComplete: (s) => s.status === "Success" && !!s.downloadUrl,
        isFailed: (s) => s.status === "Error",
        initialDelayMs: this.pollIntervalMs,
        maxDelayMs: POLL_MAX_MS,
        maxAttempts: this.maxPollAttempts,
      });
      this.logger.info({ reportRequestId }, "Report ready");
      return status.downloadUrl!;
    } catch (err) {
      if (err instanceof ReportFailedError) {
        throw new McpError(
          JsonRpcErrorCode.InternalError,
          `Microsoft Ads report failed: reportRequestId=${reportRequestId}`
        );
      }
      throw err;
    }
  }

  /**
   * Single status check for a submitted report.
   */
  async checkReportStatus(
    reportRequestId: string,
    context?: RequestContext
  ): Promise<{ status: string; downloadUrl?: string }> {
    await this.rateLimiter.consume(MSADS_READ_KEY);
    const response = (await this.httpClient.post(
      "/GenerateReport/Poll",
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
    context?: RequestContext,
    options: { includeRawCsv?: boolean } = {}
  ): Promise<{ headers: string[]; rows: string[][]; totalRows: number; rawCsv?: string }> {
    this.logger.info({ downloadUrl: downloadUrl.substring(0, 80) }, "Downloading report");

    const response = await fetchWithTimeout(
      downloadUrl,
      DEFAULT_REPORT_DOWNLOAD_TIMEOUT_MS,
      context
    );

    if (!response.ok) {
      throw new McpError(
        JsonRpcErrorCode.ServiceUnavailable,
        `Failed to download report: ${response.status} ${response.statusText}`
      );
    }

    // Microsoft Advertising delivers the report body as a ZIP archive, not raw
    // CSV. Reading it with `response.text()` yields the archive's raw bytes
    // (headers begin with the ZIP magic "PK"), so detect ZIP framing and inflate
    // the single CSV entry before parsing. Non-ZIP bodies are decoded as UTF-8.
    const buffer = Buffer.from(await response.arrayBuffer());
    const text = isZipArchive(buffer) ? inflateSingleZipEntry(buffer) : buffer.toString("utf-8");
    const parsed = this.parseCsv(text, maxRows);
    return options.includeRawCsv ? { ...parsed, rawCsv: text } : parsed;
  }

  /**
   * Full report flow: submit → poll → download (blocking).
   */
  async getReport(
    config: ReportConfig,
    maxRows?: number,
    context?: RequestContext
  ): Promise<{ headers: string[]; rows: string[][]; totalRows: number; reportRequestId: string }> {
    const reportRequestId = await this.submitReport(config, context);
    const downloadUrl = await this.pollReport(reportRequestId, context);
    const data = await this.downloadReport(downloadUrl, maxRows, context);
    return { ...data, reportRequestId };
  }

  // ── Scheduling ──────────────────────────────────────────────────────────

  /**
   * Create a scheduled report request via SubmitGenerateReport with a ScheduledReportRequest body.
   * Returns the schedule ID (same as the ReportRequestId for the first run).
   */
  async createReportSchedule(
    config: ReportConfig & { scheduleName: string; schedule: Record<string, unknown> },
    context?: RequestContext
  ): Promise<{ scheduleId: string; scheduleName: string }> {
    await this.rateLimiter.consume(MSADS_WRITE_KEY, 3);

    const baseRequest = this.buildReportRequest(config).ReportRequest as Record<string, unknown>;
    const body = {
      ReportRequest: {
        ...baseRequest,
        ReportName: config.scheduleName,
        Schedule: config.schedule,
      },
    };

    this.logger.info({ scheduleName: config.scheduleName }, "Creating MS Ads report schedule");

    const response = (await this.httpClient.post(
      "/GenerateReport/Submit",
      body,
      context
    )) as SubmitReportResponse;

    this.logger.info(
      { scheduleId: response.ReportRequestId, scheduleName: config.scheduleName },
      "MS Ads report schedule created"
    );

    return { scheduleId: response.ReportRequestId, scheduleName: config.scheduleName };
  }

  /**
   * List scheduled reports. MS Ads does not have a native schedule list endpoint,
   * so we use PollReports to list active scheduled report IDs known by the session.
   * Returns an informational message directing users to use the UI or check known scheduleIds.
   */
  async listReportSchedules(context?: RequestContext): Promise<{ note: string }> {
    void context;
    return {
      note: "Microsoft Advertising does not provide an API to list all report schedules. Use the Microsoft Advertising UI (app.ads.microsoft.com) to view existing scheduled reports, or track scheduleIds returned by msads_create_report_schedule.",
    };
  }

  /**
   * Delete a scheduled report by cancelling the report request.
   * MS Ads does not have a dedicated schedule-delete endpoint; the schedule is cancelled
   * by stopping the associated report request via the UI. This method logs the intent.
   */
  async deleteReportSchedule(scheduleId: string, context?: RequestContext): Promise<void> {
    void context;
    this.logger.info(
      { scheduleId },
      "MS Ads report schedule deletion requested — cancel via Microsoft Advertising UI"
    );
    // The Microsoft Advertising v13 JSON API does not expose a delete/cancel endpoint for scheduled reports.
    // Deletion must be performed via the Microsoft Advertising web UI.
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `Invalid date format: "${dateStr}". Expected YYYY-MM-DD.`
      );
    }
    const [year, month, day] = dateStr.split("-").map(Number);
    return { Year: year!, Month: month!, Day: day! };
  }

  private parseCsv(
    text: string,
    maxRows?: number
  ): { headers: string[]; rows: string[][]; totalRows: number } {
    // Microsoft Ads CSV reports carry metadata rows around the tabular data:
    // `@`-prefixed lines and a `©` footer, plus quoted key/value lines
    // ("Report Name: ...", etc.) ahead of the column header. Strip all of them
    // before handing off to the shared parser so none are read as data rows.
    const stripped = text.replace(/^\uFEFF/, "");
    let headerSeen = false;
    const filtered = stripped
      .split(/\r?\n/)
      .filter((line) => {
        const trimmed = line.trim();
        if (trimmed.length === 0) return false;
        if (trimmed.startsWith("@") || trimmed.startsWith('"@')) return false;
        if (trimmed.startsWith("©") || trimmed.startsWith('"©')) return false;
        // Quoted metadata rows ("Report Name: ...", "Report Time: ...",
        // "Time Zone: ...") precede the header. Only strip them before the
        // header is seen so a data value containing ": " is never dropped.
        if (!headerSeen && /^"[A-Za-z ]+:\s/.test(trimmed)) return false;
        headerSeen = true;
        return true;
      })
      .join("\n");
    if (filtered === "") {
      return { headers: [], rows: [], totalRows: 0 };
    }

    const { headers, rows: recordRows } = parseCSV(filtered);
    const rows = recordRows.map((record) => headers.map((h) => record[h] ?? ""));
    const totalRows = rows.length;
    const limitedRows = maxRows ? rows.slice(0, maxRows) : rows;
    return { headers, rows: limitedRows, totalRows };
  }
}

// ── ZIP handling ────────────────────────────────────────────────────────────
// Microsoft Advertising returns the report body as a ZIP archive containing a
// single CSV. Node has no built-in ZIP reader, so we parse the archive directly
// and inflate the entry with `node:zlib` — avoiding a runtime dependency.

const ZIP_LOCAL_FILE_SIG = 0x04034b50;
const ZIP_CENTRAL_DIR_SIG = 0x02014b50;
const ZIP_EOCD_SIG = 0x06054b50;

/** Detect a ZIP archive by its local-file-header magic bytes ("PK\x03\x04"). */
function isZipArchive(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.readUInt32LE(0) === ZIP_LOCAL_FILE_SIG;
}

/**
 * Extract and decode the first entry of a single-file ZIP archive.
 *
 * Reads the End-Of-Central-Directory record and the first central-directory
 * header (which always carry the correct compressed size and local-header
 * offset, even when the local header defers sizes to a data descriptor), then
 * inflates the stored/deflated bytes and decodes them as UTF-8.
 */
function inflateSingleZipEntry(buffer: Buffer): string {
  // Locate the End-Of-Central-Directory record by scanning backward for its
  // signature (the record is 22 bytes when there is no archive comment).
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === ZIP_EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) {
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      "Malformed report archive: ZIP end-of-central-directory record not found"
    );
  }

  const centralDirOffset = buffer.readUInt32LE(eocd + 16);
  if (buffer.readUInt32LE(centralDirOffset) !== ZIP_CENTRAL_DIR_SIG) {
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      "Malformed report archive: ZIP central-directory header not found"
    );
  }

  const method = buffer.readUInt16LE(centralDirOffset + 10);
  const compressedSize = buffer.readUInt32LE(centralDirOffset + 20);
  const localHeaderOffset = buffer.readUInt32LE(centralDirOffset + 42);

  if (buffer.readUInt32LE(localHeaderOffset) !== ZIP_LOCAL_FILE_SIG) {
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      "Malformed report archive: ZIP local-file header not found"
    );
  }

  const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
  const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
  const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

  let decoded: Buffer;
  if (method === 0) {
    decoded = Buffer.from(compressed); // stored, no compression
  } else if (method === 8) {
    decoded = inflateRawSync(compressed); // deflate
  } else {
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      `Unsupported ZIP compression method in report archive: ${method}`
    );
  }

  return decoded.toString("utf-8");
}
