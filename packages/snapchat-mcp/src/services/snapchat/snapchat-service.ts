// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { SnapchatHttpClient } from "./snapchat-http-client.js";
import type { RateLimiter } from "../../utils/security/rate-limiter.js";
import { type RequestContext, McpError, JsonRpcErrorCode } from "@cesteral/shared";
import {
  getEntityConfig,
  interpolatePath,
  type SnapchatEntityType,
} from "../../mcp-server/tools/utils/entity-mapping.js";
import type {
  SnapchatCampaign,
  SnapchatAdSquad,
  SnapchatAd,
  SnapchatCreative,
  SnapchatAdAccount,
} from "./types.js";

export type {
  SnapchatCampaign,
  SnapchatAdSquad,
  SnapchatAd,
  SnapchatCreative,
  SnapchatAdAccount,
};

interface SnapchatEntityMap {
  campaign: SnapchatCampaign;
  adGroup: SnapchatAdSquad;
  ad: SnapchatAd;
  creative: SnapchatCreative;
}

/** Snapchat pagination response */
interface SnapchatPaging {
  next_link?: string;
}

interface SnapchatSubrequest {
  sub_request_status?: string;
  status?: string;
  sub_request_error_message?: string;
  [key: string]: unknown;
}

interface SnapchatTargetingEndpointConfig {
  path: string;
  responseKey?: string;
  requiresCountryCode?: boolean;
}

const TARGETING_ENDPOINTS: Record<string, SnapchatTargetingEndpointConfig> = {
  country_support: { path: "/v1/targeting/v1/options" },
  geo_country: { path: "/v1/targeting/geo/country", responseKey: "country" },
  geo_region: { path: "/v1/targeting/geo/{countryCode}/region", responseKey: "region", requiresCountryCode: true },
  geo_metro: { path: "/v1/targeting/geo/{countryCode}/metro", responseKey: "metro", requiresCountryCode: true },
  geo_postal_code: { path: "/v1/targeting/geo/{countryCode}/postal_code", responseKey: "postal_code", requiresCountryCode: true },
  interests_slc: { path: "/v1/targeting/v1/interests/scls", responseKey: "scls" },
  interests_vac: { path: "/v1/targeting/v1/interests/vac", responseKey: "vac" },
  interests_shp: { path: "/v1/targeting/v1/interests/shp", responseKey: "shp" },
};

function getSubrequestStatus(item: SnapchatSubrequest): string | undefined {
  const statusValue = item["sub_request_status"] ?? item["status"];
  return typeof statusValue === "string" ? statusValue.toUpperCase() : undefined;
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
    .filter((rawItem) => {
      const item = rawItem as SnapchatSubrequest;
      const status = getSubrequestStatus(item);
      return status === undefined || status === "SUCCESS";
    })
    .map((item: Record<string, unknown>) => item[entityKey] ?? item);
}

function unwrapSingleEntity(responseKey: string, entityKey: string, response: unknown): unknown {
  const entities = unwrapEntities(responseKey, entityKey, response);
  return entities[0];
}

/**
 * Unwrap bulk response preserving positional alignment with input items.
 * Unlike unwrapEntities(), failed subrequests are NOT dropped — they produce
 * { success: false, error } at the same index, keeping 1:1 mapping with inputs.
 */
function unwrapBulkResults(
  responseKey: string,
  entityKey: string,
  response: unknown
): Array<{ success: boolean; entity?: unknown; error?: string }> {
  const envelope = response as Record<string, unknown>;
  const items = envelope[responseKey];
  if (!Array.isArray(items)) return [];
  return items.map((rawItem) => {
    const item = rawItem as SnapchatSubrequest;
    const status = getSubrequestStatus(item);
    if (status === undefined || status === "SUCCESS") {
      return { success: true, entity: item[entityKey] ?? item };
    }
    const errorMsg = item["sub_request_error_message"] ?? item["sub_request_status"] ?? "Unknown error";
    return { success: false, error: String(errorMsg) };
  });
}

function extractNextCursor(response: unknown): string | undefined {
  const envelope = response as Record<string, unknown>;
  const paging = envelope["paging"] as SnapchatPaging | undefined;
  return paging?.next_link;
}

