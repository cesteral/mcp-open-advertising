// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { TikTokHttpClient } from "./tiktok-http-client.js";
import { consumeTikTokQuota, tiktokQuotaBucket } from "./rate-limit-keys.js";
import type { BulkCapacityBucket, RateLimiter } from "@cesteral/shared";
import {
  type RequestContext,
  executeBulkConcurrent,
  McpError,
  JsonRpcErrorCode,
} from "@cesteral/shared";
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
  TikTokPageInfoShape,
};

interface TikTokEntityMap {
  campaign: TikTokCampaign;
  adGroup: TikTokAdGroup;
  ad: TikTokAd;
}

// Tool inputs arrive as free-form records validated upstream; the typed
// request shapes document the common fields.
type TikTokCreateEntityInputMap = {
  campaign: CreateTikTokCampaignRequest | Record<string, unknown>;
  adGroup: CreateTikTokAdGroupRequest | Record<string, unknown>;
  ad: CreateTikTokAdRequest | Record<string, unknown>;
};

type TikTokUpdateEntityInputMap = {
  [K in TikTokEntityType]: Partial<TikTokEntityMap[K]> & Record<string, unknown>;
};

/**
 * Limiter tokens one read / one write `consume` costs (a read passes no count,
 * i.e. `consume`'s default of 1). Exported because the bulk capacity pre-check
 * (`tools/utils/bulk-capacity.ts`) projects a batch from exactly these costs —
 * a change here must move the projection with it.
 */
export const TIKTOK_READ_TOKENS = 1;
export const TIKTOK_WRITE_TOKENS = 3;

export const TIKTOK_DUPLICATE_UNSUPPORTED_MESSAGE =
  "TikTok Marketing API v1.3 has no copy/duplicate endpoint for campaigns, ad groups or ads " +
  "(none exists in TikTok's official Business API SDK). To duplicate, read the source with " +
  "tiktok_get_entity and create a new entity with tiktok_create_entity (set operation_status " +
  "to DISABLE so the copy does not start delivering).";

export const TIKTOK_AD_PREVIEW_UNSUPPORTED_MESSAGE =
  "Ad previews are not available: TikTok's official Business API SDK defines no ad-preview " +
  "endpoint for v1.3. Inspect the ad with tiktok_get_entity (entityType 'ad') instead.";

/** TikTok list response data shape */
interface TikTokListData<T> {
  list: T[];
  page_info: TikTokPageInfoShape;
}

interface TikTokAdvertiserListData {
  list?: TikTokAdAccount[];
}

/** A downloaded media file to upload (see `downloadFileToBuffer`). */
export interface MediaFile {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

/**
 * TikTok Service — Generic CRUD operations for TikTok Marketing API entities,
 * plus bulk operations and entity duplication.
 *
 * Key differences from Meta:
 * - advertiser_id is always required (injected by TikTokHttpClient)
 * - Updates use POST (not PATCH), with entity ID in the body
 * - Status updates use separate /status/update/ endpoints
 * - Deletes are status updates with operation_status "DELETE" (v1.3 has no
 *   campaign/adgroup/ad /delete/ endpoint in TikTok's official SDK)
 * - Pagination is page-based (page, page_size), not cursor-based
 */
export class TikTokService {
  constructor(
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: TikTokHttpClient,
    private readonly logger: Logger,
    private readonly apiVersion: string = "v1.3"
  ) {}

  /**
   * The bulk-capacity projection bucket for a batch this service would run.
   *
   * Every call in this service draws on the session's per-token key
   * `tiktok:token:{quotaClient}` (see `rate-limit-keys.ts`), so a batch tool
   * describes its per-item pattern as `costPerItem` (one entry per `consume`
   * an item makes, in order) and this fills in the key the calls will actually
   * hit. The projection is therefore per tenant: another tenant's traffic
   * neither fills this bucket nor refuses this batch.
   */
  bulkCapacityBucket(costPerItem: readonly number[]): BulkCapacityBucket {
    return tiktokQuotaBucket(this.httpClient, costPerItem);
  }

  // The HTTP client is deliberately not exposed: a call made on it directly
  // draws no limiter tokens. The upload tools used to reach it through a
  // `client` getter, and their POSTs and video-info polls bypassed the limiter
  // (#236); every upstream call now goes through a method here that consumes.

  // ─── Standard CRUD ──────────────────────────────────────────────

