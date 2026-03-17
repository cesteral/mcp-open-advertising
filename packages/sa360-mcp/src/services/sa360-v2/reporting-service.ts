// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { SA360V2HttpClient } from "./sa360-v2-http-client.js";
import type { SA360AuthAdapter } from "../../auth/sa360-auth-adapter.js";
import type { RateLimiter } from "../../utils/security/rate-limiter.js";
import { fetchWithTimeout } from "@cesteral/shared";
import type { RequestContext } from "@cesteral/shared";

/**
 * Column definition for SA360 v2 async reports.
 */
export interface ReportColumn {
  columnName: string;
  headerText?: string;
}

/**
 * Report request for SA360 v2 async reporting.
 */
export interface ReportRequest {
  reportType: string;
  columns: ReportColumn[];
  timeRange: { startDate: string; endDate: string };
  statisticsCurrency?: string;
  filters?: Array<{ column: { columnName: string }; operator: string; values: string[] }>;
  includeRemovedEntities?: boolean;
  reportScope: {
    agencyId: string;
    advertiserId?: string;
  };
  maxRowsPerFile?: number;
  downloadFormat?: string;
}

/**
 * Report status response from SA360 v2 API.
 */
export interface ReportStatus {
  id: string;
  isReportReady: boolean;
  rowCount?: number;
  files?: Array<{ url: string; byteCount?: string }>;
}

/**
 * SA360 v2 Async Reporting Service
 *
 * Handles async report lifecycle via the legacy DoubleClick Search v2 API:
 * - Submit report request → returns report ID
 * - Poll report status → returns ready/pending + file URLs
 * - Download report → returns CSV data
 */
export class SA360ReportingService {
  constructor(
    private readonly logger: Logger,
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: SA360V2HttpClient,
    private readonly authAdapter: SA360AuthAdapter
  ) {}

  /**
   * Submit an async report request.
   *
   * POST /reports
   * Returns: { id: string }
   */
  async submitReport(
    reportRequest: ReportRequest,
    context?: RequestContext
  ): Promise<{ id: string }> {
    await this.rateLimiter.consume(`sa360v2:reports`);

    this.logger.debug(
      { reportType: reportRequest.reportType, agencyId: reportRequest.reportScope.agencyId },
      "Submitting SA360 async report"
    );

    const body = {
      reportType: reportRequest.reportType,
      columns: reportRequest.columns,
      timeRange: reportRequest.timeRange,
      statisticsCurrency: reportRequest.statisticsCurrency || "agency",
      reportScope: reportRequest.reportScope,
      maxRowsPerFile: reportRequest.maxRowsPerFile || 10000000,
      downloadFormat: reportRequest.downloadFormat || "csv",
      ...(reportRequest.filters && { filters: reportRequest.filters }),
      ...(reportRequest.includeRemovedEntities !== undefined && {
        includeRemovedEntities: reportRequest.includeRemovedEntities,
      }),
    };

    const result = await this.httpClient.fetch("/reports", context, {
      method: "POST",
      body: JSON.stringify(body),
    });

    const response = result as { id: string };
    this.logger.debug({ reportId: response.id }, "SA360 report submitted");
    return { id: response.id };
  }

  /**
   * Check the status of an async report.
   *
   * GET /reports/{reportId}
   * Returns: { id, isReportReady, rowCount?, files? }
   */
  async getReportStatus(
    reportId: string,
    context?: RequestContext
  ): Promise<ReportStatus> {
    await this.rateLimiter.consume(`sa360v2:reports`);

    this.logger.debug({ reportId }, "Checking SA360 report status");

    const result = await this.httpClient.fetch(`/reports/${reportId}`, context);

    const response = result as ReportStatus;
    return {
      id: response.id,
      isReportReady: response.isReportReady,
      rowCount: response.rowCount,
      files: response.files,
    };
  }

  /**
   * Download a report file by URL.
   *
   * GET {downloadUrl} with auth header
   * Returns: raw CSV string
   */
  async downloadReport(
    downloadUrl: string,
    context?: RequestContext
  ): Promise<string> {
    await this.rateLimiter.consume(`sa360v2:reports`);

    this.logger.debug({ downloadUrl }, "Downloading SA360 report");

    // Download URLs are absolute Google storage URLs — bypass httpClient
    // to avoid baseUrl prepending and JSON parsing of CSV responses.
    const accessToken = await this.authAdapter.getAccessToken();
    const response = await fetchWithTimeout(downloadUrl, 60_000, context, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to download SA360 report: ${response.status} ${response.statusText}`);
    }

    return response.text();
  }
}
