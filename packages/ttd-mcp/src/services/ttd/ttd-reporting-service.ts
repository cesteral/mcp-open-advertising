// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import { z } from "zod";
import type { TtdHttpClient } from "./ttd-http-client.js";
import type { RateLimiter } from "@cesteral/shared";
import {
  McpError,
  JsonRpcErrorCode,
  DEFAULT_REPORT_MAX_BACKOFF_MS,
  DEFAULT_REPORT_POLL_INTERVAL_MS,
  pollUntilComplete,
  ReportFailedError,
  type RequestContext,
} from "@cesteral/shared";

const ReportDeliverySchema = z
  .object({
    DownloadURL: z.string().nullish(),
  })
  .passthrough();

const ReportScheduleResponseSchema = z
  .object({
    ReportScheduleId: z.union([z.string(), z.number()]),
  })
  .passthrough();

const ReportScheduleDetailSchema = z
  .object({
    AdvertiserFilters: z.array(z.string()).optional(),
  })
  .passthrough();

const ReportExecutionSchema = z
  .object({
    ReportExecutionState: z.string().optional(),
    ReportDeliveries: z.array(ReportDeliverySchema).optional(),
  })
  .passthrough();

const ReportExecutionQueryResponseSchema = z
  .object({
    Result: z.array(ReportExecutionSchema).optional(),
  })
  .passthrough();

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, endpoint: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      `TTD response from ${endpoint} did not match expected shape: ${result.error.message}`
    );
  }
  return result.data;
}

/**
 * Report configuration for TTD MyReports API.
 */
