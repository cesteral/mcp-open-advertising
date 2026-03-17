// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { AmazonDspHttpClient } from "./amazon-dsp-http-client.js";
import type { RateLimiter } from "../../utils/security/rate-limiter.js";
import type { RequestContext } from "@cesteral/shared";
import {
  getEntityConfig,
  interpolatePath,
  type AmazonDspEntityType,
} from "../../mcp-server/tools/utils/entity-mapping.js";

/** Amazon DSP offset pagination response shape */
interface AmazonDspPageInfo {
  startIndex: number;
  count: number;
  totalResults: number;
}

/** Amazon DSP list response shape (raw from API) */
interface AmazonDspListResponse {
  [key: string]: unknown;
  totalResults?: number;
}

/**
 * AmazonDspService — Generic CRUD operations for Amazon DSP Advertising API entities.
 *
 * Key Amazon DSP patterns:
 * - No DELETE endpoint — archive via PUT with { status: "ARCHIVED" }
 * - Offset pagination: startIndex + count query params, response includes totalResults
 * - Create wraps data in { [responseKey]: [data] } body
 * - Updates use PUT to entity-specific path
 * - List filter uses entity-specific listFilterParam (advertiserId or orderId)
 */
export class AmazonDspService {
  constructor(
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: AmazonDspHttpClient
  ) {}

  /** Expose the underlying HTTP client for direct use. */
  get client(): AmazonDspHttpClient {
    return this.httpClient;
  }

  // ─── Standard CRUD ──────────────────────────────────────────────

