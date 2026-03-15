// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { SnapchatHttpClient } from "./snapchat-http-client.js";
import { RateLimiter } from "../../utils/security/rate-limiter.js";
import type { RequestContext } from "@cesteral/shared";
import {
  getEntityConfig,
  interpolatePath,
  type SnapchatEntityType,
} from "../../mcp-server/tools/utils/entity-mapping.js";

/** Snapchat pagination response (cursor-based) */
interface SnapchatPaging {
  cursor?: string;
}

/**
 * Unwrap array of entity items from Snapchat response envelope.
 * Input: { request_status, <responseKey>: [{ sub_request_status, <entityKey>: {...} }] }
 * Output: array of inner entity objects
 */
function unwrapEntities(responseKey: string, entityKey: string, response: unknown): unknown[] {
  const envelope = response as Record<string, unknown>;
  const items = envelope[responseKey];
  if (!Array.isArray(items)) return [];
  return items
    .filter((item: any) => item.sub_request_status === "SUCCESS" || item.sub_request_status === undefined)
    .map((item: any) => item[entityKey] ?? item);
}

function unwrapSingleEntity(responseKey: string, entityKey: string, response: unknown): unknown {
  const entities = unwrapEntities(responseKey, entityKey, response);
  return entities[0];
}

function extractNextCursor(response: unknown): string | undefined {
  const envelope = response as Record<string, unknown>;
  const paging = envelope["paging"] as SnapchatPaging | undefined;
  return paging?.cursor;
}

/**
 * Snapchat Service — Generic CRUD operations for Snapchat Ads API v1 entities.
 *
 * Key Snapchat API patterns:
 * - ad_account_id is in URL paths (not query params or body)
 * - List paths use adAccountId or parent entity ID (e.g., campaignId for adGroups)
 * - Updates use PUT on entity-specific paths (/v1/campaigns/{entityId})
 * - Deletes use DELETE on entity-specific paths
 * - Pagination is cursor-based (pass `cursor` in query params)
 * - Create/update body wraps entity in: { <responseKey>: [{ ...data }] }
 * - Response envelope: { request_status, <responseKey>: [{ sub_request_status, <entityKey>: {...} }] }
 */
export class SnapchatService {
  private readonly rateLimiter: RateLimiter;

  constructor(
    private readonly httpClient: SnapchatHttpClient,
    private readonly orgId: string,
    private readonly adAccountId: string
  ) {
    this.rateLimiter = new RateLimiter();
  }

  /** Expose the underlying HTTP client for direct use (e.g., media uploads). */
  get client(): SnapchatHttpClient {
    return this.httpClient;
  }

  // ─── Standard CRUD ──────────────────────────────────────────────

  async listEntities(
    entityType: SnapchatEntityType,
    filters?: Record<string, string>,
    cursor?: string,
    context?: RequestContext
  ): Promise<{ entities: unknown[]; nextCursor?: string }> {
    await this.rateLimiter.consume(`snapchat:default`);

    const config = getEntityConfig(entityType);

    const pathParams: Record<string, string> = {
      adAccountId: filters?.adAccountId ?? this.adAccountId,
      ...(filters?.campaignId ? { campaignId: filters.campaignId } : {}),
      ...(filters?.adSquadId ? { adSquadId: filters.adSquadId } : {}),
    };

    const interpolatedPath = interpolatePath(config.listPath, pathParams);

    const queryParams: Record<string, string> = {};
    if (cursor) {
      queryParams.cursor = cursor;
    }

    const response = await this.httpClient.get(interpolatedPath, queryParams, context);
    const entities = unwrapEntities(config.responseKey, config.entityKey, response);
    const nextCursor = extractNextCursor(response);

    return { entities, nextCursor };
  }

  async getEntity(
    entityType: SnapchatEntityType,
    entityId: string,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`snapchat:default`);

    const config = getEntityConfig(entityType);
    const interpolatedPath = interpolatePath(config.updatePath, { entityId });

    const response = await this.httpClient.get(interpolatedPath, undefined, context);

    const entity = unwrapSingleEntity(config.responseKey, config.entityKey, response);
    if (!entity) {
      throw new Error(`${config.displayName} with ID ${entityId} not found`);
    }

