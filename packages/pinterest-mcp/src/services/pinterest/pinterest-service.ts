// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

// Generated TypeScript types for the Pinterest Marketing API v5 are available at
// src/generated/types.ts — run `pnpm run generate` to produce this file from the
// official Pinterest OpenAPI spec (https://raw.githubusercontent.com/pinterest/api-description/main/v5/openapi.json).

import type { PinterestHttpClient } from "./pinterest-http-client.js";
import type { RateLimiter } from "../../utils/security/rate-limiter.js";
import { type RequestContext, executeBulkConcurrent } from "@cesteral/shared";
import {
  getEntityConfig,
  interpolatePath,
  type PinterestEntityType,
} from "../../mcp-server/tools/utils/entity-mapping.js";
import type { Logger } from "pino";
import type { components } from "../../generated/types.js";

type PinterestCampaign = components["schemas"]["CampaignResponse"];
type PinterestAdGroup = components["schemas"]["AdGroupResponse"];
type PinterestAd = components["schemas"]["AdResponse"];
type PinterestPin = components["schemas"]["Pin"];

interface PinterestEntityMap {
  campaign: PinterestCampaign;
  adGroup: PinterestAdGroup;
  ad: PinterestAd;
  creative: PinterestPin;
}

export type {
  PinterestCampaign,
  PinterestAdGroup,
  PinterestAd,
  PinterestPin,
};

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

  async listEntities<T extends PinterestEntityType>(
    entityType: T,
    filters: { adAccountId: string; campaignId?: string; adGroupId?: string },
    bookmark?: string,
    pageSize = 25,
    context?: RequestContext
  ): Promise<{ entities: PinterestEntityMap[T][]; pageInfo: PinterestPageInfo }> {
    const config = getEntityConfig(entityType);
    const path = interpolatePath(config.listPath, { adAccountId: filters.adAccountId });
    const params: Record<string, string> = { page_size: String(pageSize) };
    if (bookmark) params.bookmark = bookmark;
    if (filters.campaignId) params.campaign_id = filters.campaignId;
    if (filters.adGroupId) params.ad_group_id = filters.adGroupId;

    await this.rateLimiter.consume(`pinterest:${filters.adAccountId}`);

    const data = await this.httpClient.get(path, params, context) as PinterestListResponse;

    return {
      entities: (data?.items ?? []) as PinterestEntityMap[T][],
      pageInfo: { bookmark: data?.bookmark ?? null },
    };
  }

  async getEntity<T extends PinterestEntityType>(
    entityType: T,
    filters: { adAccountId: string },
    entityId: string,
    context?: RequestContext
  ): Promise<PinterestEntityMap[T]> {
    const config = getEntityConfig(entityType);

    await this.rateLimiter.consume(`pinterest:${filters.adAccountId}`);

    // If entity config has an explicit getPath, use direct fetch
    if (config.getPath) {
      const path = interpolatePath(config.getPath, {
        adAccountId: filters.adAccountId,
        entityId,
      });

      const result = await this.httpClient.get(path, {}, context) as PinterestListResponse | Record<string, unknown>;

      // If single-entity response (e.g. GET /v5/pins/{id}), return as-is
      if (!("items" in (result as object))) {
        return result as PinterestEntityMap[T];
      }

      // Otherwise it's a list; find by id
      const list = (result as PinterestListResponse).items ?? [];
      const entity = list.find(
        (e) => (e as Record<string, unknown>)[config.idField] === entityId
      );
      if (!entity) {
        throw new Error(`${config.displayName} with ID ${entityId} not found`);
      }
      return entity as PinterestEntityMap[T];
    }

    // Fallback: list entities and filter by ID
    const listPath = interpolatePath(config.listPath, {
      adAccountId: filters.adAccountId,
    });
    const data = await this.httpClient.get(listPath, { [config.idField]: entityId, page_size: "1" }, context) as PinterestListResponse;
    const list = data?.items ?? [];
    if (list.length === 0) {
      throw new Error(`${config.displayName} with ID ${entityId} not found`);
    }
    return list[0] as PinterestEntityMap[T];
  }

  async createEntity<T extends PinterestEntityType>(
    entityType: T,
    filters: { adAccountId: string },
    body: unknown,
    context?: RequestContext
  ): Promise<PinterestEntityMap[T]> {
    const config = getEntityConfig(entityType);
    const path = interpolatePath(config.createPath, { adAccountId: filters.adAccountId });

    await this.rateLimiter.consume(`pinterest:${filters.adAccountId}`, 3);

    const data = await this.httpClient.post(path, [body], context) as { items?: unknown[] };
    return (data?.items ?? [])[0] as PinterestEntityMap[T];
  }

  async updateEntity<T extends PinterestEntityType>(
    entityType: T,
    filters: { adAccountId: string },
    entityId: string,
    updates: unknown,
    context?: RequestContext
  ): Promise<PinterestEntityMap[T]> {
    const config = getEntityConfig(entityType);
    const path = interpolatePath(config.updatePath, { adAccountId: filters.adAccountId, entityId });

    await this.rateLimiter.consume(`pinterest:${filters.adAccountId}`, 3);

    // Single-entity endpoints (e.g. /v5/pins/{entityId}) expect a flat body
    const isSingleEntity = config.updatePath.includes("{entityId}");
    if (isSingleEntity) {
      return this.httpClient.patch(path, updates, context) as Promise<PinterestEntityMap[T]>;
    }

    // Bulk endpoints expect an array body and return { items: [...] }
    const data = await this.httpClient.patch(
      path,
      [{ id: entityId, ...(updates as object) }],
      context
    ) as { items?: unknown[] };
    return (data?.items ?? [])[0] as PinterestEntityMap[T];
  }

  async deleteEntity(
    entityType: PinterestEntityType,
    filters: { adAccountId: string },
    entityIds: string[],
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);

    await this.rateLimiter.consume(`pinterest:${filters.adAccountId}`, 3);

    // Single-entity delete endpoints (e.g. /v5/pins/{entityId}) — delete each individually
    if (config.deletePath.includes("{entityId}")) {
      const results = await Promise.all(
        entityIds.map((id) => {
          const path = interpolatePath(config.deletePath, { adAccountId: filters.adAccountId, entityId: id });
          return this.httpClient.delete(path, {}, context);
        })
      );
      return results.length === 1 ? results[0] : results;
    }

    // Bulk delete via query params (e.g. ?campaign_ids=id1,id2)
    const path = interpolatePath(config.deletePath, { adAccountId: filters.adAccountId });
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

  async listAdAccounts(context?: RequestContext): Promise<{ entities: unknown[]; nextCursor?: string }> {
    await this.rateLimiter.consume("pinterest:default");
    const response = await this.httpClient.get("/v5/ad_accounts", {}, context) as Record<string, unknown>;
    const entities = Array.isArray(response.items) ? response.items : [];
    const nextCursor = typeof response.bookmark === "string" ? response.bookmark : undefined;
    return { entities, nextCursor };
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

    // Pinterest v5 has no native copy/duplicate endpoint — implement as client-side read+create.
    // Read source entity, strip system-managed fields, then create a new one.
    const source = await this.getEntity(entityType, filters, entityId, context) as unknown as Record<string, unknown>;

    const SYSTEM_FIELDS = ["id", "created_time", "updated_time", "ad_account_id", "pin_count", "view_tags"] as const;
    const body: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(source)) {
      if (!(SYSTEM_FIELDS as readonly string[]).includes(key)) {
        body[key] = val;
      }
    }

    // Caller may override name or other fields
    if (options?.name) body.name = options.name;
    if (options?.campaign_name) body.campaign_name = options.campaign_name;
    Object.assign(body, options);

    return this.createEntity(entityType, filters, body, context);
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
        const entity = await this.getEntity("adGroup", filters, adjustment.adGroupId, context);
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
    const results = await executeBulkConcurrent(items, async (data) => {
      return this.createEntity(entityType, filters, data, context);
    }, { logger: this.logger });
    return { results };
  }

  async bulkUpdateEntities(
    entityType: PinterestEntityType,
    filters: { adAccountId: string },
    items: Array<{ entityId: string; data: unknown }>,
    context?: RequestContext
  ): Promise<{ results: Array<{ entityId: string; success: boolean; error?: string }> }> {
    const bulkResults = await executeBulkConcurrent(items, async (item) => {
      return this.updateEntity(entityType, filters, item.entityId, item.data, context);
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
    entityType: PinterestEntityType,
    filters: { adAccountId: string },
    entityIds: string[],
    status: string,
    context?: RequestContext
  ): Promise<{ results: Array<{ entityId: string; success: boolean; error?: string }> }> {
    this.logger.debug({ entityType, count: entityIds.length, status }, "Bulk status update");

    const bulkResults = await executeBulkConcurrent(entityIds, async (entityId) => {
      return this.updateEntity(entityType, filters, entityId, { status }, context);
    }, { logger: this.logger });

    return {
      results: bulkResults.map((r, i) => ({
        entityId: entityIds[i],
        success: r.success,
        error: r.error,
      })),
    };
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
      count: String(limit),
    };

    if (query) {
      params.keyword = query;
    }

    return this.httpClient.get(`/v5/targeting_options/${targetingType}`, params, context);
  }

  async getTargetingOptions(
    targetingType?: string,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume("pinterest:default");

    // If no type specified, return the list of supported targeting types
    if (!targetingType) {
      return { targeting_types: ["APPTYPE", "GENDER", "LOCALE", "AGE_BUCKET", "LOCATION", "GEO", "INTEREST", "KEYWORD", "AUDIENCE_INCLUDE", "AUDIENCE_EXCLUDE"] };
    }

    return this.httpClient.get(`/v5/targeting_options/${targetingType}`, {}, context);
  }

  // ─── Audience Estimate ──────────────────────────────────────────

  async getAudienceEstimate(
    filters: { adAccountId: string },
    targetingConfig: unknown,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`pinterest:${filters.adAccountId}`);

    // Pinterest v5 audience sizing uses GET with targeting spec serialized as a JSON query param
    const path = `/v5/ad_accounts/${filters.adAccountId}/audience_sizing`;
    const params: Record<string, string> = {
      targeting_spec: JSON.stringify(targetingConfig),
    };
    return this.httpClient.get(path, params, context);
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

}