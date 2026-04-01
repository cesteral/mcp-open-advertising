// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { TtdHttpClient } from "./ttd-http-client.js";
import type { RateLimiter } from "../../utils/security/rate-limiter.js";
import {
  McpError,
  JsonRpcErrorCode,
  delay,
  computeExponentialBackoff,
  DEFAULT_REPORT_MAX_BACKOFF_MS,
  DEFAULT_REPORT_POLL_INTERVAL_MS,
  type RequestContext,
} from "@cesteral/shared";

/**
 * Report configuration for TTD MyReports API.
 */
export interface TtdReportConfig {
  ReportScheduleName: string;
  ReportScheduleType: "Once" | "Daily" | "Weekly" | "Monthly";
  ReportDateRange: string;
  ReportTemplateId?: number;
  ReportNumericFormat?: string;
  ReportFilters?: Array<{
    Type: string;
    Value: string;
  }>;
  ReportDimensions?: string[];
  ReportMetrics?: string[];
  AdvertiserFilters?: string[];
  [key: string]: unknown;
}

/**
 * TTD Reporting Service — Async report workflow.
 *
 * TTD reports follow an async pattern:
 * 1. Create a report schedule
 * 2. Poll for execution completion
 * 3. Download the result
 */
export class TtdReportingService {
  private static readonly MAX_BACKOFF_MS = DEFAULT_REPORT_MAX_BACKOFF_MS;

  constructor(
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: TtdHttpClient,
    private readonly logger: Logger,
    private readonly pollIntervalMs: number = DEFAULT_REPORT_POLL_INTERVAL_MS,
    private readonly maxPollAttempts: number = 60 // ~10 min max with exponential backoff
  ) {}

  /**
   * Create and run a report, polling until completion.
   */
  async runReport(
    config: TtdReportConfig,
    context?: RequestContext
  ): Promise<unknown> {
    const partnerId = this.httpClient.partnerId;
    await this.rateLimiter.consume(`ttd:${partnerId}`);

    // Create report schedule
    const schedule = (await this.httpClient.fetch(
      "/myreports/reportschedule",
      context,
      {
        method: "POST",
        body: JSON.stringify(config),
      }
    )) as Record<string, unknown>;

    const reportScheduleId = schedule.ReportScheduleId as string;

    this.logger.info(
      { reportScheduleId, requestId: context?.requestId },
      "Report schedule created — polling for results"
    );

    // Poll for completion
    const execution = await this.pollReportExecution(
      reportScheduleId,
      context
    );

    // Get the download URL and fetch results
    const reportDeliveries = (execution as Record<string, unknown>).ReportDeliveries as Array<Record<string, unknown>> | undefined;
    if (reportDeliveries && reportDeliveries.length > 0) {
      const deliveryUrl = reportDeliveries[0].DownloadURL as string | undefined;
      if (deliveryUrl) {
        return { reportScheduleId, execution, downloadUrl: deliveryUrl };
      }
    }

    return { reportScheduleId, execution };
  }

  /**
   * Create a report schedule without polling. Returns the schedule ID immediately.
   * Use with `checkReportExecution()` for non-blocking async pattern.
   */
  async createReportSchedule(
    config: TtdReportConfig,
    context?: RequestContext
  ): Promise<{ reportScheduleId: string }> {
    const partnerId = this.httpClient.partnerId;
    await this.rateLimiter.consume(`ttd:${partnerId}`);

    const schedule = (await this.httpClient.fetch(
      "/myreports/reportschedule",
      context,
      {
        method: "POST",
        body: JSON.stringify(config),
      }
    )) as Record<string, unknown>;

    const reportScheduleId = schedule.ReportScheduleId as string;

    this.logger.info(
      { reportScheduleId, requestId: context?.requestId },
      "Report schedule created (non-blocking)"
    );

    return { reportScheduleId };
  }

