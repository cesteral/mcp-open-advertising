// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * BidManagerService - Core service for Bid Manager API v2 interactions
 *
 * Handles query creation, execution, polling, and report fetching.
 * Implements the async report generation flow:
 * Create Query → Run Query → Poll for Completion → Fetch CSV → Parse Results
 */

import type { Logger } from "pino";
import type { AppConfig } from "../../config/index.js";
import type { BidManagerClient } from "./client.js";
import { csvToJson } from "./report-parser.js";
import type { RateLimiter } from "@cesteral/shared";
import {
  QueryCreationError,
  QueryExecutionError,
  ReportGenerationError,
  ReportTimeoutError,
  ReportFetchError,
  BidManagerError,
  RetryExhaustedError,
} from "../../utils/errors/index.js";
import {
  parseCSVToDeliveryMetrics,
  parseCSVToHistoricalData,
  calculatePerformanceMetrics,
} from "./report-parser.js";
import type {
  DeliveryMetrics,
  HistoricalDataPoint,
  PacingStatus,
  GetDeliveryMetricsInput,
  GetHistoricalMetricsInput,
  GetPacingStatusInput,
  QuerySpec,
  ReportMetadata,
  DateObject,
  ExponentialBackoffConfig,
} from "./types.js";
import { safeDivide, round } from "../../utils/math.js";
import { daysBetween } from "../../utils/date.js";
import { withBidManagerApiSpan } from "../../utils/telemetry/tracing.js";

/**
 * Sleep helper function
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse date string (YYYY-MM-DD) to DateObject
 */
function parseDateString(dateStr: string): DateObject {
  const [year, month, day] = dateStr.split("-").map(Number);
  return { year, month, day };
}

/**
 * Get today's date as YYYY-MM-DD string
 */
function getTodayString(): string {
  const today = new Date();
  return today.toISOString().split("T")[0];
}

export class BidManagerService {
  /**
   * Constructor accepts a pre-initialized Bid Manager API client.
   * The client is created per-session by the SessionServiceStore using
   * the user-provided GoogleAuthAdapter.
   */
  constructor(
    private config: AppConfig,
    private logger: Logger,
    private client: BidManagerClient,
    private rateLimiter?: RateLimiter,
  ) {}

  /**
   * Create a Bid Manager query
   */
  async createQuery(spec: QuerySpec): Promise<{ queryId: string }> {
    this.logger.info({ title: spec.metadata.title }, "Creating Bid Manager query");

    try {
      await this.rateLimiter?.consume("bidmanager:global");
      const response = await this.client.queries.create({
        requestBody: {
          metadata: {
            title: spec.metadata.title,
            dataRange: {
              range: spec.metadata.dataRange.range,
              customStartDate: spec.metadata.dataRange.customStartDate,
              customEndDate: spec.metadata.dataRange.customEndDate,
            },
            format: spec.metadata.format || "CSV",
          },
          params: {
            type: spec.params.type,
            groupBys: spec.params.groupBys,
            metrics: spec.params.metrics,
            filters: spec.params.filters?.map((f) => ({
              type: f.type,
              value: f.value,
            })),
          },
        },
      });

      const queryId = response.data.queryId;
      if (!queryId) {
        throw new QueryCreationError("No queryId returned from API");
      }

      this.logger.info({ queryId }, "Query created successfully");
      return { queryId };
    } catch (error) {
      if (error instanceof QueryCreationError) {
        throw error;
      }
      this.logger.error({ error }, "Failed to create query");
      throw new QueryCreationError(
        error instanceof Error ? error.message : String(error),
        error
      );
    }
  }

  /**
   * Run a Bid Manager query to generate a report
   */
  async runQuery(queryId: string): Promise<{ reportId: string }> {
    this.logger.info({ queryId }, "Running Bid Manager query");

    try {
      await this.rateLimiter?.consume("bidmanager:global");
      const response = await this.client.queries.run({ queryId });

      const reportId = response.data.key?.reportId;
      if (!reportId) {
        throw new QueryExecutionError(queryId, "No reportId returned from API");
      }

      this.logger.info({ queryId, reportId }, "Query execution started");
      return { reportId };
    } catch (error) {
      if (error instanceof QueryExecutionError) {
        throw error;
      }
      this.logger.error({ error, queryId }, "Failed to run query");
      throw new QueryExecutionError(
        queryId,
        error instanceof Error ? error.message : String(error),
        error
      );
    }
  }

