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