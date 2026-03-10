import type { TikTokHttpClient } from "./tiktok-http-client.js";
import type { RateLimiter } from "../../utils/security/rate-limiter.js";
import type { RequestContext } from "@cesteral/shared";
import {
  getEntityConfig,
  type TikTokEntityType,
} from "../../mcp-server/tools/utils/entity-mapping.js";
import type { Logger } from "pino";

/** TikTok page_info response shape */
interface TikTokPageInfo {
  page: number;
  page_size: number;
  total_number: number;
  total_page: number;
}

/** TikTok list response data shape */
interface TikTokListData {
  list: unknown[];
  page_info: TikTokPageInfo;
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
    private readonly logger: Logger
  ) {}

  /** Expose the underlying HTTP client for direct use (e.g., media uploads). */
  get client(): TikTokHttpClient {
    return this.httpClient;
  }

  // ─── Standard CRUD ──────────────────────────────────────────────

  async listEntities(
    entityType: TikTokEntityType,
    filters?: Record<string, unknown>,
    page = 1,
    pageSize = 10,
    context?: RequestContext
  ): Promise<{ entities: unknown[]; pageInfo: TikTokPageInfo }> {
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

    const result = (await this.httpClient.get(config.listPath, params, context)) as TikTokListData;

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

  async getEntity(
    entityType: TikTokEntityType,
    entityId: string,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`tiktok:default`);

    const config = getEntityConfig(entityType);
    const params: Record<string, string> = {
      [config.idsField]: JSON.stringify([entityId]),
      page_size: "1",
      fields: JSON.stringify(config.defaultFields),
    };

    const result = (await this.httpClient.get(config.listPath, params, context)) as TikTokListData;

    const list = result?.list ?? [];
    if (list.length === 0) {
      throw new Error(`${config.displayName} with ID ${entityId} not found`);
    }

    return list[0];
  }

  async createEntity(
    entityType: TikTokEntityType,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);

    await this.rateLimiter.consume(`tiktok:default`, 3);

    return this.httpClient.post(config.createPath, data, context);
  }

  async updateEntity(
    entityType: TikTokEntityType,
    entityId: string,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);

    await this.rateLimiter.consume(`tiktok:default`, 3);

    // TikTok uses POST for updates, with entity ID in body
    return this.httpClient.post(config.updatePath, {
      [config.idField]: entityId,
      ...data,
    }, context);
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

    await this.rateLimiter.consume(`tiktok:default`, 3);

    return this.httpClient.post(config.statusUpdatePath, {
      [config.idsField]: entityIds,
      operation_status: operationStatus,
    }, context);
  }

  // ─── Advertiser Account ──────────────────────────────────────────

  async listAdvertisers(context?: RequestContext): Promise<unknown> {
    await this.rateLimiter.consume(`tiktok:default`);

    return this.httpClient.get("/open_api/v1.3/advertiser/info/", {}, context);
  }

  // ─── Duplicate ──────────────────────────────────────────────────

  async duplicateEntity(
    entityType: TikTokEntityType,
    entityId: string,
    options?: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);

    if (!config.supportsDuplicate) {
      this.logger.debug({ entityType }, "Duplicate skipped: entity type does not support duplication");
      throw new Error(`Entity type ${entityType} does not support duplication`);
    }

    await this.rateLimiter.consume(`tiktok:default`, 3);

    // TikTok copy endpoints follow pattern /{entity}/copy/
    const copyPath = config.createPath.replace("/create/", "/copy/");

    return this.httpClient.post(copyPath, {
      [config.idField]: entityId,
      ...options,
    }, context);
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
        const entity = (await this.getEntity("adGroup", adjustment.adGroupId, context)) as Record<string, unknown>;
        const previousBid = entity.bid_price != null ? Number(entity.bid_price) : undefined;

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

  async bulkCreateEntities(
    entityType: TikTokEntityType,
    items: Record<string, unknown>[],
    context?: RequestContext
  ): Promise<{ results: Array<{ success: boolean; entity?: unknown; error?: string }> }> {
    const results = await this.executeBulk(items, async (data) => {
      return this.createEntity(entityType, data, context);
    });
    return { results };
  }

  async bulkUpdateEntities(
    entityType: TikTokEntityType,
    items: Array<{ entityId: string; data: Record<string, unknown> }>,
    context?: RequestContext
  ): Promise<{ results: Array<{ entityId: string; success: boolean; error?: string }> }> {
    const bulkResults = await this.executeBulk(items, async (item) => {
      return this.updateEntity(entityType, item.entityId, item.data, context);
    });

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
        results: entityIds.map((entityId) => ({ entityId, success: true })),
      };
    } catch (error) {
      this.logger.debug({ entityType, error }, "Bulk status update failed for all entities");
      return {
        results: entityIds.map((entityId) => ({
          entityId,
          success: false,
          error: error instanceof Error ? error.message : String(error),
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

    return this.httpClient.get("/open_api/v1.3/search/targeting/", params, context);
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

    return this.httpClient.get("/open_api/v1.3/targeting/list/", params, context);
  }

  // ─── Audience Estimate ──────────────────────────────────────────

  async getAudienceEstimate(
    targetingConfig: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`tiktok:default`);

    return this.httpClient.post("/open_api/v1.3/audience/estimate/", targetingConfig, context);
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

    return this.httpClient.get("/open_api/v1.3/ad/preview/", params, context);
  }

  // ─── Internal Helpers ───────────────────────────────────────────

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
