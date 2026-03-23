// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { MetaGraphApiClient } from "./meta-graph-api-client.js";
import type { RateLimiter } from "../../utils/security/rate-limiter.js";
import { type RequestContext, executeBulkConcurrent } from "@cesteral/shared";
import {
  getEntityConfig,
  type MetaEntityType,
} from "../../mcp-server/tools/utils/entity-mapping.js";
import type { Logger } from "pino";
import type {
  MetaCampaign,
  MetaAdSet,
  MetaAd,
  MetaAdCreative,
  MetaCustomAudience,
  MetaAdAccount,
} from "./types.js";

export type {
  MetaCampaign,
  MetaAdSet,
  MetaAd,
  MetaAdCreative,
  MetaCustomAudience,
  MetaAdAccount,
};

interface MetaEntityMap {
  campaign: MetaCampaign;
  adSet: MetaAdSet;
  ad: MetaAd;
  adCreative: MetaAdCreative;
  customAudience: MetaCustomAudience;
}

/**
 * Meta Service — Generic CRUD operations for Meta Ads entities,
 * plus bulk operations and entity duplication.
 *
 * Uses entity-mapping.ts for API path construction and MetaGraphApiClient
 * for authenticated HTTP calls with retry logic.
 */
export class MetaService {
  constructor(
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: MetaGraphApiClient,
    private readonly logger: Logger,
  ) {}

  /** Expose the underlying Graph API client for direct use (e.g., media uploads). */
  get graphApiClient(): MetaGraphApiClient {
    return this.httpClient;
  }

  // ─── Standard CRUD ─────────────────────────────────────────────────

  async listEntities<T extends MetaEntityType>(
    entityType: T,
    adAccountId: string,
    fields?: string[],
    filtering?: Record<string, unknown>[],
    limit?: number,
    after?: string,
    context?: RequestContext
  ): Promise<{ entities: MetaEntityMap[T][]; nextCursor?: string }> {
    const config = getEntityConfig(entityType);

    await this.rateLimiter.consume(`meta:${adAccountId}`);

    const actId = this.normalizeAccountId(adAccountId);
    const params: Record<string, string> = {};

    if (fields?.length) {
      params.fields = fields.join(",");
    } else if (config.defaultFields) {
      params.fields = config.defaultFields.join(",");
    }

    if (filtering?.length) {
      params.filtering = JSON.stringify(filtering);
    }

    if (limit) {
      params.limit = String(limit);
    }

    if (after) {
      params.after = after;
    }

    const result = (await this.httpClient.get(
      `/${actId}/${config.edge}`,
      params,
      context
    )) as Record<string, unknown>;

    if (result.data !== undefined && !Array.isArray(result.data)) {
      this.logger.warn({ dataType: typeof result.data, entityType }, "Meta API returned unexpected non-array data field");
    }
    const entities = (Array.isArray(result.data) ? result.data : []) as MetaEntityMap[T][];
    const paging = result.paging as Record<string, unknown> | undefined;
    const cursors = paging?.cursors as Record<string, string> | undefined;

    return {
      entities,
      nextCursor: cursors?.after,
    };
  }

  async getEntity<T extends MetaEntityType>(
    entityType: T,
    entityId: string,
    fields?: string[],
    context?: RequestContext
  ): Promise<MetaEntityMap[T]> {
    const config = getEntityConfig(entityType);

    await this.rateLimiter.consume(`meta:default`);

    const params: Record<string, string> = {};

    if (fields?.length) {
      params.fields = fields.join(",");
    } else if (config.defaultFields) {
      params.fields = config.defaultFields.join(",");
    }

    return this.httpClient.get(`/${entityId}`, params, context) as Promise<MetaEntityMap[T]>;
  }

  async createEntity<T extends MetaEntityType>(
    entityType: T,
    adAccountId: string,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<MetaEntityMap[T]> {
    const config = getEntityConfig(entityType);

    // Writes consume 3x rate limit tokens
    await this.rateLimiter.consume(`meta:${adAccountId}`, 3);

    const actId = this.normalizeAccountId(adAccountId);

    return this.httpClient.post(`/${actId}/${config.edge}`, data, context) as Promise<MetaEntityMap[T]>;
  }

  async updateEntity(
    entityId: string,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    // Writes consume 3x rate limit tokens
    await this.rateLimiter.consume(`meta:default`, 3);

    // Meta uses POST with PATCH semantics for updates
    return this.httpClient.post(`/${entityId}`, data, context);
  }

  async deleteEntity(
    entityId: string,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`meta:default`, 3);

    return this.httpClient.delete(`/${entityId}`, context);
  }

  // ─── Bulk Operations ──────────────────────────────────────────────

  /**
   * Bulk create entities of the same type.
   * Sends individual create calls with concurrency limit.
   */
  async bulkCreateEntities(
    entityType: MetaEntityType,
    adAccountId: string,
    items: Record<string, unknown>[],
    context?: RequestContext
  ): Promise<{ results: Array<{ success: boolean; entity?: unknown; error?: string }> }> {
    const results = await executeBulkConcurrent(items, async (data) => {
      return this.createEntity(entityType, adAccountId, data, context);
    }, { logger: this.logger });
    return { results };
  }

