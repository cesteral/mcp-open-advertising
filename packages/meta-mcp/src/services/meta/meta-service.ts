// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { MetaGraphApiClient } from "./meta-graph-api-client.js";
import { nextPageCursor } from "./paging.js";
import type { RateLimiter } from "@cesteral/shared";
import {
  type RequestContext,
  executeBulkConcurrent,
  JsonRpcErrorCode,
  McpError,
} from "@cesteral/shared";
import {
  getEntityConfig,
  type MetaEntityType,
} from "../../mcp-server/tools/utils/entity-mapping.js";
import type { Logger } from "pino";
import {
  consumeMetaAccountQuota,
  consumeMetaUserQuota,
  normalizeMetaAdAccountId,
  type MetaQuotaScope,
} from "./rate-limit-keys.js";
import type {
  MetaCampaign,
  MetaAdSet,
  MetaAd,
  MetaAdCreative,
  MetaCustomAudience,
  MetaAdAccount,
} from "./types.js";

export type { MetaCampaign, MetaAdSet, MetaAd, MetaAdCreative, MetaCustomAudience, MetaAdAccount };

/**
 * Limiter tokens one read / one write `consume` costs (a read passes no count,
 * i.e. `consume`'s default of 1). Exported because the bulk capacity pre-check
 * (`tools/utils/bulk-capacity.ts`) projects a batch from exactly these costs —
 * a change here must move the projection with it.
 */