function extractTargetingDimensions(response: unknown, responseKey?: string): Record<string, unknown>[] {
  const envelope = response as Record<string, unknown>;
  const items = envelope["targeting_dimensions"];
  if (!Array.isArray(items)) return [];

  return items
    .filter((rawItem) => {
      const item = rawItem as SnapchatSubrequest;
      const status = getSubrequestStatus(item);
      return status === undefined || status === "SUCCESS";
    })
    .map((rawItem) => {
      const item = rawItem as Record<string, unknown>;
      if (responseKey && item[responseKey] && typeof item[responseKey] === "object") {
        return item[responseKey] as Record<string, unknown>;
      }
      return item;
    });
}

/**
 * Snapchat Service — Generic CRUD operations for Snapchat Ads API v1 entities.
 *
 * Key Snapchat API patterns:
 * - ad_account_id is in URL paths (not query params or body)
 * - List paths use adAccountId or parent entity ID (e.g., campaignId for adGroups)
 * - Updates use collection-level PUT scoped by the parent resource
 * - Deletes use DELETE on entity-specific paths
 * - Pagination returns paging.next_link for the next page
 * - Create/update body wraps entity in: { <responseKey>: [{ ...data }] }
 * - Response envelope: { request_status, <responseKey>: [{ sub_request_status, <entityKey>: {...} }] }
 */
export class SnapchatService {
  private readonly rateLimiter: RateLimiter;

  constructor(
    private readonly httpClient: SnapchatHttpClient,
    private readonly orgId: string,
    private readonly adAccountId: string,
    rateLimiter: RateLimiter
  ) {
    this.rateLimiter = rateLimiter;
  }

  private resolveUpdatePathParams<T extends SnapchatEntityType>(
    entityType: T,
    entity: SnapchatEntityMap[T],
    filters: Record<string, string>
  ): Record<string, string> {
    switch (entityType) {
      case "campaign":
      case "creative":
        return { adAccountId: filters.adAccountId ?? String((entity as { ad_account_id?: string }).ad_account_id ?? this.adAccountId) };
      case "adGroup":
        return { campaignId: filters.campaignId ?? String((entity as { campaign_id?: string }).campaign_id) };
      case "ad":
        return { adSquadId: filters.adSquadId ?? String((entity as { ad_squad_id?: string }).ad_squad_id) };
      default:
        return {};
    }
  }

  private async buildMergedUpdateItem<T extends SnapchatEntityType>(
    entityType: T,
    entityId: string,
    data: Record<string, unknown>,
    filters: Record<string, string>,
    context?: RequestContext
  ): Promise<{ mergedItem: Record<string, unknown>; pathParams: Record<string, string> }> {
    const currentEntity = await this.getEntity(entityType, entityId, context);
    const pathParams = this.resolveUpdatePathParams(entityType, currentEntity, filters);
    return {
      mergedItem: { ...((currentEntity as unknown) as Record<string, unknown>), ...data, id: entityId },
      pathParams,
    };
  }

  /** Expose the underlying HTTP client for direct use (e.g., media uploads). */
  get client(): SnapchatHttpClient {
    return this.httpClient;
  }

  // ─── Standard CRUD ──────────────────────────────────────────────

  async listEntities<T extends SnapchatEntityType>(
    entityType: T,
    filters?: Record<string, string>,
    cursor?: string,
    context?: RequestContext
  ): Promise<{ entities: SnapchatEntityMap[T][]; nextCursor?: string }> {
    await this.rateLimiter.consume(`snapchat:default`);

    const config = getEntityConfig(entityType);

    const pathParams: Record<string, string> = {
      adAccountId: filters?.adAccountId ?? this.adAccountId,
      ...(filters?.campaignId ? { campaignId: filters.campaignId } : {}),
      ...(filters?.adSquadId ? { adSquadId: filters.adSquadId } : {}),
    };

    const interpolatedPath = interpolatePath(config.listPath, pathParams);

    const response = cursor?.startsWith("http")
      ? await this.httpClient.get(cursor, {}, context)
      : await this.httpClient.get(interpolatedPath, cursor ? { cursor } : {}, context);
    const entities = unwrapEntities(config.responseKey, config.entityKey, response) as SnapchatEntityMap[T][];
    const nextCursor = extractNextCursor(response);

    return { entities, nextCursor };
  }

