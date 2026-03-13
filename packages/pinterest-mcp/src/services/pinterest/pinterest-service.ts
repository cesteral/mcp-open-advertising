import type { PinterestHttpClient } from "./pinterest-http-client.js";
import type { RateLimiter } from "../../utils/security/rate-limiter.js";
import type { RequestContext } from "@cesteral/shared";
import {
  getEntityConfig,
  interpolatePath,
  type PinterestEntityType,
} from "../../mcp-server/tools/utils/entity-mapping.js";
import type { Logger } from "pino";

/** Pinterest v5 list response shape — cursor-based pagination */
interface PinterestListResponse {
  items: unknown[];
  bookmark?: string | null;
}

/** Page info shape returned by listEntities */
interface PinterestPageInfo {
  bookmark: string | null;
}

/**
 * Pinterest Service — Generic CRUD operations for Pinterest Marketing API v5 entities,
 * plus bulk operations and bid adjustment.
 *
 * Pinterest v5 patterns:
 * - ad_account_id is in the URL path (interpolated via interpolatePath)
 * - Pagination is cursor-based via `bookmark` query param
 * - Create: POST with array body `[entityObject]`, returns `{ items: [created] }`
 * - Update: PATCH with array body `[{ id, ...fields }]`, returns `{ items: [updated] }`
 * - Delete: DELETE with query params `?campaign_ids=id1,id2`
 * - Status update: PATCH (status is just a field in the update body)
 */
export class PinterestService {
  constructor(
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: PinterestHttpClient,
    private readonly logger: Logger
  ) {}

  /** Expose the underlying HTTP client for direct use (e.g., media uploads). */
  get client(): PinterestHttpClient {
    return this.httpClient;
  }

  // ─── Standard CRUD ──────────────────────────────────────────────

  async listEntities(
    entityType: PinterestEntityType,
    filters: { adAccountId: string; campaignId?: string; adGroupId?: string },
    bookmark?: string,
    pageSize = 25,
    context?: RequestContext
  ): Promise<{ entities: unknown[]; pageInfo: PinterestPageInfo }> {
    const config = getEntityConfig(entityType);
    const path = interpolatePath(config.listPath, { adAccountId: filters.adAccountId });
    const params: Record<string, string> = { page_size: String(pageSize) };
    if (bookmark) params.bookmark = bookmark;
    if (filters.campaignId) params.campaign_id = filters.campaignId;
    if (filters.adGroupId) params.ad_group_id = filters.adGroupId;

    await this.rateLimiter.consume(`pinterest:${filters.adAccountId}`);

    const data = await this.httpClient.get(path, params, context) as PinterestListResponse;

    return {
      entities: data?.items ?? [],
      pageInfo: { bookmark: data?.bookmark ?? null },
    };
  }

  async getEntity(
    entityType: PinterestEntityType,
    filters: { adAccountId: string },
    entityId: string,
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);
    // For entities with an {entityId} in the path (e.g. pins), interpolate both
    const path = interpolatePath(config.listPath, {
      adAccountId: filters.adAccountId,
      entityId,
    });

    await this.rateLimiter.consume(`pinterest:${filters.adAccountId}`);

    // If path has no {entityId} token (was replaced), fetch single item via list + filter
    // Otherwise the interpolated path IS the single-entity path
    if (path.includes("{")) {
      // Fallback: get by listing and filtering
      const data = await this.httpClient.get(path, { [config.idField]: entityId, page_size: "1" }, context) as PinterestListResponse;
      const list = data?.items ?? [];
      if (list.length === 0) {
        throw new Error(`${config.displayName} with ID ${entityId} not found`);
      }
      return list[0];
    }

    // Path was fully interpolated — call directly
    const result = await this.httpClient.get(path, {}, context) as PinterestListResponse | Record<string, unknown>;

    // If single-entity response (e.g. GET /v5/pins/{id}), return as-is
    if (!("items" in (result as object))) {
      return result;
    }