  /**
   * Get report status
   */
  async getReportStatus(queryId: string, reportId: string): Promise<ReportMetadata> {
    try {
      await this.rateLimiter?.consume("bidmanager:global");
      const response = await this.client.queries.reports.get({ queryId, reportId });

      return {
        status: {
          state: (response.data.metadata?.status?.state as any) || "QUEUED",
          format: response.data.metadata?.status?.format ?? undefined,
        },
        googleCloudStoragePath: response.data.metadata?.googleCloudStoragePath ?? undefined,
      };
    } catch (error) {
      this.logger.error({ error, queryId, reportId }, "Failed to get report status");
      throw BidManagerError.fromGoogleApiError(error);
    }
  }

  /**
   * Calculate delay for exponential backoff
   */
  private calculateBackoffDelay(
    attempt: number,
    config: ExponentialBackoffConfig
  ): number {
    const delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
    return Math.min(delay, config.maxDelayMs);
  }

  /**
   * Poll for report completion with exponential backoff
   *
   * Uses configurable exponential backoff (default: 2s initial, 2x multiplier, 60s max).
   */
  async pollForCompletion(
    queryId: string,
    reportId: string,
    options?: Partial<ExponentialBackoffConfig>
  ): Promise<ReportMetadata> {
    const config: ExponentialBackoffConfig = {
      initialDelayMs: options?.initialDelayMs ?? this.config.reportPollInitialDelayMs ?? 2000,
      maxDelayMs: options?.maxDelayMs ?? this.config.reportPollMaxDelayMs ?? 60000,
      maxRetries: options?.maxRetries ?? this.config.reportPollMaxRetries ?? 10,
      backoffMultiplier: options?.backoffMultiplier ?? 2,
    };

    this.logger.info(
      { queryId, reportId, config },
      "Starting exponential backoff polling"
    );

    let lastStatus: string | undefined;

    for (let attempt = 0; attempt < config.maxRetries; attempt++) {
      const currentDelay = this.calculateBackoffDelay(attempt, config);

      // Sleep before polling — a report is never ready immediately after submission
      await sleep(currentDelay);

      this.logger.debug(
        { queryId, reportId, attempt: attempt + 1, maxRetries: config.maxRetries, delayMs: currentDelay },
        "Poll attempt"
      );

      try {
        const report = await this.getReportStatus(queryId, reportId);
        lastStatus = report.status.state;

        if (report.status.state === "DONE") {
          this.logger.info(
            { queryId, reportId, attempts: attempt + 1 },
            "Report completed successfully"
          );
          return report;
        }

        if (report.status.state === "FAILED") {
          throw new ReportGenerationError(queryId, reportId, report.status.format);
        }
      } catch (error) {
        // Re-throw terminal errors
        if (error instanceof ReportGenerationError) {
          throw error;
        }

        this.logger.warn(
          { error: error instanceof Error ? error.message : String(error), queryId, reportId, attempt: attempt + 1 },
          "Poll attempt failed, will retry"
        );
      }
    }

    throw new ReportTimeoutError(
      queryId,
      reportId,
      config.maxRetries,
      lastStatus
    );
  }

  /**
   * Continue a previously started query
   *
   * Checks if an existing report is still valid (DONE, RUNNING, QUEUED).
   * If not valid or no reportId provided, re-runs the query.
   */
  async continueQuery(
    queryId: string,
    reportId?: string
  ): Promise<{ reportId: string; isNewRun: boolean }> {
    this.logger.info({ queryId, existingReportId: reportId }, "Attempting to continue query");

    // If we have a reportId, check its status first
    if (reportId) {
      try {
        const report = await this.getReportStatus(queryId, reportId);
        const state = report.status.state;

        if (state === "DONE" || state === "RUNNING" || state === "QUEUED") {
          this.logger.info({ queryId, reportId, status: state }, "Existing report still valid");
          return { reportId, isNewRun: false };
        }

        this.logger.info(
          { queryId, reportId, status: state },
          "Existing report not usable, will re-run query"
        );
      } catch (error) {
        this.logger.warn(
          { error: error instanceof Error ? error.message : String(error), queryId, reportId },
          "Could not get existing report status, will re-run query"
        );
      }
    }

    // Run the query again
    const result = await this.runQuery(queryId);
    return { reportId: result.reportId, isNewRun: true };
  }