  async listEntities<T extends TikTokEntityType>(
    entityType: T,
    filters?: Record<string, unknown>,
    page = 1,
    pageSize = 10,
    context?: RequestContext
  ): Promise<{ entities: TikTokEntityMap[T][]; pageInfo: TikTokPageInfoShape }> {
    await consumeTikTokQuota(this.rateLimiter, this.httpClient);

    const config = getEntityConfig(entityType);
    const params: Record<string, string> = {
      page: String(page),
      page_size: String(pageSize),
      fields: JSON.stringify(config.defaultFields),
    };

    if (filters && Object.keys(filters).length > 0) {
      params.filtering = JSON.stringify(filters);
    }

    const result = (await this.httpClient.get(config.listPath, params, context)) as TikTokListData<
      TikTokEntityMap[T]
    >;

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
    await consumeTikTokQuota(this.rateLimiter, this.httpClient);

    const config = getEntityConfig(entityType);
    const params: Record<string, string> = {
      page_size: "1",
      fields: JSON.stringify(config.defaultFields),
      filtering: JSON.stringify({
        [config.idsField]: [entityId],
      }),
    };

    const result = (await this.httpClient.get(config.listPath, params, context)) as TikTokListData<
      TikTokEntityMap[T]
    >;

    const list = result?.list ?? [];
    if (list.length === 0) {
      throw new McpError(
        JsonRpcErrorCode.NotFound,
        `${config.displayName} with ID ${entityId} not found`
      );
    }

    return list[0];
  }

  async createEntity<T extends TikTokEntityType>(
    entityType: T,
    data: TikTokCreateEntityInputMap[T],
    context?: RequestContext
  ): Promise<TikTokEntityMap[T]> {
    const config = getEntityConfig(entityType);

    await consumeTikTokQuota(this.rateLimiter, this.httpClient, TIKTOK_WRITE_TOKENS);

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

    await consumeTikTokQuota(this.rateLimiter, this.httpClient, TIKTOK_WRITE_TOKENS);

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

  /**
   * Delete entities. TikTok's official v1.3 SDK defines no `campaign/delete/`,
   * `adgroup/delete/` or `ad/delete/` endpoint; deletion is
   * `{entity}/status/update/` with `operation_status: "DELETE"` (enum
   * StatusOptType: ENABLE/DISABLE/DELETE). Irreversible.
   */
  async deleteEntity(
    entityType: TikTokEntityType,
    entityIds: string[],
    context?: RequestContext
  ): Promise<unknown> {
    return this.updateEntityStatus(entityType, entityIds, "DELETE", context);
  }

  async updateEntityStatus(
    entityType: TikTokEntityType,
    entityIds: string[],
    operationStatus: "ENABLE" | "DISABLE" | "DELETE",
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);

    if (!config.supportsStatusUpdate) {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `Entity type '${entityType}' does not support status updates. Use the regular update endpoint instead.`
      );
    }

    await consumeTikTokQuota(this.rateLimiter, this.httpClient, TIKTOK_WRITE_TOKENS);

    return this.httpClient.post(
      config.statusUpdatePath,
      {
        [config.idsField]: entityIds,
        operation_status: operationStatus,
      },
      context
    );
  }

  // ─── Advertiser Account ──────────────────────────────────────────

  /**
   * GET advertiser/info/. Per the official SDK spec (advertiser_info.yml)
   * `advertiser_ids` is a required query parameter — this endpoint returns
   * info for the advertisers you name, it does not enumerate accessible ones
   * (that is `oauth2/advertiser/get/`, which needs app_id + secret).
   */
  async listAdvertisers(
    advertiserIds: string[],
    context?: RequestContext
  ): Promise<TikTokAdvertiserListData> {
    await consumeTikTokQuota(this.rateLimiter, this.httpClient);

    return this.httpClient.get(
      `/open_api/${this.apiVersion}/advertiser/info/`,
      { advertiser_ids: JSON.stringify(advertiserIds) },
      context
    ) as Promise<TikTokAdvertiserListData>;
  }

  // ─── Duplicate ──────────────────────────────────────────────────

