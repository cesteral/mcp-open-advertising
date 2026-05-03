// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { AmazonDspHttpClient } from "./amazon-dsp-http-client.js";
import type { RateLimiter } from "@cesteral/shared";
import { type RequestContext, executeBulkConcurrent } from "@cesteral/shared";
import {
  getEntityConfig,
  getCanonicalEntityType,
  interpolatePath,
  type AmazonDspEntityType,
} from "../../mcp-server/tools/utils/entity-mapping.js";
import type {
  AmazonDspOrder,
  AmazonDspLineItem,
  AmazonDspCreative,
  AmazonDspTarget,
  AmazonDspCreativeAssociation,
  AmazonDspAdvertiser,
  AmazonDspBidding,
  AmazonDspLineItemBudget,
  AmazonDspTargetingClause,
  AmazonDspPageInfo,
  AmazonDspListResponse,
  AmazonDspApiError,
  AmazonDspOrderStatus,
  AmazonDspLineItemStatus,
  AmazonDspCreativeStatus,
  AmazonDspBudgetType,
  AmazonDspLineItemType,
  AmazonDspCreativeType,
  AmazonDspBidOptimization,
  CreateAmazonDspOrderRequest,
  CreateAmazonDspLineItemRequest,
  CreateAmazonDspTargetRequest,
  CreateAmazonDspCreativeAssociationRequest,
} from "./types.js";

export type {
  AmazonDspOrder,
  AmazonDspLineItem,
  AmazonDspCreative,
  AmazonDspTarget,
  AmazonDspCreativeAssociation,
  AmazonDspAdvertiser,
  AmazonDspBidding,
  AmazonDspLineItemBudget,
  AmazonDspTargetingClause,
  AmazonDspPageInfo,
  AmazonDspListResponse,
  AmazonDspApiError,
  AmazonDspOrderStatus,
  AmazonDspLineItemStatus,
  AmazonDspCreativeStatus,
  AmazonDspBudgetType,
  AmazonDspLineItemType,
  AmazonDspCreativeType,
  AmazonDspBidOptimization,
  CreateAmazonDspOrderRequest,
  CreateAmazonDspLineItemRequest,
  CreateAmazonDspTargetRequest,
  CreateAmazonDspCreativeAssociationRequest,
};

interface AmazonDspEntityMap {
  order: AmazonDspOrder;
  campaign: AmazonDspOrder;
  lineItem: AmazonDspLineItem;
  adGroup: AmazonDspLineItem;
  creative: AmazonDspCreative;
  target: AmazonDspTarget;
  creativeAssociation: AmazonDspCreativeAssociation;
}

type AmazonDspCreateEntityInputMap = {
  order: CreateAmazonDspOrderRequest;
  campaign: CreateAmazonDspOrderRequest;
  lineItem: CreateAmazonDspLineItemRequest;
  adGroup: CreateAmazonDspLineItemRequest;
  creative: Record<string, unknown>;
  target: CreateAmazonDspTargetRequest;
  creativeAssociation: CreateAmazonDspCreativeAssociationRequest;
};

type AmazonDspUpdateEntityInputMap = {
  [K in AmazonDspEntityType]: Partial<AmazonDspEntityMap[K]> & Record<string, unknown>;
};

/** Amazon DSP list response shape (raw from API) */
interface AmazonDspRawListResponse {
  [key: string]: unknown;
  totalResults?: number;
}

