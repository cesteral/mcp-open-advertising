// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { CM360HttpClient } from "./cm360-http-client.js";
import type { RateLimiter } from "../../utils/security/rate-limiter.js";
import {
  DEFAULT_REPORT_MAX_BACKOFF_MS,
  DEFAULT_REPORT_POLL_INTERVAL_MS,
  pollUntilComplete,
  ReportFailedError,
  type RequestContext,
} from "@cesteral/shared";
import { McpError, JsonRpcErrorCode } from "../../utils/errors/index.js";

export interface CM360ReportConfig {
  name: string;
  type: string;
  criteria?: Record<string, unknown>;
  schedule?: Record<string, unknown>;
  delivery?: Record<string, unknown>;
  [key: string]: unknown;
}

export class CM360ReportingService {
  constructor(
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: CM360HttpClient,
    private readonly logger: Logger,
    private readonly pollIntervalMs: number = DEFAULT_REPORT_POLL_INTERVAL_MS,
    private readonly maxPollAttempts: number = 60
  ) {}

  async runReport(
    profileId: string,
    config: CM360ReportConfig,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume("cm360");

    // Step 1: Create report
    const report = (await this.httpClient.fetch(
      `/userprofiles/${profileId}/reports`,
      context,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      }
    )) as Record<string, unknown>;

    const reportId = report.id as string;

    this.logger.info(
      { reportId, requestId: context?.requestId },
      "CM360 report created"
    );

    // Step 2: Run report
    await this.rateLimiter.consume("cm360");
    const file = (await this.httpClient.fetch(
      `/userprofiles/${profileId}/reports/${reportId}/run`,
      context,
      { method: "POST" }
    )) as Record<string, unknown>;

    const fileId = file.id as string;

    this.logger.info(
      { reportId, fileId, requestId: context?.requestId },
      "CM360 report execution started — polling for results"
    );

    // Step 3: Poll for completion
    const completedFile = await this.pollReportFile(
      profileId,
      reportId,
      fileId,
      context
    );

    const urls = (completedFile as Record<string, unknown>).urls as Record<string, string> | undefined;
    const downloadUrl = urls?.apiUrl;

