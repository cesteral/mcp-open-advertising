// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { TikTokHttpClient } from "./tiktok-http-client.js";
import type { RateLimiter } from "../../utils/security/rate-limiter.js";
import { type RequestContext, executeBulkConcurrent } from "@cesteral/shared";
import {
  getEntityConfig,
  type TikTokEntityType,
} from "../../mcp-server/tools/utils/entity-mapping.js";
import type { Logger } from "pino";
import type {
  CreateTikTokAdGroupRequest,
  CreateTikTokAdRequest,
  CreateTikTokCampaignRequest,
  TikTokAd,
  TikTokAdAccount,
  TikTokAdGroup,
  TikTokCampaign,
  TikTokCreative,
  TikTokPageInfoShape,
} from "./types.js";

export type {
  CreateTikTokAdGroupRequest,
  CreateTikTokAdRequest,
  CreateTikTokCampaignRequest,
  TikTokAd,
  TikTokAdAccount,
  TikTokAdGroup,
  TikTokCampaign,
  TikTokCreative,
  TikTokPageInfoShape,
};

interface TikTokEntityMap {
  campaign: TikTokCampaign;
  adGroup: TikTokAdGroup;
  ad: TikTokAd;
  creative: TikTokCreative;
}

type TikTokCreateEntityInputMap = {
  campaign: CreateTikTokCampaignRequest;
  adGroup: CreateTikTokAdGroupRequest;
  ad: CreateTikTokAdRequest;
  creative: Record<string, unknown>;
};

type TikTokUpdateEntityInputMap = {
  [K in TikTokEntityType]: Partial<TikTokEntityMap[K]> & Record<string, unknown>;
};

/** TikTok list response data shape */
interface TikTokListData<T> {
  list: T[];
  page_info: TikTokPageInfoShape;
}

interface TikTokAdvertiserListData {
  list?: TikTokAdAccount[];
}

/**
 * TikTok Service — Generic CRUD operations for TikTok Marketing API entities,
 * plus bulk operations and entity duplication.
 *
 * Key differences from Meta:
 * - advertiser_id is always required (injected by TikTokHttpClient)
 * - Updates use POST (not PATCH), with entity ID in the body
 * - Status updates use separate /status/update/ endpoints
 * - Deletes use separate /delete/ endpoints (POST with IDs array)
 * - Pagination is page-based (page, page_size), not cursor-based
 */
export class TikTokService {
  constructor(
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: TikTokHttpClient,
    private readonly logger: Logger,
    private readonly apiVersion: string = "v1.3"
  ) {}

  /** Expose the underlying HTTP client for direct use (e.g., media uploads). */
  get client(): TikTokHttpClient {
    return this.httpClient;
  }

  // ─── Standard CRUD ──────────────────────────────────────────────

  async listEntities<T extends TikTokEntityType>(
    entityType: T,
    filters?: Record<string, unknown>,
    page = 1,
    pageSize = 10,
    context?: RequestContext
  ): Promise<{ entities: TikTokEntityMap[T][]; pageInfo: TikTokPageInfoShape }> {
    await this.rateLimiter.consume(`tiktok:default`);

    const config = getEntityConfig(entityType);
    const params: Record<string, string> = {
      page: String(page),
      page_size: String(pageSize),
      fields: JSON.stringify(config.defaultFields),
    };

    if (filters && Object.keys(filters).length > 0) {
      params.filtering = JSON.stringify(filters);
    }

    const result = (await this.httpClient.get(
      config.listPath,
      params,
      context
    )) as TikTokListData<TikTokEntityMap[T]>;

    return {
      entities: result?.list ?? [],
      pageInfo: result?.page_info ?? {
        page,
        page_size: pageSize,
        total_number: 0,
        total_page: 0,
      },
    };
  }