export interface TtdReportConfig {
  ReportScheduleName: string;
  ReportTemplateId: number;
  ReportFileFormat: "CSV" | "TSV" | "ExcelPivot";
  ReportDateRange: string;
  ReportFrequency: "Once" | "Daily" | "Weekly" | "Monthly" | "Quarterly";
  ScheduleStartDate: string;
  TimeZone?: string;
  ReportDateFormat?: string;
  ReportNumericFormat?: string;
  IncludeHeaders?: boolean;
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
 * Throw `InvalidParams` unless a report config carries at least one advertiser
 * filter.
 *
 * TTD's only REST report-execution query is
 * `POST /v3/myreports/reportexecution/query/advertisers` — "Report Executions
 * that match the Advertisers ... in the specified query"
 * (docs/api/ttd-api-reference-part4.md, My Reports). A schedule created
 * without `AdvertiserFilters` therefore can never be polled here: the blocking
 * `runReport` used to create it and only then throw, orphaning a schedule in
 * the account; `ttd_submit_report` returned an id `ttd_check_report_status`
 * could never resolve. Call this BEFORE the schedule is created.
 */
export function assertPollableReportConfig(config: { AdvertiserFilters?: unknown }): void {
  const filters = config.AdvertiserFilters;
  if (
    !Array.isArray(filters) ||
    filters.length === 0 ||
    !filters.every((f) => typeof f === "string" && f.length > 0)
  ) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      "The report must be scoped to at least one advertiser (advertiserIds / AdvertiserFilters). " +
        "TTD's report-execution status query is advertiser-scoped, so a schedule without advertiser " +
        "filters could not be polled. No report schedule was created."
    );
  }
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
  async runReport(config: TtdReportConfig, context?: RequestContext): Promise<unknown> {
    // Validate before creating anything — polling needs the advertiser filters.
    assertPollableReportConfig(config);

    const partnerId = this.httpClient.partnerId;
    await this.rateLimiter.consume(`ttd:${partnerId}`);

    // Create report schedule
    const scheduleRaw = await this.httpClient.fetch("/myreports/reportschedule", context, {
      method: "POST",
      body: JSON.stringify(config),
    });
    const schedule = parseOrThrow(
      ReportScheduleResponseSchema,
      scheduleRaw,
      "POST /myreports/reportschedule"
    );

    const reportScheduleId = String(schedule.ReportScheduleId);

    this.logger.info(
      { reportScheduleId, requestId: context?.requestId },
      "Report schedule created — polling for results"
    );

    // Poll for completion — reuse advertiser filters from the submitted
    // config so we do not need a second HTTP call to discover them.
    const advertiserIds = config.AdvertiserFilters as string[];
    const execution = await this.pollReportExecution(reportScheduleId, advertiserIds, context);

    const downloadUrl = execution.ReportDeliveries?.[0]?.DownloadURL;
    if (downloadUrl) {
      return { reportScheduleId, execution, downloadUrl };
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

    const scheduleRaw = await this.httpClient.fetch("/myreports/reportschedule", context, {
      method: "POST",
      body: JSON.stringify(config),
    });
    const schedule = parseOrThrow(
      ReportScheduleResponseSchema,
      scheduleRaw,
      "POST /myreports/reportschedule"
    );

    const reportScheduleId = String(schedule.ReportScheduleId);

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
    execution: z.infer<typeof ReportExecutionSchema> | Record<string, never>;
    downloadUrl?: string;
  }> {
    const partnerId = this.httpClient.partnerId;
    await this.rateLimiter.consume(`ttd:${partnerId}`);

    const advertiserIds = await this.getScheduleAdvertiserIds(reportScheduleId, context);

    const body = {
      AdvertiserIds: advertiserIds,
      ReportScheduleIds: [Number(reportScheduleId)],
      PageStartIndex: 0,
      PageSize: 1,
    };

    const raw = await this.httpClient.fetch(
      "/myreports/reportexecution/query/advertisers",
      context,
      {
        method: "POST",
        body: JSON.stringify(body),
      }
    );
    const result = parseOrThrow(
      ReportExecutionQueryResponseSchema,
      raw,
      "POST /myreports/reportexecution/query/advertisers"
    );

    const executions = result.Result ?? [];

    if (executions.length === 0) {
      return {
        reportScheduleId,
        state: "Unknown",
        execution: {},
      };
    }

    const execution = executions[0];
    const state = execution.ReportExecutionState ?? "Unknown";
    const downloadUrl = execution.ReportDeliveries?.[0]?.DownloadURL ?? undefined;

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
   * Resolve the AdvertiserFilters of a report schedule so the execution query
   * endpoint can be scoped without relying on a partner id the auth adapter
   * may not know (direct-token auth has no partnerId).
   */
  private async getScheduleAdvertiserIds(
    reportScheduleId: string,
    context?: RequestContext
  ): Promise<string[]> {
    const raw = await this.getReportSchedule(reportScheduleId, context);
    const schedule = parseOrThrow(
      ReportScheduleDetailSchema,
      raw,
      `GET /myreports/reportschedule/${reportScheduleId}`
    );
    const advertiserFilters = schedule.AdvertiserFilters;
    if (!advertiserFilters || advertiserFilters.length === 0) {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `Report schedule ${reportScheduleId} has no AdvertiserFilters, so its execution status cannot be ` +
          `queried via /myreports/reportexecution/query/advertisers (TTD's only REST execution query). ` +
          `Use ttd_get_report_executions with scheduleId "${reportScheduleId}" instead.`
      );
    }
    return advertiserFilters;
  }

  /**
   * Get a single report schedule by ID.
   */
  async getReportSchedule(scheduleId: string, context?: RequestContext): Promise<unknown> {
    const partnerId = this.httpClient.partnerId;
    await this.rateLimiter.consume(`ttd:${partnerId}`);
    return this.httpClient.fetch(`/myreports/reportschedule/${scheduleId}`, context, {
      method: "GET",
    });
  }

  /**
   * Delete a report schedule by ID.
   */
  async deleteReportSchedule(scheduleId: string, context?: RequestContext): Promise<void> {
    const partnerId = this.httpClient.partnerId;
    await this.rateLimiter.consume(`ttd:${partnerId}`);
    await this.httpClient.fetch(`/myreports/reportschedule/${scheduleId}`, context, {
      method: "DELETE",
    });
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
    return this.httpClient.fetch("/myreports/reporttemplateheader/query", context, {
      method: "POST",
      body: JSON.stringify(query),
    });
  }

  private async pollReportExecution(
    reportScheduleId: string,
    advertiserIds: string[],
    context?: RequestContext
  ): Promise<z.infer<typeof ReportExecutionSchema>> {
    const partnerId = this.httpClient.partnerId;
    if (!advertiserIds || advertiserIds.length === 0) {
      advertiserIds = await this.getScheduleAdvertiserIds(reportScheduleId, context);
    }

    try {
      return await pollUntilComplete<z.infer<typeof ReportExecutionSchema>>({
        fetchStatus: async () => {
          await this.rateLimiter.consume(`ttd:${partnerId}`);
          const body = {
            AdvertiserIds: advertiserIds,
            ReportScheduleIds: [Number(reportScheduleId)],
            PageStartIndex: 0,
            PageSize: 1,
          };
          const raw = await this.httpClient.fetch(
            "/myreports/reportexecution/query/advertisers",
            context,
            { method: "POST", body: JSON.stringify(body) }
          );
          const result = parseOrThrow(
            ReportExecutionQueryResponseSchema,
            raw,
            "POST /myreports/reportexecution/query/advertisers"
          );
          return result.Result?.[0] ?? {};
        },
        isComplete: (exec) => exec.ReportExecutionState === "Complete",
        isFailed: (exec) => exec.ReportExecutionState === "Failed",
        initialDelayMs: this.pollIntervalMs,
        maxDelayMs: DEFAULT_REPORT_MAX_BACKOFF_MS,
        maxAttempts: this.maxPollAttempts,
      });
    } catch (err) {
      if (err instanceof ReportFailedError) {
        throw new ReportFailedError(
          err.status as Record<string, unknown>,
          `Report execution failed: ${JSON.stringify(err.status)}`
        );
      }
      throw err;
    }
  }
}