  async getEntity<T extends SnapchatEntityType>(
    entityType: T,
    entityId: string,
    context?: RequestContext
  ): Promise<SnapchatEntityMap[T]> {
    await this.rateLimiter.consume(`snapchat:default`);

    const config = getEntityConfig(entityType);
    const interpolatedPath = interpolatePath(config.getPath, { entityId });

    const response = await this.httpClient.get(interpolatedPath, undefined, context);

    const entity = unwrapSingleEntity(config.responseKey, config.entityKey, response);
    if (!entity) {
      throw new McpError(JsonRpcErrorCode.NotFound, `${config.displayName} with ID ${entityId} not found`);
    }

    return entity as SnapchatEntityMap[T];
  }

  async createEntity<T extends SnapchatEntityType>(
    entityType: T,
    filters: Record<string, string>,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<SnapchatEntityMap[T]> {
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

    return unwrapSingleEntity(config.responseKey, config.entityKey, response) as SnapchatEntityMap[T];
  }

  async updateEntity<T extends SnapchatEntityType>(
    entityType: T,
    entityId: string,
    filters: Record<string, string>,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<SnapchatEntityMap[T]> {
    const config = getEntityConfig(entityType);

    await this.rateLimiter.consume(`snapchat:default`, 3);

    const { mergedItem, pathParams } = await this.buildMergedUpdateItem(entityType, entityId, data, filters, context);
    const interpolatedPath = interpolatePath(config.updatePath, pathParams);
    const body = { [config.responseKey]: [mergedItem] };
    const response = await this.httpClient.put(interpolatedPath, body, context);

    return unwrapSingleEntity(config.responseKey, config.entityKey, response) as SnapchatEntityMap[T];
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

  async updateEntityStatus<T extends SnapchatEntityType>(
    entityType: T,
    entityId: string,
    status: "ACTIVE" | "PAUSED",
    filters: Record<string, string> = {},
    context?: RequestContext
  ): Promise<SnapchatEntityMap[T]> {
    return this.updateEntity(entityType, entityId, filters, { status }, context);
  }

  // ─── Advertiser Account ──────────────────────────────────────────

  async listAdAccounts(context?: RequestContext): Promise<{ entities: SnapchatAdAccount[]; nextCursor?: string }> {
    await this.rateLimiter.consume(`snapchat:default`);

    const response = await this.httpClient.get(`/v1/organizations/${this.orgId}/adaccounts`, {}, context);
    const entities = unwrapEntities("adaccounts", "adaccount", response) as SnapchatAdAccount[];
    const nextCursor = extractNextCursor(response);

    return { entities, nextCursor };
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
        const previousBid = entity.bid_micro != null ? entity.bid_micro / 1_000_000 : undefined;

        // Update bid — convert currency to micros (Snapchat stores bids in micro-currency)
        const bidMicro = Math.round(adjustment.bidPrice * 1_000_000);
        await this.updateEntity("adGroup", adjustment.adGroupId, {}, {
          bid_micro: bidMicro,
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
    const config = getEntityConfig(entityType);

    await this.rateLimiter.consume(`snapchat:default`, 3);

    const pathParams: Record<string, string> = {
      adAccountId: filters.adAccountId ?? this.adAccountId,
      ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
      ...(filters.adSquadId ? { adSquadId: filters.adSquadId } : {}),
    };
    const interpolatedPath = interpolatePath(config.createPath, pathParams);

    const body = { [config.responseKey]: items };
    const response = await this.httpClient.post(interpolatedPath, body, context);
    const bulkResults = unwrapBulkResults(config.responseKey, config.entityKey, response);

    return {
      results: items.map((_, i) =>
        bulkResults[i] ?? { success: false, error: `No result returned for item ${i}` }
      ),
    };
  }

  async bulkUpdateEntities(
    entityType: SnapchatEntityType,
    filters: Record<string, string>,
    items: Array<{ entityId: string; data: Record<string, unknown> }>,
    context?: RequestContext
  ): Promise<{ results: Array<{ entityId: string; success: boolean; error?: string }> }> {
    const config = getEntityConfig(entityType);

    await this.rateLimiter.consume(`snapchat:default`, 3);

    const mergedItems = await Promise.all(
      items.map(async (item) => {
        const { mergedItem, pathParams } = await this.buildMergedUpdateItem(
          entityType,
          item.entityId,
          item.data,
          filters,
          context
        );
        return { mergedItem, pathParams };
      })
    );

    const collectionPath = interpolatePath(config.updatePath, mergedItems[0]?.pathParams ?? filters);
    const body = {
      [config.responseKey]: mergedItems.map((item) => item.mergedItem),
    };
    const response = await this.httpClient.put(collectionPath, body, context);
    const bulkResults = unwrapBulkResults(config.responseKey, config.entityKey, response);

    return {
      results: items.map((item, i) => {
        const r = bulkResults[i];
        return {
          entityId: item.entityId,
          success: r?.success ?? false,
          error: r?.success ? undefined : (r?.error ?? `No result returned for ${item.entityId}`),
        };
      }),
    };
  }

  async bulkUpdateStatus(
    entityType: SnapchatEntityType,
    filters: Record<string, string>,
    entityIds: string[],
    status: "ACTIVE" | "PAUSED",
    context?: RequestContext
  ): Promise<{ results: Array<{ entityId: string; success: boolean; error?: string }> }> {
    return this.bulkUpdateEntities(
      entityType,
      filters,
      entityIds.map((entityId) => ({ entityId, data: { status } })),
      context
    );
  }

  // ─── Targeting ───────────────────────────────────────────────────

  async searchTargeting(
    targetingType: string,
    countryCode: string | undefined,
    query?: string,
    limit = 20,
    context?: RequestContext
  ): Promise<{ results: Record<string, unknown>[]; nextCursor?: string }> {
    const response = await this.getTargetingOptions(targetingType, countryCode, limit, context);
    const normalizedQuery = query?.trim().toLowerCase();
    const filteredResults = normalizedQuery
      ? response.results.filter((item) => JSON.stringify(item).toLowerCase().includes(normalizedQuery))
      : response.results;

    return {
      results: filteredResults.slice(0, limit),
      nextCursor: response.nextCursor,
    };
  }

  async getTargetingOptions(
    targetingType = "country_support",
    countryCode?: string,
    limit = 50,
    context?: RequestContext
  ): Promise<{ results: Record<string, unknown>[]; nextCursor?: string }> {
    await this.rateLimiter.consume(`snapchat:default`);

    const config = TARGETING_ENDPOINTS[targetingType];
    if (!config) {
      throw new McpError(JsonRpcErrorCode.InvalidParams, `Unsupported Snapchat targeting type: ${targetingType}`);
    }
    if (config.requiresCountryCode && !countryCode) {
      throw new McpError(JsonRpcErrorCode.InvalidParams, `Targeting type ${targetingType} requires countryCode`);
    }

    const path = interpolatePath(config.path, {
      countryCode: countryCode?.toLowerCase() ?? "",
    });
    const params: Record<string, string> = {};
    if (countryCode) {
      params.country_code = countryCode.toLowerCase();
    }
    if (targetingType.startsWith("interests_")) {
      params.limit = String(Math.max(50, Math.min(limit, 1000)));
    } else if (targetingType === "geo_postal_code") {
      params.limit = String(Math.max(10, Math.min(limit, 10000)));
    }

    const response = await this.httpClient.get(path, params, context);

    if (targetingType === "country_support") {
      return {
        results: [response as Record<string, unknown>],
        nextCursor: extractNextCursor(response),
      };
    }

    return {
      results: extractTargetingDimensions(response, config.responseKey),
      nextCursor: extractNextCursor(response),
    };
  }

  // ─── Audience Estimate ──────────────────────────────────────────

  async getAudienceEstimate(
    targetingConfig: Record<string, unknown>,
    adAccountId?: string,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`snapchat:default`);

    const effectiveAdAccountId = adAccountId ?? this.adAccountId;
    return this.httpClient.post(`/v1/adaccounts/${effectiveAdAccountId}/audience_size_v2`, targetingConfig, context);
  }

  // ─── Ad Previews ────────────────────────────────────────────────

  async getCreativePreview(
    creativeId: string,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`snapchat:default`);
    return this.httpClient.get(`/v1/creatives/${creativeId}/creative_preview`, undefined, context);
  }

}