  async getEntity<T extends TikTokEntityType>(
    entityType: T,
    entityId: string,
    context?: RequestContext
  ): Promise<TikTokEntityMap[T]> {
    await this.rateLimiter.consume(`tiktok:default`);

    const config = getEntityConfig(entityType);
    const params: Record<string, string> = {
      [config.idsField]: JSON.stringify([entityId]),
      page_size: "1",
      fields: JSON.stringify(config.defaultFields),
    };

    const result = (await this.httpClient.get(
      config.listPath,
      params,
      context
    )) as TikTokListData<TikTokEntityMap[T]>;

    const list = result?.list ?? [];
    if (list.length === 0) {
      throw new Error(`${config.displayName} with ID ${entityId} not found`);
    }

    return list[0];
  }

  async createEntity<T extends TikTokEntityType>(
    entityType: T,
    data: TikTokCreateEntityInputMap[T],
    context?: RequestContext
  ): Promise<TikTokEntityMap[T]> {
    const config = getEntityConfig(entityType);

    await this.rateLimiter.consume(`tiktok:default`, 3);

    return this.httpClient.post(
      config.createPath,
      data as unknown as Record<string, unknown>,
      context
    ) as Promise<TikTokEntityMap[T]>;
  }

  async updateEntity<T extends TikTokEntityType>(
    entityType: T,
    entityId: string,
    data: TikTokUpdateEntityInputMap[T],
    context?: RequestContext
  ): Promise<TikTokEntityMap[T]> {
    const config = getEntityConfig(entityType);

    await this.rateLimiter.consume(`tiktok:default`, 3);

    // TikTok uses POST for updates, with entity ID in body
    return this.httpClient.post(
      config.updatePath,
      {
        [config.idField]: entityId,
        ...data,
      },
      context
    ) as Promise<TikTokEntityMap[T]>;
  }

  async deleteEntity(
    entityType: TikTokEntityType,
    entityIds: string[],
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);

    await this.rateLimiter.consume(`tiktok:default`, 3);

