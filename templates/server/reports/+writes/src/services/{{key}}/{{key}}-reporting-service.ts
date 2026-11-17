// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import {
  DEFAULT_REPORT_DOWNLOAD_TIMEOUT_MS,
  DEFAULT_REPORT_MAX_SIZE_BYTES,
  McpError,
  JsonRpcErrorCode,
  fetchGuardedDownload,
  parseCSV,
} from "@cesteral/shared";
import type { RateLimiter, ReportStatus, RequestContext } from "@cesteral/shared";
import type { {{Pascal}}HttpClient } from "./{{key}}-http-client.js";

/**
 * The async report job: status and download. Submission is the governed
 * `{{key}}_submit_report` stub until implemented.
 *
 * TODO(scaffold): replace the status path and its mapping to ReportStatus,
 * and the download hosts, from the vendor's API reference.
 */
export class {{Pascal}}ReportingService {
  /**
   * Hosts a report file may be downloaded from, checked on the first URL and
   * every redirect (fetchGuardedDownload). The API host by default; add the
   * platform's file-storage host when its docs name one.
   */
  readonly downloadHosts: readonly string[];

  constructor(
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: {{Pascal}}HttpClient,
    private readonly logger: Logger,
    baseUrl: string
  ) {
    this.downloadHosts = [new URL(baseUrl).hostname];
  }

  async getReportStatus(
    accountId: string,
    reportId: string,
    context?: RequestContext
  ): Promise<ReportStatus & { rawStatus: string }> {
    await this.rateLimiter.consume(`{{key}}:user:${this.httpClient.quotaUser}:account:${accountId}`);
    const body = (await this.httpClient.get(
      `/accounts/${encodeURIComponent(accountId)}/report_jobs/${encodeURIComponent(reportId)}`,
      undefined,
      context
    )) as { status?: string; download_url?: string; error?: string };
    const rawStatus = body.status ?? "";
    const state =
      rawStatus === "DONE"
        ? "complete"
        : rawStatus === "FAILED"
          ? "failed"
          : rawStatus === "RUNNING"
            ? "running"
            : "pending";
    return {
      state,
      rawStatus,
      ...(body.download_url ? { downloadUrl: body.download_url } : {}),
      ...(body.error ? { errors: [body.error] } : {}),
    };
  }

  /** Fetch a finished report's CSV from the URL the status call returned. */
  async downloadReport(
    downloadUrl: string,
    maxRows: number,
    context: RequestContext | undefined,
    options: { includeRawCsv?: boolean } = {}
  ): Promise<{ rows: string[][]; headers: string[]; totalRows: number; rawCsv?: string }> {
    // An anonymous fetch of a platform-issued URL: every hop is checked
    // against downloadHosts, and credentials are dropped across origins.
    const response = await fetchGuardedDownload(downloadUrl, {
      timeoutMs: DEFAULT_REPORT_DOWNLOAD_TIMEOUT_MS,
      allowedHostSuffixes: this.downloadHosts,
      toolName: "{{key}}_download_report",
      context,
    });
    if (!response.ok) {
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        `Failed to download {{displayName}} report: ${response.status} ${response.statusText}`
      );
    }
    const size = Number(response.headers?.get("content-length") ?? 0);
    if (size > DEFAULT_REPORT_MAX_SIZE_BYTES) {
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        `{{displayName}} report too large (${size} bytes); narrow the date range or filters`
      );
    }
    const csv = (await response.text()).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
    if (csv === "") {
      return { rows: [], headers: [], totalRows: 0, ...(options.includeRawCsv ? { rawCsv: "" } : {}) };
    }
    const { headers, rows } = parseCSV(csv);
    this.logger.debug({ rows: rows.length }, "Downloaded report");
    return {
      rows: rows.slice(0, maxRows).map((r) => headers.map((h) => r[h] ?? "")),
      headers,
      totalRows: rows.length,
      ...(options.includeRawCsv ? { rawCsv: csv } : {}),
    };
  }
}
