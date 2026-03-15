// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { MetaGraphApiClient } from "./meta-graph-api-client.js";
import type { RateLimiter } from "../../utils/security/rate-limiter.js";
import type { RequestContext } from "@cesteral/shared";
import {
  getEntityConfig,
  type MetaEntityType,
} from "../../mcp-server/tools/utils/entity-mapping.js";
import type { Logger } from "pino";

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

  async listEntities(
    entityType: MetaEntityType,
    adAccountId: string,
    fields?: string[],
    filtering?: Record<string, unknown>[],
    limit?: number,
    after?: string,
    context?: RequestContext
  ): Promise<{ entities: unknown[]; nextCursor?: string }> {
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
    const entities = Array.isArray(result.data) ? result.data : [];
    const paging = result.paging as Record<string, unknown> | undefined;
    const cursors = paging?.cursors as Record<string, string> | undefined;

    return {
      entities,
      nextCursor: cursors?.after,
    };
  }

  async getEntity(
    entityType: MetaEntityType,
    entityId: string,
    fields?: string[],
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);

    await this.rateLimiter.consume(`meta:default`);

    const params: Record<string, string> = {};

    if (fields?.length) {
      params.fields = fields.join(",");
    } else if (config.defaultFields) {
      params.fields = config.defaultFields.join(",");
    }

    return this.httpClient.get(`/${entityId}`, params, context);
  }

  async createEntity(
    entityType: MetaEntityType,
    adAccountId: string,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);

    // Writes consume 3x rate limit tokens
    await this.rateLimiter.consume(`meta:${adAccountId}`, 3);

    const actId = this.normalizeAccountId(adAccountId);

    return this.httpClient.post(`/${actId}/${config.edge}`, data, context);
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
    const results = await this.executeBulk(items, async (data) => {
      return this.createEntity(entityType, adAccountId, data, context);
    });
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
    const bulkResults = await this.executeBulk(entityIds, async (entityId) => {
      return this.updateEntity(entityId, { status }, context);
    });

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
    const bulkResults = await this.executeBulk(items, async (item) => {
      return this.updateEntity(item.entityId, item.data, context);
    });

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
  ): Promise<{ accounts: unknown[]; nextCursor?: string }> {
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
    const accounts = Array.isArray(result.data) ? result.data : [];
    const paging = result.paging as Record<string, unknown> | undefined;
    const cursors = paging?.cursors as Record<string, string> | undefined;

    return {
      accounts,
      nextCursor: cursors?.after,
    };
  }

  // ─── Delivery Estimate ─────────────────────────────────────────

  async getDeliveryEstimate(
    adAccountId: string,
    targetingSpec: Record<string, unknown>,
    optimizationGoal?: string,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`meta:${adAccountId}`);

    const actId = this.normalizeAccountId(adAccountId);
    const params: Record<string, string> = {
      targeting_spec: JSON.stringify(targetingSpec),
    };

    if (optimizationGoal) {
      params.optimization_goal = optimizationGoal;
    }

    return this.httpClient.get(`/${actId}/delivery_estimate`, params, context);
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

  private async executeBulk<T>(
    items: T[],
    operation: (item: T) => Promise<unknown>
  ): Promise<Array<{ success: boolean; entity?: unknown; error?: string }>> {
    const CONCURRENCY = 5;
    const results: Array<{ success: boolean; entity?: unknown; error?: string }> = new Array(items.length);

    for (let i = 0; i < items.length; i += CONCURRENCY) {
      const batch = items.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.allSettled(
        batch.map((item) => operation(item))
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        if (result.status === "fulfilled") {
          results[i + j] = { success: true, entity: result.value };
        } else {
          this.logger.debug({ error: result.reason }, "Bulk operation item failed");
          results[i + j] = {
            success: false,
            error: result.reason?.message ?? String(result.reason),
          };
        }
      }
    }

    return results;
  }
}