    return this.httpClient.post(config.deletePath, {
      [config.idsField]: entityIds,
    }, context);
  }

  async updateEntityStatus(
    entityType: TikTokEntityType,
    entityIds: string[],
    operationStatus: "ENABLE" | "DISABLE" | "DELETE",
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);

    if (!config.supportsStatusUpdate) {
      throw new Error(`Entity type '${entityType}' does not support status updates. Use the regular update endpoint instead.`);
    }

    await this.rateLimiter.consume(`tiktok:default`, 3);

    return this.httpClient.post(config.statusUpdatePath, {
      [config.idsField]: entityIds,
      operation_status: operationStatus,
    }, context);
  }

  // ─── Advertiser Account ──────────────────────────────────────────

  async listAdvertisers(context?: RequestContext): Promise<TikTokAdvertiserListData> {
    await this.rateLimiter.consume(`tiktok:default`);

    return this.httpClient.get(
      `/open_api/${this.apiVersion}/advertiser/info/`,
      {},
      context
    ) as Promise<TikTokAdvertiserListData>;
  }

  // ─── Duplicate ──────────────────────────────────────────────────

  async duplicateEntity<T extends TikTokEntityType>(
    entityType: T,
    entityId: string,
    options?: Record<string, unknown>,
    context?: RequestContext
  ): Promise<TikTokEntityMap[T]> {
    const config = getEntityConfig(entityType);

    if (!config.supportsDuplicate) {
      this.logger.debug({ entityType }, "Duplicate skipped: entity type does not support duplication");
      throw new Error(`Entity type ${entityType} does not support duplication`);
    }

    await this.rateLimiter.consume(`tiktok:default`, 3);

    // TikTok copy endpoints follow pattern /{entity}/copy/
    const copyPath = config.createPath.replace("/create/", "/copy/");

    return this.httpClient.post(
      copyPath,
      {
        [config.idField]: entityId,
        ...options,
      },
      context
    ) as Promise<TikTokEntityMap[T]>;
  }

  // ─── Bid Adjustment ─────────────────────────────────────────────

  async adjustBids(
    adjustments: Array<{ adGroupId: string; bidPrice: number }>,
    context?: RequestContext
  ): Promise<{ results: Array<{ adGroupId: string; success: boolean; previousBid?: number; newBid?: number; error?: string }> }> {
    const results: Array<{ adGroupId: string; success: boolean; previousBid?: number; newBid?: number; error?: string }> = [];

    for (const adjustment of adjustments) {
      try {
        // Read current ad group state
        const entity = await this.getEntity("adGroup", adjustment.adGroupId, context);
        const previousBid = entity.bid_price;

        // Update bid
        await this.updateEntity("adGroup", adjustment.adGroupId, {
          bid_price: adjustment.bidPrice,
        }, context);

        results.push({
          adGroupId: adjustment.adGroupId,
          success: true,
          previousBid,
          newBid: adjustment.bidPrice,
        });
      } catch (error) {
        results.push({
          adGroupId: adjustment.adGroupId,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { results };
  }

  // ─── Bulk Operations ────────────────────────────────────────────

  async bulkCreateEntities<T extends TikTokEntityType>(
    entityType: T,
    items: TikTokCreateEntityInputMap[T][],
    context?: RequestContext
  ): Promise<{ results: Array<{ success: boolean; entity?: TikTokEntityMap[T]; error?: string }> }> {
    const results = await executeBulkConcurrent(items, async (data) => {
      return this.createEntity(entityType, data, context);
    }, { logger: this.logger });
    return { results };
  }

  async bulkUpdateEntities<T extends TikTokEntityType>(
    entityType: T,
    items: Array<{ entityId: string; data: TikTokUpdateEntityInputMap[T] }>,
    context?: RequestContext
  ): Promise<{ results: Array<{ entityId: string; success: boolean; error?: string }> }> {
    const bulkResults = await executeBulkConcurrent(items, async (item) => {
      return this.updateEntity(entityType, item.entityId, item.data, context);
    }, { logger: this.logger });

    return {
      results: bulkResults.map((r, i) => ({
        entityId: items[i].entityId,
        success: r.success,
        error: r.error,
      })),
    };
  }

  async bulkUpdateStatus(
    entityType: TikTokEntityType,
    entityIds: string[],
    operationStatus: "ENABLE" | "DISABLE" | "DELETE",
    context?: RequestContext
  ): Promise<{ results: Array<{ entityId: string; success: boolean; error?: string }> }> {
    this.logger.debug({ entityType, count: entityIds.length, operationStatus }, "Bulk status update");

    try {
      await this.updateEntityStatus(entityType, entityIds, operationStatus, context);
      return {
        results: entityIds.map((entityId) => ({
          entityId,
          success: true,
        })),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        results: entityIds.map((entityId) => ({
          entityId,
          success: false,
          error: errorMessage,
        })),
      };
    }
  }

  // ─── Targeting ───────────────────────────────────────────────────

  async searchTargeting(
    targetingType: string,
    query?: string,
    limit = 20,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`tiktok:default`);

    const params: Record<string, string> = {
      targeting_type: targetingType,
      count: String(limit),
    };

    if (query) {
      params.keyword = query;
    }

    return this.httpClient.get(`/open_api/${this.apiVersion}/search/targeting/`, params, context);
  }

  async getTargetingOptions(
    targetingType?: string,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`tiktok:default`);

    const params: Record<string, string> = {};
    if (targetingType) {
      params.objective_type = targetingType;
    }

    return this.httpClient.get(`/open_api/${this.apiVersion}/targeting/list/`, params, context);
  }

  // ─── Audience Estimate ──────────────────────────────────────────

  async getAudienceEstimate(
    targetingConfig: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`tiktok:default`);

    return this.httpClient.post(`/open_api/${this.apiVersion}/audience/estimate/`, targetingConfig, context);
  }

  // ─── Ad Previews ────────────────────────────────────────────────

  async getAdPreviews(
    adId: string,
    adFormat?: string,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`tiktok:default`);

    const params: Record<string, string> = {
      ad_id: adId,
    };

    if (adFormat) {
      params.ad_format = adFormat;
    }

    return this.httpClient.get(`/open_api/${this.apiVersion}/ad/preview/`, params, context);
  }

  // ─── Internal Helpers ───────────────────────────────────────────

}