    return { reportId, fileId, file: completedFile, downloadUrl };
  }

  async createReport(
    profileId: string,
    config: CM360ReportConfig,
    context?: RequestContext
  ): Promise<{ reportId: string; fileId: string }> {
    await this.rateLimiter.consume("cm360");

    const report = (await this.httpClient.fetch(
      `/userprofiles/${profileId}/reports`,
      context,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      }
    )) as Record<string, unknown>;

    const reportId = report.id as string;

    // Run it (non-blocking — don't poll)
    await this.rateLimiter.consume("cm360");
    const file = (await this.httpClient.fetch(
      `/userprofiles/${profileId}/reports/${reportId}/run`,
      context,
      { method: "POST" }
    )) as Record<string, unknown>;

    const fileId = file.id as string;

    this.logger.info(
      { reportId, fileId, requestId: context?.requestId },
      "CM360 report submitted (non-blocking)"
    );

    return { reportId, fileId };
  }

  async checkReportFile(
    profileId: string,
    reportId: string,
    fileId: string,
    context?: RequestContext
  ): Promise<{
    reportId: string;
    fileId: string;
    status: string;
    file: Record<string, unknown>;
    downloadUrl?: string;
  }> {
    await this.rateLimiter.consume("cm360");

    const file = (await this.httpClient.fetch(
      `/userprofiles/${profileId}/reports/${reportId}/files/${fileId}`,
      context
    )) as Record<string, unknown>;

    const status = (file.status as string) || "PROCESSING";
    const urls = file.urls as Record<string, string> | undefined;
    const downloadUrl = urls?.apiUrl;

    return { reportId, fileId, status, file, downloadUrl };
  }

  private async pollReportFile(
    profileId: string,
    reportId: string,
    fileId: string,
    context?: RequestContext
  ): Promise<unknown> {
    try {
      return await pollUntilComplete<Record<string, unknown>>({
        fetchStatus: async () => {
          await this.rateLimiter.consume("cm360");
          return (await this.httpClient.fetch(
            `/userprofiles/${profileId}/reports/${reportId}/files/${fileId}`,
            context
          )) as Record<string, unknown>;
        },
        isComplete: (file) => (file.status as string) === "REPORT_AVAILABLE",
        isFailed: (file) => {
          const s = file.status as string;
          return s === "FAILED" || s === "CANCELLED";
        },
        initialDelayMs: this.pollIntervalMs,
        maxDelayMs: DEFAULT_REPORT_MAX_BACKOFF_MS,
        maxAttempts: this.maxPollAttempts,
      });
    } catch (err) {
      if (err instanceof ReportFailedError) {
        const file = err.status as Record<string, unknown>;
        throw new McpError(
          JsonRpcErrorCode.InternalError,
          `CM360 report ${String(file.status).toLowerCase()}`,
          { reportId, fileId, status: file.status, file }
        );
      }
      throw err;
    }
  }

  async downloadReportFile(
    downloadUrl: string,
    timeoutMs: number = 30_000,
    context?: RequestContext
  ): Promise<Response> {
    return this.httpClient.fetchRaw(downloadUrl, timeoutMs, context, {
      method: "GET",
    });
  }

  // ── Scheduling ────────────────────────────────────────────────────────────

  /**
   * Create a report with an embedded schedule (recurring or one-off with schedule).
   * CM360 schedules are stored as properties on the report resource itself.
   * Returns the reportId which serves as the schedule handle.
   */
  async createReportSchedule(
    profileId: string,
    config: CM360ReportConfig & { schedule: Record<string, unknown> },
    context?: RequestContext
  ): Promise<{ reportId: string; reportName: string; schedule: Record<string, unknown> }> {
    await this.rateLimiter.consume("cm360");

    const report = (await this.httpClient.fetch(
      `/userprofiles/${profileId}/reports`,
      context,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      }
    )) as Record<string, unknown>;

    this.logger.info(
      { reportId: report.id, requestId: context?.requestId },
      "CM360 scheduled report created"
    );

    return {
      reportId: report.id as string,
      reportName: report.name as string,
      schedule: (report.schedule as Record<string, unknown>) ?? config.schedule,
    };
  }

  /**
   * List CM360 reports that have an active schedule.
   */
  async listReportSchedules(
    profileId: string,
    options: { maxResults?: number; pageToken?: string } = {},
    context?: RequestContext
  ): Promise<{ reports: Record<string, unknown>[]; nextPageToken?: string }> {
    await this.rateLimiter.consume("cm360");

    const params = new URLSearchParams({ scope: "ALL" });
    if (options.maxResults) params.set("maxResults", String(options.maxResults));
    if (options.pageToken) params.set("pageToken", options.pageToken);

    const result = (await this.httpClient.fetch(
      `/userprofiles/${profileId}/reports?${params}`,
      context
    )) as Record<string, unknown>;

    const items = (result.items as Record<string, unknown>[]) ?? [];
    // Return only reports that have a schedule object
    const scheduled = items.filter(
      (r) => r.schedule && (r.schedule as Record<string, unknown>).active !== false
    );

    return {
      reports: scheduled,
      nextPageToken: result.nextPageToken as string | undefined,
    };
  }

  /**
   * Delete a CM360 report (and its schedule).
   */
  async deleteReportSchedule(
    profileId: string,
    reportId: string,
    context?: RequestContext
  ): Promise<void> {
    await this.rateLimiter.consume("cm360");

    await this.httpClient.fetch(
      `/userprofiles/${profileId}/reports/${reportId}`,
      context,
      { method: "DELETE" }
    );

    this.logger.info(
      { reportId, requestId: context?.requestId },
      "CM360 scheduled report deleted"
    );
  }

}