export const META_READ_TOKENS = 1;
export const META_WRITE_TOKENS = 3;

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
    private readonly logger: Logger
  ) {}

  /**
   * This session's rate-limit scope — the Graph user its calls are counted
   * against (see `rate-limit-keys.ts`). The bulk capacity pre-check projects a
   * batch against exactly the buckets this service's calls consume from.
   */
  get quotaScope(): MetaQuotaScope {
    return { quotaUser: this.httpClient.quotaUser };
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

    await consumeMetaAccountQuota(this.rateLimiter, this.httpClient, adAccountId, META_READ_TOKENS);

    const actId = normalizeMetaAdAccountId(adAccountId);
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
      this.logger.warn(
        { dataType: typeof result.data, entityType },
        "Meta API returned unexpected non-array data field"
      );
    }
    const entities = (Array.isArray(result.data) ? result.data : []) as MetaEntityMap[T][];

    return {
      entities,
      nextCursor: nextPageCursor(result.paging),
    };
  }

  async getEntity<T extends MetaEntityType>(
    entityType: T,
    entityId: string,
    fields?: string[],
    context?: RequestContext
  ): Promise<MetaEntityMap[T]> {
    const config = getEntityConfig(entityType);

    await consumeMetaUserQuota(this.rateLimiter, this.httpClient, META_READ_TOKENS);

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
    await consumeMetaAccountQuota(
      this.rateLimiter,
      this.httpClient,
      adAccountId,
      META_WRITE_TOKENS
    );

    const actId = normalizeMetaAdAccountId(adAccountId);

    return this.httpClient.post(`/${actId}/${config.edge}`, data, context) as Promise<
      MetaEntityMap[T]
    >;
  }

  async updateEntity(
    entityId: string,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    // Writes consume 3x rate limit tokens
    await consumeMetaUserQuota(this.rateLimiter, this.httpClient, META_WRITE_TOKENS);

    // Meta uses POST with PATCH semantics for updates
    return this.httpClient.post(`/${entityId}`, data, context);
  }

  async deleteEntity(entityId: string, context?: RequestContext): Promise<unknown> {
    await consumeMetaUserQuota(this.rateLimiter, this.httpClient, META_WRITE_TOKENS);

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
    const results = await executeBulkConcurrent(
      items,
      async (data) => {
        return this.createEntity(entityType, adAccountId, data, context);
      },
      { logger: this.logger }
    );
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
    const bulkResults = await executeBulkConcurrent(
      entityIds,
      async (entityId) => {
        return this.updateEntity(entityId, { status }, context);
      },
      { logger: this.logger }
    );

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
    const bulkResults = await executeBulkConcurrent(
      items,
      async (item) => {
        return this.updateEntity(item.entityId, item.data, context);
      },
      { logger: this.logger }
    );

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
    await consumeMetaUserQuota(this.rateLimiter, this.httpClient, META_WRITE_TOKENS);

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
    await consumeMetaUserQuota(this.rateLimiter, this.httpClient, META_READ_TOKENS);

    const defaultFields = [
      "id",
      "name",
      "account_status",
      "currency",
      "timezone_name",
      "amount_spent",
      "balance",
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

    const result = (await this.httpClient.get("/me/adaccounts", params, context)) as Record<
      string,
      unknown
    >;

    if (result.data !== undefined && !Array.isArray(result.data)) {
      this.logger.warn(
        { dataType: typeof result.data },
        "Meta API returned unexpected non-array data field for ad accounts"
      );
    }
    const accounts = (Array.isArray(result.data) ? result.data : []) as MetaAdAccount[];

    return {
      accounts,
      nextCursor: nextPageCursor(result.paging),
    };
  }

  // ─── Delivery Estimate ─────────────────────────────────────────

  /**
   * Get audience size / delivery estimate.
   *
   * Tries `GET /act_{id}/reachestimate` first (only `targeting_spec` is
   * required; returns `users_lower_bound` / `users_upper_bound` /
   * `estimate_ready` — AdAccountReachEstimate), then falls back to
   * `GET /act_{id}/delivery_estimate`, which REQUIRES `optimization_goal`
   * (AdAccountDeliveryEstimate: `estimate_mau_lower_bound` /
   * `estimate_mau_upper_bound` / …). Both per Meta's
   * facebook-business-sdk-codegen api_specs (AdAccount.json).
   *
   * The fallback runs only when it can help: the reachestimate call was
   * rejected as an invalid request (not an auth, permission, throttle or
   * upstream failure — those would fail the same way again, and retrying them
   * would only hide the real reason) AND an `optimizationGoal` was supplied.
   * Each upstream call draws its own limiter token.
   */
  async getDeliveryEstimate(
    adAccountId: string,
    targetingSpec: Record<string, unknown>,
    optimizationGoal?: string,
    context?: RequestContext
  ): Promise<unknown> {
    await consumeMetaAccountQuota(this.rateLimiter, this.httpClient, adAccountId, META_READ_TOKENS);

    const actId = normalizeMetaAdAccountId(adAccountId);

    const targeting = JSON.stringify(targetingSpec);
    try {
      return await this.httpClient.get(
        `/${actId}/reachestimate`,
        { targeting_spec: targeting },
        context
      );
    } catch (err) {
      const rejectedAsInvalid =
        err instanceof McpError && err.code === JsonRpcErrorCode.InvalidRequest;
      if (optimizationGoal === undefined || !rejectedAsInvalid) throw err;
      this.logger.debug({ err }, "reachestimate rejected, falling back to delivery_estimate");
      await consumeMetaAccountQuota(
        this.rateLimiter,
        this.httpClient,
        adAccountId,
        META_READ_TOKENS
      );
      return this.httpClient.get(
        `/${actId}/delivery_estimate`,
        { targeting_spec: targeting, optimization_goal: optimizationGoal },
        context
      );
    }
  }

  // ─── Budget Schedules ─────────────────────────────────────────

  async createBudgetSchedule(
    campaignId: string,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    await consumeMetaUserQuota(this.rateLimiter, this.httpClient, META_WRITE_TOKENS);

    return this.httpClient.post(`/${campaignId}/budget_schedules`, data, context);
  }

  async listBudgetSchedules(campaignId: string, context?: RequestContext): Promise<unknown> {
    await consumeMetaUserQuota(this.rateLimiter, this.httpClient, META_READ_TOKENS);

    return this.httpClient.get(`/${campaignId}/budget_schedules`, {}, context);
  }

  // ─── Ad Previews ───────────────────────────────────────────────

  async getAdPreviews(adId: string, adFormat: string, context?: RequestContext): Promise<unknown> {
    await consumeMetaUserQuota(this.rateLimiter, this.httpClient, META_READ_TOKENS);

    return this.httpClient.get(`/${adId}/previews`, { ad_format: adFormat }, context);
  }

  // ─── Media Uploads ─────────────────────────────────────────────

  /**
   * POST the image bytes to `/act_{id}/adimages` (multipart). One write on the
   * account's bucket: an upload creates an AdImage, and Meta scores a write
   * as 3 points (see `rate-limit-keys.ts`).
   */
  async uploadAdImage(
    adAccountId: string,
    fields: Record<string, string>,
    buffer: Buffer,
    filename: string,
    contentType: string,
    context?: RequestContext
  ): Promise<unknown> {
    await consumeMetaAccountQuota(
      this.rateLimiter,
      this.httpClient,
      adAccountId,
      META_WRITE_TOKENS
    );
    return this.httpClient.postMultipart(
      `/${normalizeMetaAdAccountId(adAccountId)}/adimages`,
      fields,
      "bytes",
      buffer,
      filename,
      contentType,
      context
    );
  }

  /**
   * POST the video bytes to `/act_{id}/advideos` (multipart `source`). One
   * write on the account's bucket.
   */
  async uploadAdVideo(
    adAccountId: string,
    fields: Record<string, string>,
    buffer: Buffer,
    filename: string,
    contentType: string,
    context?: RequestContext
  ): Promise<unknown> {
    await consumeMetaAccountQuota(
      this.rateLimiter,
      this.httpClient,
      adAccountId,
      META_WRITE_TOKENS
    );
    return this.httpClient.postMultipart(
      `/${normalizeMetaAdAccountId(adAccountId)}/advideos`,
      fields,
      "source",
      buffer,
      filename,
      contentType,
      context
    );
  }

  /**
   * One processing-status read of an uploaded video (`GET /{video_id}?fields=status`),
   * on the bucket of the account it was uploaded to. Each poll is its own
   * Graph call and draws its own read token.
   */
  async getVideoStatus(
    adAccountId: string,
    videoId: string,
    context?: RequestContext
  ): Promise<unknown> {
    await consumeMetaAccountQuota(this.rateLimiter, this.httpClient, adAccountId, META_READ_TOKENS);
    return this.httpClient.get(`/${videoId}`, { fields: "status" }, context);
  }
}