  /**
   * Bulk update entity statuses.
   * Each entity is updated to the target status via POST /{id}.
   */
  async bulkUpdateStatus(
    entityIds: string[],
    status: "ACTIVE" | "PAUSED" | "ARCHIVED",
    context?: RequestContext
  ): Promise<{ results: Array<{ entityId: string; success: boolean; error?: string }> }> {
    this.logger.debug({ count: entityIds.length, status }, "Bulk status update");
    const bulkResults = await executeBulkConcurrent(entityIds, async (entityId) => {
      return this.updateEntity(entityId, { status }, context);
    }, { logger: this.logger });

    return {
      results: bulkResults.map((r, i) => ({
        entityId: entityIds[i],
        success: r.success,
        error: r.error,
      })),
    };
  }

  /**
   * Bulk update entities with arbitrary data.
   * Each item is updated individually with concurrency limit.
   */
  async bulkUpdateEntities(
    items: Array<{ entityId: string; data: Record<string, unknown> }>,
    context?: RequestContext
  ): Promise<{ results: Array<{ entityId: string; success: boolean; error?: string }> }> {
    const bulkResults = await executeBulkConcurrent(items, async (item) => {
      return this.updateEntity(item.entityId, item.data, context);
    }, { logger: this.logger });

    return {
      results: bulkResults.map((r, i) => ({
        entityId: items[i].entityId,
        success: r.success,
        error: r.error,
      })),
    };
  }

  // ─── Duplicate ──────────────────────────────────────────────────

  /**
   * Duplicate a campaign, ad set, or ad via POST /{id}/copies.
   */
  async duplicateEntity(
    entityId: string,
    options?: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`meta:default`, 3);

    return this.httpClient.post(`/${entityId}/copies`, options, context);
  }

  // ─── Ad Accounts ───────────────────────────────────────────────

  /**
   * List ad accounts accessible to the authenticated user.
   */
  async listAdAccounts(
    fields?: string[],
    limit?: number,
    after?: string,
    context?: RequestContext
  ): Promise<{ accounts: MetaAdAccount[]; nextCursor?: string }> {
    await this.rateLimiter.consume(`meta:default`);

    const defaultFields = [
      "id", "name", "account_status", "currency",
      "timezone_name", "amount_spent", "balance",
    ];

    const params: Record<string, string> = {
      fields: fields?.join(",") || defaultFields.join(","),
    };

    if (limit) {
      params.limit = String(limit);
    }

    if (after) {
      params.after = after;
    }

    const result = (await this.httpClient.get("/me/adaccounts", params, context)) as Record<string, unknown>;

    if (result.data !== undefined && !Array.isArray(result.data)) {
      this.logger.warn({ dataType: typeof result.data }, "Meta API returned unexpected non-array data field for ad accounts");
    }
    const accounts = (Array.isArray(result.data) ? result.data : []) as MetaAdAccount[];
    const paging = result.paging as Record<string, unknown> | undefined;
    const cursors = paging?.cursors as Record<string, string> | undefined;

    return {
      accounts,
      nextCursor: cursors?.after,
    };
  }

  // ─── Delivery Estimate ─────────────────────────────────────────

  /**
   * Get audience size / delivery estimate.
   * Tries /reachestimate first (returns estimated_audience_size),
   * falls back to /delivery_estimate on error (more fields but requires optimization_goal).
   */
  async getDeliveryEstimate(
    adAccountId: string,
    targetingSpec: Record<string, unknown>,
    optimizationGoal?: string,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`meta:${adAccountId}`);

    const actId = this.normalizeAccountId(adAccountId);

    // Try reachestimate first — lighter endpoint, no optimization_goal needed
    try {
      const reachParams: Record<string, string> = {
        targeting_spec: JSON.stringify(targetingSpec),
      };
      const result = await this.httpClient.get(`/${actId}/reachestimate`, reachParams, context);
      return result;
    } catch (err) {
      this.logger.debug({ err }, "reachestimate failed, falling back to delivery_estimate");
    }

    // Fallback to delivery_estimate
    const params: Record<string, string> = {
      targeting_spec: JSON.stringify(targetingSpec),
    };

    if (optimizationGoal) {
      params.optimization_goal = optimizationGoal;
    }

    return this.httpClient.get(`/${actId}/delivery_estimate`, params, context);
  }

  // ─── Budget Schedules ─────────────────────────────────────────

  async createBudgetSchedule(
    campaignId: string,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`meta:default`, 3);

    return this.httpClient.post(`/${campaignId}/budget_schedules`, data, context);
  }

  async listBudgetSchedules(
    campaignId: string,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`meta:default`);

    return this.httpClient.get(`/${campaignId}/budget_schedules`, {}, context);
  }

  // ─── Ad Previews ───────────────────────────────────────────────

  async getAdPreviews(
    adId: string,
    adFormat: string,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`meta:default`);

    return this.httpClient.get(
      `/${adId}/previews`,
      { ad_format: adFormat },
      context
    );
  }

  // ─── Internal Helpers ─────────────────────────────────────────

  private normalizeAccountId(adAccountId: string): string {
    return adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  }

}