/**
 * AmazonDspService — Generic CRUD operations for Amazon DSP Advertising API entities.
 *
 * Key Amazon DSP patterns:
 * - No DELETE endpoint — archive via PUT with { state: "ARCHIVED" }
 * - Offset pagination: startIndex + count query params, response includes totalResults
 * - Create sends data directly as the POST body (single object, not array)
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

  async listEntities<T extends AmazonDspEntityType>(
    entityType: T,
    filters?: Record<string, string>,
    startIndex = 0,
    pageSize = 25,
    context?: RequestContext
  ): Promise<{ entities: AmazonDspEntityMap[T][]; pageInfo: AmazonDspPageInfo }> {
    const canonicalType = getCanonicalEntityType(entityType);
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
    const result = (await this.httpClient.get(
      config.listPath,
      params,
      context
    )) as AmazonDspRawListResponse;

    const entities = ((result?.[
      config.responseKey
    ] as AmazonDspEntityMap[typeof canonicalType][]) ?? []) as AmazonDspEntityMap[T][];
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

  async getEntity<T extends AmazonDspEntityType>(
    entityType: T,
    entityId: string,
    context?: RequestContext
  ): Promise<AmazonDspEntityMap[T]> {
    const config = getEntityConfig(entityType);
    const path = interpolatePath(config.getPath, { entityId });
    await this.rateLimiter.consume("amazon_dsp:read");
    return this.httpClient.get(path, undefined, context) as Promise<AmazonDspEntityMap[T]>;
  }

  async createEntity<T extends AmazonDspEntityType>(
    entityType: T,
    data: AmazonDspCreateEntityInputMap[T],
    context?: RequestContext
  ): Promise<AmazonDspEntityMap[T]> {
    const config = getEntityConfig(entityType);
    await this.rateLimiter.consume("amazon_dsp:write", 3);
    // Amazon DSP create expects a single object body
    return this.httpClient.post(
      config.createPath,
      data as unknown as Record<string, unknown>,
      context
    ) as Promise<AmazonDspEntityMap[T]>;
  }

  async updateEntity<T extends AmazonDspEntityType>(
    entityType: T,
    entityId: string,
    data: AmazonDspUpdateEntityInputMap[T],
    context?: RequestContext
  ): Promise<AmazonDspEntityMap[T]> {
    const config = getEntityConfig(entityType);
    const path = interpolatePath(config.updatePath, { entityId });
    await this.rateLimiter.consume("amazon_dsp:write", 3);
    return this.httpClient.put(path, data, context) as Promise<AmazonDspEntityMap[T]>;
  }

  /**
   * Archive an entity via PUT with { state: "ARCHIVED" }.
   * Amazon DSP has no DELETE endpoint — archiving is the equivalent of deletion.
   */
  async deleteEntity<T extends AmazonDspEntityType>(
    entityType: T,
    entityId: string,
    context?: RequestContext
  ): Promise<AmazonDspEntityMap[T]> {
    const config = getEntityConfig(entityType);
    const path = interpolatePath(config.updatePath, { entityId });
    await this.rateLimiter.consume("amazon_dsp:write", 3);
    return this.httpClient.put(path, { state: "ARCHIVED" }, context) as Promise<
      AmazonDspEntityMap[T]
    >;
  }

  async updateEntityStatus<T extends AmazonDspEntityType>(
    entityType: T,
    entityId: string,
    state: string,
    context?: RequestContext
  ): Promise<AmazonDspEntityMap[T]> {
    const config = getEntityConfig(entityType);
    const path = interpolatePath(config.updatePath, { entityId });
    await this.rateLimiter.consume("amazon_dsp:write", 3);
    return this.httpClient.put(path, { state }, context) as Promise<AmazonDspEntityMap[T]>;
  }

  // ─── Advertiser Account ──────────────────────────────────────────

  async listAdvertisers(
    startIndex = 0,
    pageSize = 25,
    context?: RequestContext
  ): Promise<{ entities: AmazonDspAdvertiser[]; pageInfo: AmazonDspPageInfo }> {
    const params: Record<string, string> = {
      startIndex: String(startIndex),
      count: String(pageSize),
    };
    await this.rateLimiter.consume("amazon_dsp:read");
    const result = (await this.httpClient.get(
      "/dsp/advertisers",
      params,
      context
    )) as AmazonDspRawListResponse;

    const entities = (result?.advertisers as AmazonDspAdvertiser[]) ?? [];
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

  // ─── Ad Previews ────────────────────────────────────────────────

  async getAdPreviews(creativeId: string, context?: RequestContext): Promise<unknown> {
    await this.rateLimiter.consume("amazon_dsp:read");
    return this.httpClient.get(`/dsp/creatives/${creativeId}/preview`, undefined, context);
  }

  // ─── Duplicate ──────────────────────────────────────────────────

  /**
   * Duplicate an entity via manual read-strip-create (Amazon DSP has no copy endpoint).
   * Strips system-managed fields (entity ID, timestamps) then POSTs as a new entity.
   * The duplicate is created in PAUSED state.
   */
  async duplicateEntity<T extends AmazonDspEntityType>(
    entityType: T,
    entityId: string,
    options?: Record<string, unknown>,
    context?: RequestContext
  ): Promise<AmazonDspEntityMap[T]> {
    // Map entity type to its own primary-key field (foreign keys are kept)
    const ENTITY_ID_FIELD: Record<AmazonDspEntityType, string> = {
      order: "orderId",
      campaign: "orderId",
      lineItem: "lineItemId",
      adGroup: "lineItemId",
      creative: "creativeId",
      target: "targetId",
      creativeAssociation: "creativeAssociationId",
    };
    const SYSTEM_FIELDS = [
      ENTITY_ID_FIELD[entityType],
      "creationDate",
      "lastUpdatedDate",
      "createdTime",
      "modifiedTime",
    ];

    // Read source entity
    const source = (await this.getEntity(entityType, entityId, context)) as unknown as Record<
      string,
      unknown
    >;

    // Strip read-only system fields
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) {
      if (!SYSTEM_FIELDS.includes(key)) {
        data[key] = value;
      }
    }

    // Apply overrides; default to PAUSED so the copy doesn't go live immediately
    const newEntity: Record<string, unknown> = {
      ...data,
      state: "PAUSED",
      ...options,
    };

    return this.createEntity(
      entityType,
      newEntity as unknown as AmazonDspCreateEntityInputMap[T],
      context
    );
  }

  // ─── Bid Adjustment ─────────────────────────────────────────────

  async adjustBids(
    adjustments: Array<{ lineItemId: string; bidAmount: number }>,
    context?: RequestContext
  ): Promise<{
    results: Array<{
      lineItemId: string;
      success: boolean;
      previousBid?: number;
      newBid?: number;
      error?: string;
    }>;
  }> {
    const results: Array<{
      lineItemId: string;
      success: boolean;
      previousBid?: number;
      newBid?: number;
      error?: string;
    }> = [];

    for (const adjustment of adjustments) {
      try {
        // Read current line item state
        const entity = await this.getEntity("lineItem", adjustment.lineItemId, context);
        const previousBid = entity.bidding?.bidAmount;

        // Preserve the current bidding mode while updating the bid amount.
        await this.updateEntity(
          "lineItem",
          adjustment.lineItemId,
          {
            bidding: {
              ...(entity.bidding ?? {}),
              bidAmount: adjustment.bidAmount,
            },
          },
          context
        );

        results.push({
          lineItemId: adjustment.lineItemId,
          success: true,
          previousBid,
          newBid: adjustment.bidAmount,
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

  async bulkCreateEntities<T extends AmazonDspEntityType>(
    entityType: T,
    items: AmazonDspCreateEntityInputMap[T][],
    context?: RequestContext
  ): Promise<{
    results: Array<{ success: boolean; entity?: AmazonDspEntityMap[T]; error?: string }>;
  }> {
    const results = await executeBulkConcurrent(items, async (data) => {
      return this.createEntity(entityType, data, context);
    });
    return { results };
  }

  async bulkUpdateEntities<T extends AmazonDspEntityType>(
    entityType: T,
    items: Array<{ entityId: string; data: AmazonDspUpdateEntityInputMap[T] }>,
    context?: RequestContext
  ): Promise<{ results: Array<{ entityId: string; success: boolean; error?: string }> }> {
    const bulkResults = await executeBulkConcurrent(items, async (item) => {
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
    const bulkResults = await executeBulkConcurrent(entityIds, async (entityId) => {
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
}
