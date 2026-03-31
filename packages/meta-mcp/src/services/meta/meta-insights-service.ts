// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { MetaGraphApiClient } from "./meta-graph-api-client.js";
import type { RateLimiter } from "../../utils/security/rate-limiter.js";
import type { RequestContext } from "@cesteral/shared";
import { McpError, JsonRpcErrorCode } from "../../utils/errors/index.js";
import type { Logger } from "pino";

/**
 * Meta Insights Service — Queries the Insights API for performance data.
 *
 * Supports date presets, custom date ranges, time increments,
 * breakdowns, and action attribution windows.
 */
export class MetaInsightsService {
  constructor(
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: MetaGraphApiClient,
    private readonly logger: Logger
  ) {}

  /**
   * Get insights for an entity (account, campaign, ad set, or ad).
   */
  async getInsights(
    entityId: string,
    options: {
      fields?: string[];
      datePreset?: string;
      timeRange?: { since: string; until: string };
      timeIncrement?: string;
      level?: string;
      limit?: number;
      after?: string;
    },
    context?: RequestContext
  ): Promise<{ data: unknown[]; nextCursor?: string; summary?: unknown }> {
    if (options.datePreset && options.timeRange) {
      this.logger.debug({ entityId, datePreset: options.datePreset }, "Rejecting insights request: datePreset and timeRange are mutually exclusive");
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        "Cannot specify both datePreset and timeRange — they are mutually exclusive. Use one or the other."
      );
    }

    await this.rateLimiter.consume(`meta:default`);

    const defaultFields = [
      "impressions", "clicks", "spend", "cpc", "cpm", "ctr",
      "reach", "frequency", "actions", "action_values",
      "conversions", "cost_per_action_type",
    ];

    const params: Record<string, string> = {
      fields: options.fields?.join(",") || defaultFields.join(","),
    };

    if (options.datePreset) {
      params.date_preset = options.datePreset;
    }

    if (options.timeRange) {
      params.time_range = JSON.stringify(options.timeRange);
    }

    if (options.timeIncrement) {
      params.time_increment = options.timeIncrement;
    }

    if (options.level) {
      params.level = options.level;
    }

    if (options.limit) {
      params.limit = String(options.limit);
    }

    if (options.after) {
      params.after = options.after;
    }

    const result = (await this.httpClient.get(
      `/${entityId}/insights`,
      params,
      context
    )) as Record<string, unknown>;

    const data = (result.data as unknown[]) || [];
    const paging = result.paging as Record<string, unknown> | undefined;
    const cursors = paging?.cursors as Record<string, string> | undefined;

    return {
      data,
      nextCursor: cursors?.after,
      summary: result.summary,
    };
  }

  /**
   * Submit an async insights report job.
   * Returns a reportRunId that can be polled via checkReportStatus.
   */
  async submitInsightsReport(
    entityId: string,
    options: {
      fields?: string[];
      datePreset?: string;
      timeRange?: { since: string; until: string };
      timeIncrement?: string;
      level?: string;
      breakdowns?: string[];
    },
    context?: RequestContext
  ): Promise<{ reportRunId: string }> {
    await this.rateLimiter.consume(`meta:default`);

    const defaultFields = [
      "impressions", "clicks", "spend", "cpc", "cpm", "ctr",
      "reach", "frequency", "actions", "action_values",
      "conversions", "cost_per_action_type",
    ];

    const data: Record<string, unknown> = {
      fields: options.fields?.join(",") || defaultFields.join(","),
      async: 1,
    };

    if (options.datePreset) {
      data.date_preset = options.datePreset;
    }

    if (options.timeRange) {
      data.time_range = JSON.stringify(options.timeRange);
    }

    if (options.timeIncrement) {
      data.time_increment = options.timeIncrement;
    }

    if (options.level) {
      data.level = options.level;
    }

    if (options.breakdowns?.length) {
      data.breakdowns = options.breakdowns.join(",");
    }

    const result = (await this.httpClient.post(
      `/${entityId}/insights`,
      data,
      context
    )) as Record<string, unknown>;

    return { reportRunId: String(result.id) };
  }

  /**
   * Check the status of an async insights report job.
   */
  async checkReportStatus(
    reportRunId: string,
    context?: RequestContext
  ): Promise<{ reportRunId: string; status: string; asyncPercentCompletion?: number }> {
    await this.rateLimiter.consume(`meta:default`);

    const result = (await this.httpClient.get(
      `/${reportRunId}`,
      { fields: "id,async_status,async_percent_completion" },
      context
    )) as Record<string, unknown>;

    return {
      reportRunId: String(result.id ?? reportRunId),
      status: String(result.async_status ?? "Unknown"),
      asyncPercentCompletion: result.async_percent_completion != null
        ? Number(result.async_percent_completion)
        : undefined,
    };
  }

  /**
   * Download results from a completed async insights report.
   */
  async getReportResults(
    reportRunId: string,
    options: { limit?: number },
    context?: RequestContext
  ): Promise<{ data: unknown[] }> {
    await this.rateLimiter.consume(`meta:default`);

    const params: Record<string, string> = {};
    if (options.limit) {
      params.limit = String(options.limit);
    }

    const result = (await this.httpClient.get(
      `/${reportRunId}/insights`,
      params,
      context
    )) as Record<string, unknown>;

    const data = (result.data as unknown[]) || [];
    return { data };
  }

  /**
   * Get insights with breakdowns for an entity.
   */
  async getInsightsBreakdowns(
    entityId: string,
    options: {
      breakdowns: string[];
      fields?: string[];
      datePreset?: string;
      timeRange?: { since: string; until: string };
      timeIncrement?: string;
      level?: string;
      limit?: number;
      after?: string;
      actionAttributionWindows?: string[];
    },
    context?: RequestContext
  ): Promise<{ data: unknown[]; nextCursor?: string }> {
    if (options.datePreset && options.timeRange) {
      this.logger.debug({ entityId, datePreset: options.datePreset }, "Rejecting insights breakdowns request: datePreset and timeRange are mutually exclusive");
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        "Cannot specify both datePreset and timeRange — they are mutually exclusive. Use one or the other."
      );
    }

    await this.rateLimiter.consume(`meta:default`);

    const defaultFields = [
      "impressions", "clicks", "spend", "cpc", "cpm", "ctr",
      "reach", "frequency", "actions",
    ];

    const params: Record<string, string> = {
      fields: options.fields?.join(",") || defaultFields.join(","),
      breakdowns: options.breakdowns.join(","),
    };

    if (options.datePreset) {
      params.date_preset = options.datePreset;
    }

    if (options.timeRange) {
      params.time_range = JSON.stringify(options.timeRange);
    }

    if (options.timeIncrement) {
      params.time_increment = options.timeIncrement;
    }

    if (options.level) {
      params.level = options.level;
    }

    if (options.limit) {
      params.limit = String(options.limit);
    }

    if (options.after) {
      params.after = options.after;
    }

    if (options.actionAttributionWindows?.length) {
      params.action_attribution_windows = options.actionAttributionWindows.join(",");
    }

    const result = (await this.httpClient.get(
      `/${entityId}/insights`,
      params,
      context
    )) as Record<string, unknown>;

    const data = (result.data as unknown[]) || [];
    const paging = result.paging as Record<string, unknown> | undefined;
    const cursors = paging?.cursors as Record<string, string> | undefined;

    return {
      data,
      nextCursor: cursors?.after,
    };
  }
}