  async listEntities(
    entityType: AmazonDspEntityType,
    filters?: Record<string, string>,
    startIndex = 0,
    pageSize = 25,
    context?: RequestContext
  ): Promise<{ entities: unknown[]; pageInfo: AmazonDspPageInfo }> {
    const config = getEntityConfig(entityType);

    const params: Record<string, string> = {
      startIndex: String(startIndex),
      count: String(pageSize),
    };

    // Apply entity-specific filter param if provided
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null) {
          params[key] = value;
        }
      }
    }

    await this.rateLimiter.consume("amazon_dsp:read");
    const result = (await this.httpClient.get(config.listPath, params, context)) as AmazonDspListResponse;

    const entities = (result?.[config.responseKey] as unknown[]) ?? [];
    const totalResults = result?.totalResults ?? 0;

    return {
      entities,
      pageInfo: {
        startIndex,
        count: pageSize,
        totalResults,
      },
    };
  }

  async getEntity(
    entityType: AmazonDspEntityType,
    entityId: string,
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);
    const path = interpolatePath(config.getPath, { entityId });
    await this.rateLimiter.consume("amazon_dsp:read");
    return this.httpClient.get(path, undefined, context);
  }

  async createEntity(
    entityType: AmazonDspEntityType,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);
    await this.rateLimiter.consume("amazon_dsp:write", 3);
    // Amazon DSP create wraps data in { [responseKey]: [data] } body
    const body = { [config.responseKey]: [data] };
    return this.httpClient.post(config.createPath, body, context);
  }

  async updateEntity(
    entityType: AmazonDspEntityType,
    entityId: string,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);
    const path = interpolatePath(config.updatePath, { entityId });
    await this.rateLimiter.consume("amazon_dsp:write", 3);
    return this.httpClient.put(path, data, context);
  }

  /**
   * Archive an entity via PUT with { status: "ARCHIVED" }.
   * Amazon DSP has no DELETE endpoint — archiving is the equivalent of deletion.
   */
  async deleteEntity(
    entityType: AmazonDspEntityType,
    entityId: string,
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);
    const path = interpolatePath(config.updatePath, { entityId });
    await this.rateLimiter.consume("amazon_dsp:write", 3);
    return this.httpClient.put(path, { status: "ARCHIVED" }, context);
  }

  async updateEntityStatus(
    entityType: AmazonDspEntityType,
    entityId: string,
    status: string,
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);
    const path = interpolatePath(config.updatePath, { entityId });
    await this.rateLimiter.consume("amazon_dsp:write", 3);
    return this.httpClient.put(path, { status }, context);
  }

  // ─── Advertiser Account ──────────────────────────────────────────

  async listAdvertisers(
    startIndex = 0,
    pageSize = 25,
    context?: RequestContext
  ): Promise<{ entities: unknown[]; pageInfo: AmazonDspPageInfo }> {
    const params: Record<string, string> = {
      startIndex: String(startIndex),
      count: String(pageSize),
    };
    await this.rateLimiter.consume("amazon_dsp:read");
    const result = (await this.httpClient.get("/dsp/advertisers", params, context)) as AmazonDspListResponse;

    const entities = (result?.advertisers as unknown[]) ?? [];
    const totalResults = result?.totalResults ?? 0;

    return {
      entities,
      pageInfo: {
        startIndex,
        count: pageSize,
        totalResults,
      },
    };
  }

  // ─── Targeting ───────────────────────────────────────────────────

  async searchTargeting(
    targetingType: string,
    query?: string,
    limit = 20,
    context?: RequestContext
  ): Promise<unknown> {
    const params: Record<string, string> = {
      targetingType,
      count: String(limit),
    };
    if (query) {
      params.query = query;
    }
    await this.rateLimiter.consume("amazon_dsp:read");
    return this.httpClient.get("/dsp/targeting/search", params, context);
  }

  async getTargetingOptions(
    targetingType?: string,
    context?: RequestContext
  ): Promise<unknown> {
    const params: Record<string, string> = {};
    if (targetingType) {
      params.targetingType = targetingType;
    }
    await this.rateLimiter.consume("amazon_dsp:read");
    return this.httpClient.get("/dsp/targeting/options", params, context);
  }

  // ─── Audience Estimate ──────────────────────────────────────────

  async getAudienceEstimate(
    targetingConfig: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume("amazon_dsp:read");
    return this.httpClient.post("/dsp/audience/estimate", targetingConfig, context);
  }

  // ─── Ad Previews ────────────────────────────────────────────────

  async getAdPreviews(
    adId: string,
    adFormat?: string,
    context?: RequestContext
  ): Promise<unknown> {
    const params: Record<string, string> = { adId };
    if (adFormat) {
      params.adFormat = adFormat;
    }
    await this.rateLimiter.consume("amazon_dsp:read");
    return this.httpClient.get("/dsp/ads/preview", params, context);
  }

  // ─── Duplicate ──────────────────────────────────────────────────

  async duplicateEntity(
    entityType: AmazonDspEntityType,
    entityId: string,
    options?: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);
    const path = interpolatePath(config.updatePath, { entityId });
    await this.rateLimiter.consume("amazon_dsp:write", 3);
    return this.httpClient.post(path + "/copy", { ...options }, context);
  }

  // ─── Bid Adjustment ─────────────────────────────────────────────

  async adjustBids(
    adjustments: Array<{ lineItemId: string; bidPrice: number }>,
    context?: RequestContext
  ): Promise<{ results: Array<{ lineItemId: string; success: boolean; previousBid?: number; newBid?: number; error?: string }> }> {
    const results: Array<{ lineItemId: string; success: boolean; previousBid?: number; newBid?: number; error?: string }> = [];

    for (const adjustment of adjustments) {
      try {
        // Read current line item state
        const entity = (await this.getEntity("lineItem", adjustment.lineItemId, context)) as Record<string, unknown>;
        const previousBid = entity.bidding != null ? (entity.bidding as Record<string, unknown>).bidPrice as number | undefined : undefined;

        // Update bid
        await this.updateEntity("lineItem", adjustment.lineItemId, {
          bidding: { bidPrice: adjustment.bidPrice },
        }, context);

        results.push({
          lineItemId: adjustment.lineItemId,
          success: true,
          previousBid,
          newBid: adjustment.bidPrice,
        });
      } catch (error) {
        results.push({
          lineItemId: adjustment.lineItemId,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { results };
  }

  // ─── Bulk Operations ────────────────────────────────────────────

  async bulkCreateEntities(
    entityType: AmazonDspEntityType,
    items: Record<string, unknown>[],
    context?: RequestContext
  ): Promise<{ results: Array<{ success: boolean; entity?: unknown; error?: string }> }> {
    const results = await this.executeBulk(items, async (data) => {
      return this.createEntity(entityType, data, context);
    });
    return { results };
  }

  async bulkUpdateEntities(
    entityType: AmazonDspEntityType,
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
    entityType: AmazonDspEntityType,
    entityIds: string[],
    status: string,
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