    return entity;
  }

  async createEntity(
    entityType: SnapchatEntityType,
    filters: Record<string, string>,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);

    await this.rateLimiter.consume(`snapchat:default`, 3);

    const pathParams: Record<string, string> = {
      adAccountId: filters.adAccountId ?? this.adAccountId,
      ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
      ...(filters.adSquadId ? { adSquadId: filters.adSquadId } : {}),
    };
    const interpolatedPath = interpolatePath(config.createPath, pathParams);

    const body = { [config.responseKey]: [data] };
    const response = await this.httpClient.post(interpolatedPath, body, context);

    return unwrapSingleEntity(config.responseKey, config.entityKey, response);
  }

  async updateEntity(
    entityType: SnapchatEntityType,
    entityId: string,
    _filters: Record<string, string>,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);

    await this.rateLimiter.consume(`snapchat:default`, 3);

    const interpolatedPath = interpolatePath(config.updatePath, { entityId });
    const body = { [config.responseKey]: [{ id: entityId, ...data }] };
    const response = await this.httpClient.put(interpolatedPath, body, context);

    return unwrapSingleEntity(config.responseKey, config.entityKey, response);
  }

  async deleteEntity(
    entityType: SnapchatEntityType,
    entityId: string,
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);

    await this.rateLimiter.consume(`snapchat:default`, 3);

    const interpolatedPath = interpolatePath(config.deletePath, { entityId });
    return this.httpClient.delete(interpolatedPath, undefined, context);
  }

  async updateEntityStatus(
    entityType: SnapchatEntityType,
    entityId: string,
    status: "ACTIVE" | "PAUSED" | "ARCHIVED",
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);

    await this.rateLimiter.consume(`snapchat:default`, 3);

    const interpolatedPath = interpolatePath(config.statusUpdatePath, { entityId });
    const body = { [config.responseKey]: [{ id: entityId, status }] };
    const response = await this.httpClient.put(interpolatedPath, body, context);

    return unwrapSingleEntity(config.responseKey, config.entityKey, response);
  }

  // ─── Advertiser Account ──────────────────────────────────────────

  async listAdAccounts(context?: RequestContext): Promise<unknown> {
    await this.rateLimiter.consume(`snapchat:default`);

    return this.httpClient.get(`/v1/organizations/${this.orgId}/adaccounts`, {}, context);
  }

  // ─── Duplicate ──────────────────────────────────────────────────

  async duplicateEntity(
    entityType: SnapchatEntityType,
    entityId: string,
    options?: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);

    if (!config.supportsDuplicate) {
      throw new Error(`Entity type ${entityType} does not support duplication`);
    }

    await this.rateLimiter.consume(`snapchat:default`, 3);

    // Snapchat copy body: { <responseKey>: [{ id: entityId, ...options }] }
    const body = { [config.responseKey]: [{ id: entityId, ...options }] };
    // Derive copy path from createPath by replacing /campaigns with /campaigns/copy (example)
    const copyPath = config.createPath.replace(new RegExp(`/${config.responseKey}$`), `/${config.responseKey}/copy`);

    return this.httpClient.post(copyPath, body, context);
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
        const previousBid = entity.bid_micro != null ? Number(entity.bid_micro) : undefined;

        // Update bid
        await this.updateEntity("adGroup", adjustment.adGroupId, {}, {
          bid_micro: adjustment.bidPrice,
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
    entityType: SnapchatEntityType,
    filters: Record<string, string>,
    items: Record<string, unknown>[],
    context?: RequestContext
  ): Promise<{ results: Array<{ success: boolean; entity?: unknown; error?: string }> }> {
    const results = await this.executeBulk(items, async (data) => {
      return this.createEntity(entityType, filters, data, context);
    });
    return { results };
  }

  async bulkUpdateEntities(
    entityType: SnapchatEntityType,
    items: Array<{ entityId: string; data: Record<string, unknown> }>,
    context?: RequestContext
  ): Promise<{ results: Array<{ entityId: string; success: boolean; error?: string }> }> {
    const bulkResults = await this.executeBulk(items, async (item) => {
      return this.updateEntity(entityType, item.entityId, {}, item.data, context);
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
    entityType: SnapchatEntityType,
    entityIds: string[],
    status: "ACTIVE" | "PAUSED" | "ARCHIVED",
    context?: RequestContext
  ): Promise<{ results: Array<{ entityId: string; success: boolean; error?: string }> }> {
    const bulkResults = await this.executeBulk(entityIds, async (entityId) => {
      return this.updateEntityStatus(entityType, entityId, status, context);
    });

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
    await this.rateLimiter.consume(`snapchat:default`);

    const params: Record<string, string> = {
      targeting_type: targetingType,
      count: String(limit),
    };

    if (query) {
      params.keyword = query;
    }

    return this.httpClient.get(`/v1/adaccounts/${this.adAccountId}/targeting`, params, context);
  }

  async getTargetingOptions(
    targetingType?: string,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`snapchat:default`);

    const params: Record<string, string> = {};
    if (targetingType) {
      params.targeting_type = targetingType;
    }

    return this.httpClient.get(`/v1/adaccounts/${this.adAccountId}/targeting`, params, context);
  }

  // ─── Audience Estimate ──────────────────────────────────────────

  async getAudienceEstimate(
    targetingConfig: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`snapchat:default`);

    return this.httpClient.post(`/v1/adaccounts/${this.adAccountId}/audience_size`, targetingConfig, context);
  }

  // ─── Ad Previews ────────────────────────────────────────────────

  async getAdPreviews(
    adId: string,
    _adFormat?: string,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`snapchat:default`);

    return this.httpClient.get(`/v1/ads/${adId}`, undefined, context);
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