  /**
   * Execute a query with automatic retry and continuation
   *
   * Handles the complete query lifecycle with resilience:
   * - Creates query on first attempt
   * - Runs query and polls with exponential backoff
   * - On failure, retries with query continuation (reuses queryId)
   * - Configurable retry count and cooldown between retries
   *
   * @returns Object with GCS path, queryId, and reportId from the completed report
   */
  async executeQueryWithRetry(
    spec: QuerySpec,
    options?: {
      maxRetries?: number;
      retryCooldownMs?: number;
      backoffConfig?: Partial<ExponentialBackoffConfig>;
    }
  ): Promise<{ gcsPath: string; queryId: string; reportId: string }> {
    return withBidManagerApiSpan("executeQueryWithRetry", undefined, async () => {
      return this.executeQueryWithRetryInner(spec, options);
    });
  }

  private async executeQueryWithRetryInner(
    spec: QuerySpec,
    options?: {
      maxRetries?: number;
      retryCooldownMs?: number;
      backoffConfig?: Partial<ExponentialBackoffConfig>;
    }
  ): Promise<{ gcsPath: string; queryId: string; reportId: string }> {
    const maxRetries = options?.maxRetries ?? this.config.reportQueryRetries ?? 3;
    const retryCooldownMs = options?.retryCooldownMs ?? this.config.reportRetryCooldownMs ?? 60000;

    let queryId: string | undefined;
    let reportId: string | undefined;
    let lastError: Error | undefined;
    let lastStatus: string | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        this.logger.info(
          { attempt: attempt + 1, maxRetries, existingQueryId: queryId, existingReportId: reportId },
          "Query execution attempt"
        );

        // Create query on first attempt
        if (!queryId) {
          const createResult = await this.createQuery(spec);
          queryId = createResult.queryId;
        }

        // Run or continue query
        const continueResult = await this.continueQuery(queryId, reportId);
        reportId = continueResult.reportId;

        if (continueResult.isNewRun) {
          this.logger.debug({ queryId, reportId }, "Started new query run");
        } else {
          this.logger.debug({ queryId, reportId }, "Continuing existing query run");
        }

        // Poll for completion with exponential backoff
        const report = await this.pollForCompletion(
          queryId,
          reportId,
          options?.backoffConfig
        );

        lastStatus = report.status.state;

        if (!report.googleCloudStoragePath) {
          throw new ReportFetchError("No GCS path in completed report", undefined);
        }

        this.logger.info(
          { queryId, reportId, attempts: attempt + 1 },
          "Query executed successfully"
        );

        return { gcsPath: report.googleCloudStoragePath, queryId, reportId };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Capture last status for error reporting
        if (error instanceof ReportTimeoutError) {
          lastStatus = error.lastStatus;
        } else if (error instanceof ReportGenerationError) {
          lastStatus = "FAILED";
        }

        this.logger.warn(
          {
            error: lastError.message,
            queryId,
            reportId,
            attempt: attempt + 1,
            maxRetries,
            lastStatus,
          },
          "Query execution attempt failed"
        );

        // If this is not the last attempt, wait before retrying
        if (attempt < maxRetries - 1) {
          this.logger.info(
            { cooldownMs: retryCooldownMs, nextAttempt: attempt + 2 },
            "Waiting before retry with continuation"
          );
          await sleep(retryCooldownMs);
        }
      }
    }

    throw new RetryExhaustedError(maxRetries, {
      queryId,
      reportId,
      lastError,
      lastStatus,
    });
  }

  /**
   * Fetch report data from GCS path (signed URL)
   */
  async fetchReportData(gcsPath: string): Promise<string> {
    return withBidManagerApiSpan("fetchReportData", undefined, async () => {
      return this.fetchReportDataInner(gcsPath);
    });
  }

  private async fetchReportDataInner(gcsPath: string): Promise<string> {
    this.logger.info({ gcsPath: gcsPath.substring(0, 100) + "..." }, "Fetching report data");

    try {
      const response = await fetch(gcsPath);

      if (!response.ok) {
        throw new ReportFetchError(
          `HTTP ${response.status}: ${response.statusText}`,
          gcsPath
        );
      }

      const data = await response.text();
      this.logger.info(
        { bytes: data.length },
        "Report data fetched successfully"
      );

      return data;
    } catch (error) {
      if (error instanceof ReportFetchError) {
        throw error;
      }
      this.logger.error({ error }, "Failed to fetch report data");
      throw new ReportFetchError(
        error instanceof Error ? error.message : String(error),
        gcsPath,
        error
      );
    }
  }

  /**
   * Create and run a query, poll for completion, fetch and parse results
   *
   * Uses executeQueryWithRetry for automatic retry with exponential backoff
   * and query continuation on failure.
   */
  async getDeliveryMetrics(params: GetDeliveryMetricsInput): Promise<DeliveryMetrics> {
    return withBidManagerApiSpan("getDeliveryMetrics", undefined, async () => {
      return this.getDeliveryMetricsInner(params);
    });
  }

  private async getDeliveryMetricsInner(params: GetDeliveryMetricsInput): Promise<DeliveryMetrics> {
    this.logger.info(
      { advertiserId: params.advertiserId, campaignId: params.campaignId },
      "Getting delivery metrics"
    );

    // Create query specification
    const querySpec: QuerySpec = {
      metadata: {
        title: `Delivery metrics for campaign ${params.campaignId}`,
        dataRange: {
          range: "CUSTOM_DATES",
          customStartDate: parseDateString(params.startDate),
          customEndDate: parseDateString(params.endDate),
        },
        format: "CSV",
      },
      params: {
        type: "STANDARD",
        groupBys: ["FILTER_DATE", "FILTER_MEDIA_PLAN"],
        metrics: [
          "METRIC_IMPRESSIONS",
          "METRIC_CLICKS",
          "METRIC_TOTAL_MEDIA_COST_ADVERTISER",
          "METRIC_TOTAL_CONVERSIONS",
          "METRIC_REVENUE_ADVERTISER",
        ],
        filters: [
          { type: "FILTER_ADVERTISER", value: params.advertiserId },
          { type: "FILTER_MEDIA_PLAN", value: params.campaignId },
        ],
      },
    };

    // Execute with retry and exponential backoff
    const result = await this.executeQueryWithRetry(querySpec);
    const csvData = await this.fetchReportData(result.gcsPath);
    const metrics = parseCSVToDeliveryMetrics(csvData);

    this.logger.info(
      { advertiserId: params.advertiserId, campaignId: params.campaignId, metrics },
      "Delivery metrics retrieved successfully"
    );

    return metrics;
  }

  /**
   * Get historical metrics with daily breakdown
   *
   * Uses executeQueryWithRetry for automatic retry with exponential backoff
   * and query continuation on failure.
   */
  async getHistoricalMetrics(params: GetHistoricalMetricsInput): Promise<HistoricalDataPoint[]> {
    return withBidManagerApiSpan("getHistoricalMetrics", undefined, async () => {
      return this.getHistoricalMetricsInner(params);
    });
  }

  private async getHistoricalMetricsInner(params: GetHistoricalMetricsInput): Promise<HistoricalDataPoint[]> {
    this.logger.info(
      {
        advertiserId: params.advertiserId,
        campaignId: params.campaignId,
        granularity: params.granularity,
      },
      "Getting historical metrics"
    );

    // Determine groupBy based on granularity
    const timeGroupBy =
      params.granularity === "weekly"
        ? "FILTER_WEEK" as const
        : params.granularity === "monthly"
          ? "FILTER_MONTH" as const
          : "FILTER_DATE" as const;

    const querySpec: QuerySpec = {
      metadata: {
        title: `Historical metrics for campaign ${params.campaignId}`,
        dataRange: {
          range: "CUSTOM_DATES",
          customStartDate: parseDateString(params.startDate),
          customEndDate: parseDateString(params.endDate),
        },
        format: "CSV",
      },
      params: {
        type: "STANDARD",
        groupBys: [timeGroupBy, "FILTER_MEDIA_PLAN"],
        metrics: [
          "METRIC_IMPRESSIONS",
          "METRIC_CLICKS",
          "METRIC_TOTAL_MEDIA_COST_ADVERTISER",
          "METRIC_TOTAL_CONVERSIONS",
          "METRIC_REVENUE_ADVERTISER",
        ],
        filters: [
          { type: "FILTER_ADVERTISER", value: params.advertiserId },
          { type: "FILTER_MEDIA_PLAN", value: params.campaignId },
        ],
      },
    };

    // Execute with retry and exponential backoff
    const result = await this.executeQueryWithRetry(querySpec);
    const csvData = await this.fetchReportData(result.gcsPath);
    const historicalData = parseCSVToHistoricalData(csvData);

    this.logger.info(
      {
        advertiserId: params.advertiserId,
        campaignId: params.campaignId,
        dataPoints: historicalData.length,
      },
      "Historical metrics retrieved successfully"
    );

    return historicalData;
  }

  /**
   * Calculate pacing status for a campaign
   *
   * Returns basic pacing metrics and status. For advanced pacing optimization
   * with feedback loops, use the cesteral-mcp optimization server.
   */
  async getPacingStatus(params: GetPacingStatusInput): Promise<PacingStatus> {
    return withBidManagerApiSpan("getPacingStatus", undefined, async () => {
      return this.getPacingStatusInner(params);
    });
  }

  private async getPacingStatusInner(params: GetPacingStatusInput): Promise<PacingStatus> {
    this.logger.info(
      { advertiserId: params.advertiserId, campaignId: params.campaignId },
      "Getting pacing status"
    );

    const today = getTodayString();
    const flightStartDate = params.flightStartDate;
    const flightEndDate = params.flightEndDate;

    // Determine the effective end date for metrics (either today or flight end, whichever is earlier)
    const effectiveEndDate = today < flightEndDate ? today : flightEndDate;

    // Get delivery metrics from flight start to effective end date
    const metrics = await this.getDeliveryMetrics({
      advertiserId: params.advertiserId,
      campaignId: params.campaignId,
      startDate: flightStartDate,
      endDate: effectiveEndDate,
    });

    // Calculate pacing using safe math utilities
    const totalDays = daysBetween(flightStartDate, flightEndDate) + 1;
    const daysPassed = daysBetween(flightStartDate, effectiveEndDate) + 1;
    const daysRemaining = Math.max(0, totalDays - daysPassed);

    // Use safe division to avoid NaN/Infinity
    const expectedDeliveryPercent = round(safeDivide(daysPassed, totalDays, 0) * 100, 2);
    const actualDeliveryPercent = round(safeDivide(metrics.spend, params.budgetTotal, 0) * 100, 2);
    const pacingRatio = round(safeDivide(actualDeliveryPercent, expectedDeliveryPercent, 0), 4);

    // Simple inline status determination (advanced optimization logic lives in cesteral-mcp)
    let status: "ON_PACE" | "AHEAD" | "BEHIND" | "SEVERELY_BEHIND";
    if (pacingRatio >= 0.95 && pacingRatio <= 1.05) {
      status = "ON_PACE";
    } else if (pacingRatio > 1.05) {
      status = "AHEAD";
    } else if (pacingRatio >= 0.8) {
      status = "BEHIND";
    } else {
      status = "SEVERELY_BEHIND";
    }

    // Project end spend using safe division
    const dailySpendRate = safeDivide(metrics.spend, daysPassed, 0);
    const projectedEndSpend = round(metrics.spend + dailySpendRate * daysRemaining, 2);

    const pacingStatus: PacingStatus = {
      advertiserId: params.advertiserId,
      campaignId: params.campaignId,
      budgetTotal: params.budgetTotal,
      spendToDate: metrics.spend,
      expectedDeliveryPercent,
      actualDeliveryPercent,
      pacingRatio,
      status,
      daysRemaining,
      projectedEndSpend,
    };

    this.logger.info(
      { advertiserId: params.advertiserId, campaignId: params.campaignId, pacingStatus },
      "Pacing status calculated"
    );

    return pacingStatus;
  }

  /**
   * Get performance metrics (delivery + calculated KPIs)
   */
  async getPerformanceMetrics(
    params: GetDeliveryMetricsInput
  ): Promise<ReturnType<typeof calculatePerformanceMetrics>> {
    return withBidManagerApiSpan("getPerformanceMetrics", undefined, async () => {
      const delivery = await this.getDeliveryMetrics(params);
      return calculatePerformanceMetrics(delivery);
    });
  }

  /**
   * Execute a custom query with user-specified filters, metrics, and groupBys
   *
   * This method accepts dynamic parameters allowing flexible query construction
   * for any combination of Bid Manager API filters and metrics.
   */
  async executeCustomQuery(params_: {
    reportType: string;
    groupBys: string[];
    metrics: string[];
    filters?: Array<{ type: string; value: string }>;
    dateRange: { preset?: string; startDate?: string; endDate?: string };
    outputFormat?: "structured" | "csv";
  }): Promise<{
    queryId: string;
    reportId: string;
    status: string;
    rowCount: number;
    columns: string[];
    data: Record<string, unknown>[] | string;
  }> {
    return withBidManagerApiSpan("executeCustomQuery", undefined, async () => {
      return this.executeCustomQueryInner(params_);
    });
  }

  private async executeCustomQueryInner(params: {
    reportType: string;
    groupBys: string[];
    metrics: string[];
    filters?: Array<{ type: string; value: string }>;
    dateRange: { preset?: string; startDate?: string; endDate?: string };
    outputFormat?: "structured" | "csv";
  }): Promise<{
    queryId: string;
    reportId: string;
    status: string;
    rowCount: number;
    columns: string[];
    data: Record<string, unknown>[] | string;
  }> {
    this.logger.info(
      {
        reportType: params.reportType,
        groupBysCount: params.groupBys.length,
        metricsCount: params.metrics.length,
        filtersCount: params.filters?.length || 0,
      },
      "Executing custom query"
    );

    // Build date range config
    let dataRangeConfig: QuerySpec["metadata"]["dataRange"];

    if (params.dateRange.preset) {
      // Use preset range
      dataRangeConfig = {
        range: params.dateRange.preset as "LAST_7_DAYS" | "LAST_30_DAYS" | "MONTH_TO_DATE",
      };
    } else if (params.dateRange.startDate && params.dateRange.endDate) {
      // Use custom date range
      dataRangeConfig = {
        range: "CUSTOM_DATES",
        customStartDate: parseDateString(params.dateRange.startDate),
        customEndDate: parseDateString(params.dateRange.endDate),
      };
    } else {
      throw new BidManagerError(
        "Invalid dateRange: provide either preset or startDate/endDate"
      );
    }

    // Build query specification with user-provided parameters
    // Note: Types are cast because we accept strings for flexibility
    // Validation happens at the tool level before calling this method
    const querySpec: QuerySpec = {
      metadata: {
        title: `Custom query - ${new Date().toISOString()}`,
        dataRange: dataRangeConfig,
        format: "CSV",
      },
      params: {
        type: params.reportType as QuerySpec["params"]["type"],
        groupBys: params.groupBys as QuerySpec["params"]["groupBys"],
        metrics: params.metrics as QuerySpec["params"]["metrics"],
        filters: params.filters as QuerySpec["params"]["filters"],
      },
    };

    // Execute with retry and exponential backoff
    const queryResult = await this.executeQueryWithRetry(querySpec);
    const csvData = await this.fetchReportData(queryResult.gcsPath);

    // Parse results based on output format
    if (params.outputFormat === "csv") {
      // Return raw CSV — use csvToJson to extract column names safely (handles quoted fields)
      const csvRecords = csvToJson(csvData);
      const columns = csvRecords.length > 0 ? Object.keys(csvRecords[0]) : [];
      const rowCount = csvRecords.length;

      this.logger.info(
        { rowCount, columnsCount: columns.length },
        "Custom query completed (CSV format)"
      );

      return {
        queryId: queryResult.queryId,
        reportId: queryResult.reportId,
        status: "DONE",
        rowCount,
        columns,
        data: csvData,
      };
    }

    // Parse CSV to structured data
    const records = csvToJson(csvData);

    this.logger.info(
      { rowCount: records.length, columnsCount: Object.keys(records[0] || {}).length },
      "Custom query completed (structured format)"
    );

    return {
      queryId: queryResult.queryId,
      reportId: queryResult.reportId,
      status: "DONE",
      rowCount: records.length,
      columns: records.length > 0 ? Object.keys(records[0]) : [],
      data: records,
    };
  }

}