    // Otherwise it's a list; find by id
    const list = (result as PinterestListResponse).items ?? [];
    const entity = list.find(
      (e) => (e as Record<string, unknown>)[config.idField] === entityId
    );
    if (!entity) {
      throw new Error(`${config.displayName} with ID ${entityId} not found`);
    }
    return entity;
  }

  async createEntity(
    entityType: PinterestEntityType,
    filters: { adAccountId: string },
    body: unknown,
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);
    const path = interpolatePath(config.createPath, { adAccountId: filters.adAccountId });

    await this.rateLimiter.consume(`pinterest:${filters.adAccountId}`, 3);

    const data = await this.httpClient.post(path, [body], context) as { items?: unknown[] };
    return (data?.items ?? [])[0];
  }

  async updateEntity(
    entityType: PinterestEntityType,
    filters: { adAccountId: string },
    entityId: string,
    updates: unknown,
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);
    const path = interpolatePath(config.updatePath, { adAccountId: filters.adAccountId, entityId });

    await this.rateLimiter.consume(`pinterest:${filters.adAccountId}`, 3);

    const data = await this.httpClient.patch(
      path,
      [{ id: entityId, ...(updates as object) }],
      context
    ) as { items?: unknown[] };
    return (data?.items ?? [])[0];
  }

  async deleteEntity(
    entityType: PinterestEntityType,
    filters: { adAccountId: string },
    entityIds: string[],
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);
    const path = interpolatePath(config.deletePath, { adAccountId: filters.adAccountId });

    await this.rateLimiter.consume(`pinterest:${filters.adAccountId}`, 3);

    return this.httpClient.delete(
      path,
      { [config.deleteIdsParam]: entityIds.join(",") },
      context
    );
  }

  async updateEntityStatus(
    entityType: PinterestEntityType,
    filters: { adAccountId: string },
    entityIds: string[],
    status: string,
    context?: RequestContext
  ): Promise<unknown[]> {
    return Promise.all(
      entityIds.map((id) => this.updateEntity(entityType, filters, id, { status }, context))
    );
  }

  // ─── Ad Accounts ──────────────────────────────────────────────────

  async listAdAccounts(context?: RequestContext): Promise<unknown> {
    await this.rateLimiter.consume("pinterest:default");
    return this.httpClient.get("/v5/ad_accounts", {}, context);
  }

  // ─── Duplicate ──────────────────────────────────────────────────

  async duplicateEntity(
    entityType: PinterestEntityType,
    filters: { adAccountId: string },
    entityId: string,
    options?: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);

    if (!config.supportsDuplicate) {
      this.logger.debug({ entityType }, "Duplicate skipped: entity type does not support duplication");
      throw new Error(`Entity type ${entityType} does not support duplication`);
    }

    const basePath = interpolatePath(config.createPath, { adAccountId: filters.adAccountId });
    const copyPath = basePath.replace(/\/([^/]+)$/, "/$1/copy");

    await this.rateLimiter.consume(`pinterest:${filters.adAccountId}`, 3);

    return this.httpClient.post(copyPath, { id: entityId, ...options }, context);
  }

  // ─── Bid Adjustment ─────────────────────────────────────────────

  async adjustBids(
    filters: { adAccountId: string },
    adjustments: Array<{ adGroupId: string; bidPrice: number }>,
    context?: RequestContext
  ): Promise<{ results: Array<{ adGroupId: string; success: boolean; previousBid?: number; newBid?: number; error?: string }> }> {
    const results: Array<{ adGroupId: string; success: boolean; previousBid?: number; newBid?: number; error?: string }> = [];

    for (const adjustment of adjustments) {
      try {
        // Read current ad group state
        const entity = (await this.getEntity("adGroup", filters, adjustment.adGroupId, context)) as Record<string, unknown>;
        const previousBid = entity.bid_in_micro_currency != null ? Number(entity.bid_in_micro_currency) : undefined;

        // Update bid
        await this.updateEntity("adGroup", filters, adjustment.adGroupId, {
          bid_in_micro_currency: adjustment.bidPrice,
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
    entityType: PinterestEntityType,
    filters: { adAccountId: string },
    items: unknown[],
    context?: RequestContext
  ): Promise<{ results: Array<{ success: boolean; entity?: unknown; error?: string }> }> {
    const results = await this.executeBulk(items, async (data) => {
      return this.createEntity(entityType, filters, data, context);
    });
    return { results };
  }

  async bulkUpdateEntities(
    entityType: PinterestEntityType,
    filters: { adAccountId: string },
    items: Array<{ entityId: string; data: unknown }>,
    context?: RequestContext
  ): Promise<{ results: Array<{ entityId: string; success: boolean; error?: string }> }> {
    const bulkResults = await this.executeBulk(items, async (item) => {
      return this.updateEntity(entityType, filters, item.entityId, item.data, context);
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
    entityType: PinterestEntityType,
    filters: { adAccountId: string },
    entityIds: string[],
    status: string,
    context?: RequestContext
  ): Promise<{ results: Array<{ entityId: string; success: boolean; error?: string }> }> {
    this.logger.debug({ entityType, count: entityIds.length, status }, "Bulk status update");
    try {
      await this.updateEntityStatus(entityType, filters, entityIds, status, context);
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
    await this.rateLimiter.consume("pinterest:default");

    const params: Record<string, string> = {
      targeting_type: targetingType,
      count: String(limit),
    };

    if (query) {
      params.keyword = query;
    }

    return this.httpClient.get("/v5/targeting_options", params, context);
  }

  async getTargetingOptions(
    targetingType?: string,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume("pinterest:default");

    const params: Record<string, string> = {};
    if (targetingType) {
      params.targeting_type = targetingType;
    }

    return this.httpClient.get("/v5/targeting_options", params, context);
  }

  // ─── Audience Estimate ──────────────────────────────────────────

  async getAudienceEstimate(
    filters: { adAccountId: string },
    targetingConfig: unknown,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`pinterest:${filters.adAccountId}`);

    const path = `/v5/ad_accounts/${filters.adAccountId}/delivery_metrics/audience_sizing`;
    return this.httpClient.post(path, targetingConfig, context);
  }

  // ─── Ad Previews ────────────────────────────────────────────────

  async getAdPreviews(
    filters: { adAccountId: string },
    adId: string,
    adFormat?: string,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`pinterest:${filters.adAccountId}`);

    const params: Record<string, string> = { ad_id: adId };
    if (adFormat) {
      params.ad_format = adFormat;
    }

    const path = `/v5/ad_accounts/${filters.adAccountId}/ads/previews`;
    return this.httpClient.get(path, params, context);
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