  /**
   * Single status check for a report execution. No polling, no sleep.
   * Returns current state and download URL if complete.
   */
  async checkReportExecution(
    reportScheduleId: string,
    context?: RequestContext
  ): Promise<{
    reportScheduleId: string;
    state: string;
    execution: Record<string, unknown>;
    downloadUrl?: string;
  }> {
    const partnerId = this.httpClient.partnerId;
    await this.rateLimiter.consume(`ttd:${partnerId}`);

    const body = {
      ReportScheduleIds: [reportScheduleId],
      PageSize: 1,
    };

    const result = (await this.httpClient.fetch(
      "/myreports/reportexecution/query",
      context,
      {
        method: "POST",
        body: JSON.stringify(body),
      }
    )) as Record<string, unknown>;

    const executions = (result.Result as Array<Record<string, unknown>>) || [];

    if (executions.length === 0) {
      return {
        reportScheduleId,
        state: "Unknown",
        execution: {},
      };
    }

    const execution = executions[0];
    const state = (execution.ReportExecutionState as string) || "Unknown";

    let downloadUrl: string | undefined;
    const deliveries = execution.ReportDeliveries as Array<Record<string, unknown>> | undefined;
    if (deliveries && deliveries.length > 0) {
      downloadUrl = deliveries[0].DownloadURL as string | undefined;
    }

    return { reportScheduleId, state, execution, downloadUrl };
  }

  /**
   * List report schedules matching an optional query.
   */
  async listReportSchedules(
    query: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    const partnerId = this.httpClient.partnerId;
    await this.rateLimiter.consume(`ttd:${partnerId}`);
    return this.httpClient.fetch("/myreports/reportschedule/query", context, {
      method: "POST",
      body: JSON.stringify(query),
    });
  }

  /**
   * Get a single report schedule by ID.
   */
  async getReportSchedule(
    scheduleId: string,
    context?: RequestContext
  ): Promise<unknown> {
    const partnerId = this.httpClient.partnerId;
    await this.rateLimiter.consume(`ttd:${partnerId}`);
    return this.httpClient.fetch(
      `/myreports/reportschedule/${scheduleId}`,
      context,
      { method: "GET" }
    );
  }

  /**
   * Delete a report schedule by ID.
   */
  async deleteReportSchedule(
    scheduleId: string,
    context?: RequestContext
  ): Promise<void> {
    const partnerId = this.httpClient.partnerId;
    await this.rateLimiter.consume(`ttd:${partnerId}`);
    await this.httpClient.fetch(
      `/myreports/reportschedule/${scheduleId}`,
      context,
      { method: "DELETE" }
    );
  }

  /**
   * List report template headers (read-only — templates are created in the TTD UI).
   */
  async listReportTemplates(
    query: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    const partnerId = this.httpClient.partnerId;
    await this.rateLimiter.consume(`ttd:${partnerId}`);
    return this.httpClient.fetch(
      "/myreports/reporttemplateheader/query",
      context,
      {
        method: "POST",
        body: JSON.stringify(query),
      }
    );
  }

  private async pollReportExecution(
    reportScheduleId: string,
    context?: RequestContext
  ): Promise<unknown> {
    const partnerId = this.httpClient.partnerId;

    for (
      let attempt = 0;
      attempt < this.maxPollAttempts;
      attempt++
    ) {
      await this.rateLimiter.consume(`ttd:${partnerId}`);

      const body = {
        ReportScheduleIds: [reportScheduleId],
        PageSize: 1,
      };

      const result = (await this.httpClient.fetch(
        "/myreports/reportexecution/query",
        context,
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      )) as Record<string, unknown>;

      const executions = (result.Result as Array<Record<string, unknown>>) || [];
      if (executions.length > 0) {
        const execution = executions[0];
        const state = execution.ReportExecutionState as string;

        if (state === "Complete") {
          this.logger.info(
            { reportScheduleId, attempt, requestId: context?.requestId },
            "Report execution complete"
          );
          return execution;
        }

        if (state === "Failed") {
          throw new McpError(
            JsonRpcErrorCode.InternalError,
            `Report execution failed: ${JSON.stringify(execution)}`
          );
        }

        this.logger.debug(
          { reportScheduleId, state, attempt },
          "Report still processing"
        );
      }

      await delay(computeExponentialBackoff(attempt, this.pollIntervalMs, TtdReportingService.MAX_BACKOFF_MS));
    }

    throw new McpError(
      JsonRpcErrorCode.Timeout,
      `Report polling timed out after ${this.maxPollAttempts} attempts`
    );
  }

}