  /**
   * TikTok's official v1.3 SDK defines no copy endpoint for campaigns, ad
   * groups or ads (the `/{entity}/copy/` paths this used to derive do not
   * exist in it), so duplication is refused rather than sent to a path that
   * is not part of the API.
   */
  async duplicateEntity(
    entityType: TikTokEntityType,
    _entityId: string,
    _options?: Record<string, unknown>,
    _context?: RequestContext
  ): Promise<never> {
    this.logger.debug({ entityType }, "Duplicate refused: no TikTok copy endpoint");
    throw new McpError(JsonRpcErrorCode.InvalidRequest, TIKTOK_DUPLICATE_UNSUPPORTED_MESSAGE);
  }

  // ─── Bid Adjustment ─────────────────────────────────────────────

  async adjustBids(
    adjustments: Array<{ adGroupId: string; bidPrice: number }>,
    context?: RequestContext
  ): Promise<{
    results: Array<{
      adGroupId: string;
      success: boolean;
      previousBid?: number;
      newBid?: number;
      error?: string;
    }>;
  }> {
    const results: Array<{
      adGroupId: string;
      success: boolean;
      previousBid?: number;
      newBid?: number;
      error?: string;
    }> = [];

    for (const adjustment of adjustments) {
      try {
        // Read current ad group state
        const entity = await this.getEntity("adGroup", adjustment.adGroupId, context);
        const previousBid = entity.bid_price;

        // Update bid
        await this.updateEntity(
          "adGroup",
          adjustment.adGroupId,
          {
            bid_price: adjustment.bidPrice,
          },
          context
        );

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
  ): Promise<{
    results: Array<{ success: boolean; entity?: TikTokEntityMap[T]; error?: string }>;
  }> {
    const results = await executeBulkConcurrent(
      items,
      async (data) => {
        return this.createEntity(entityType, data, context);
      },
      { logger: this.logger }
    );
    return { results };
  }

  async bulkUpdateEntities<T extends TikTokEntityType>(
    entityType: T,
    items: Array<{ entityId: string; data: TikTokUpdateEntityInputMap[T] }>,
    context?: RequestContext
  ): Promise<{ results: Array<{ entityId: string; success: boolean; error?: string }> }> {
    const bulkResults = await executeBulkConcurrent(
      items,
      async (item) => {
        return this.updateEntity(entityType, item.entityId, item.data, context);
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

  async bulkUpdateStatus(
    entityType: TikTokEntityType,
    entityIds: string[],
    operationStatus: "ENABLE" | "DISABLE" | "DELETE",
    context?: RequestContext
  ): Promise<{ results: Array<{ entityId: string; success: boolean; error?: string }> }> {
    this.logger.debug(
      { entityType, count: entityIds.length, operationStatus },
      "Bulk status update"
    );

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
    criteria: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    await consumeTikTokQuota(this.rateLimiter, this.httpClient);

    return this.httpClient.post(
      `/open_api/${this.apiVersion}/tool/targeting/search/`,
      criteria,
      context
    );
  }

  async getTargetingOptions(
    optionType: string,
    params: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    await consumeTikTokQuota(this.rateLimiter, this.httpClient);

    switch (optionType) {
      case "ACTION_CATEGORY":
        return this.httpClient.get(
          `/open_api/${this.apiVersion}/tool/action_category/`,
          this.stringifyParams(params),
          context
        );
      case "CARRIER":
        return this.httpClient.get(
          `/open_api/${this.apiVersion}/tool/carrier/`,
          this.stringifyParams(params),
          context
        );
      case "DEVICE_MODEL":
        return this.httpClient.get(
          `/open_api/${this.apiVersion}/tool/device_model/`,
          this.stringifyParams(params),
          context
        );
      case "INTEREST_CATEGORY":
        return this.httpClient.get(
          `/open_api/${this.apiVersion}/tool/interest_category/`,
          this.stringifyParams(params),
          context
        );
      case "INTEREST_KEYWORD":
        return this.httpClient.get(
          `/open_api/${this.apiVersion}/tool/interest_keyword/recommend/`,
          this.stringifyParams(params),
          context
        );
      case "LANGUAGE":
        return this.httpClient.get(
          `/open_api/${this.apiVersion}/tool/language/`,
          this.stringifyParams(params),
          context
        );
      case "LOCATION":
        return this.httpClient.get(
          `/open_api/${this.apiVersion}/tool/region/`,
          this.stringifyParams(params),
          context
        );
      case "ISP":
        return this.httpClient.get(
          `/open_api/${this.apiVersion}/tool/targeting/list/`,
          this.stringifyParams(params),
          context
        );
      default:
        throw new McpError(
          JsonRpcErrorCode.InvalidParams,
          `Unsupported targeting option type: ${optionType}`
        );
    }
  }

  // ─── Media Uploads ──────────────────────────────────────────────

  /**
   * `POST file/image/ad/upload/` (multipart). One write's worth of tokens
   * (TIKTOK_WRITE_TOKENS) from the session's bucket, like every other write:
   * the upload used to go straight to the HTTP client and draw nothing (#236).
   *
   * basis: official SDK (tiktok/tiktok-business-api-sdk @ f809c39)
   * `python_sdk/business_api_client/api/file_api.py` `ad_image_upload` — POST
   * `/open_api/v1.3/file/image/ad/upload/`, multipart/form-data, file part
   * `image_file`.
   */
  async uploadImage(
    fields: Record<string, string>,
    file: MediaFile,
    context?: RequestContext
  ): Promise<unknown> {
    await consumeTikTokQuota(this.rateLimiter, this.httpClient, TIKTOK_WRITE_TOKENS);
    return this.httpClient.postMultipart(
      this.httpClient.versionedPath("file/image/ad/upload/"),
      fields,
      "image_file",
      file.buffer,
      file.filename,
      file.contentType,
      context
    );
  }

  /**
   * `POST file/video/ad/upload/` (multipart), TIKTOK_WRITE_TOKENS.
   *
   * basis: `file_api.py` `ad_video_upload` — POST
   * `/open_api/v1.3/file/video/ad/upload/`, multipart/form-data, file part
   * `video_file`.
   */
  async uploadVideo(
    fields: Record<string, string>,
    file: MediaFile,
    context?: RequestContext
  ): Promise<unknown> {
    await consumeTikTokQuota(this.rateLimiter, this.httpClient, TIKTOK_WRITE_TOKENS);
    return this.httpClient.postMultipart(
      this.httpClient.versionedPath("file/video/ad/upload/"),
      fields,
      "video_file",
      file.buffer,
      file.filename,
      file.contentType,
      context
    );
  }

  /**
   * `GET file/video/ad/info/` — one read (TIKTOK_READ_TOKENS) per call, so
   * every poll of an upload's processing status is counted.
   *
   * basis: `file_api.py` `ad_video_info` — GET
   * `/open_api/v1.3/file/video/ad/info/`, query `advertiser_id`, `video_ids`
   * (collection 'multi', which `api_client.py` encodes as `json.dumps(list)`).
   */
  async getVideoInfo(videoIds: string[], context?: RequestContext): Promise<unknown> {
    await consumeTikTokQuota(this.rateLimiter, this.httpClient);
    return this.httpClient.get(
      this.httpClient.versionedPath("file/video/ad/info/"),
      { video_ids: JSON.stringify(videoIds) },
      context
    );
  }

  // ─── Audience Estimate ──────────────────────────────────────────

  /**
   * Audience size estimate. TikTok's own spec text names the endpoint
   * `/ad/audience_size/estimate/` (tool_targeting_list.yml and
   * tool_targeting_search.yml in the official SDK: "pass the returned ISP IDs
   * to isp_ids when calling /adgroup/create/, /adgroup/update/ or
   * /ad/audience_size/estimate/"). The previous `audience/estimate/` path
   * appears nowhere in the SDK. The SDK carries no request schema for this
   * endpoint, so the method and body shape are unchanged (unverified).
   */
  async getAudienceEstimate(
    targetingConfig: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    await consumeTikTokQuota(this.rateLimiter, this.httpClient);

    return this.httpClient.post(
      `/open_api/${this.apiVersion}/ad/audience_size/estimate/`,
      targetingConfig,
      context
    );
  }

  // ─── Ad Previews ────────────────────────────────────────────────

  /**
   * TikTok's official v1.3 SDK defines no ad-preview endpoint (the `ad/preview/`
   * path this used to GET is not in it), so previews are refused rather than
   * sent to a path that is not part of the API.
   */
  async getAdPreviews(
    _adId: string,
    _adFormat?: string,
    _context?: RequestContext
  ): Promise<never> {
    throw new McpError(JsonRpcErrorCode.InvalidRequest, TIKTOK_AD_PREVIEW_UNSUPPORTED_MESSAGE);
  }

  // ─── Internal Helpers ───────────────────────────────────────────

  private stringifyParams(params: Record<string, unknown>): Record<string, string> {
    return Object.fromEntries(
      Object.entries(params)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)])
    );
  }
}
