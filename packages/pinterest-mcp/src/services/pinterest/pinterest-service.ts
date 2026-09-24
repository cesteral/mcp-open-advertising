// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

// Generated TypeScript types for the Pinterest Marketing API v5 are available at
// src/generated/types.ts — run `pnpm run generate` to produce this file from the
// official Pinterest OpenAPI spec (https://raw.githubusercontent.com/pinterest/api-description/main/v5/openapi.json).

import type { PinterestHttpClient } from "./pinterest-http-client.js";
import type { RateLimiter } from "@cesteral/shared";
import {
  type RequestContext,
  executeBulkConcurrent,
  McpError,
  JsonRpcErrorCode,
} from "@cesteral/shared";
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

export type { PinterestCampaign, PinterestAdGroup, PinterestAd, PinterestPin };

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
 * - Get: GET `/v5/ad_accounts/{ad_account_id}/{campaigns|ad_groups|ads}/{id}` (or `/v5/pins/{id}`)
 * - Create: POST with array body `[entityObject]`, returns HTTP 200 with
 *   `{ items: [{ data, exceptions }] }` — a rejected item still arrives as a 200,
 *   so every item's `exceptions` must be checked (see `unwrapBatchWriteItem`)
 * - Update: PATCH with array body `[{ id, ...fields }]`, same `{ items: [{ data, exceptions }] }` shape
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

    const data = (await this.httpClient.get(path, params, context)) as PinterestListResponse;

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

    // Direct GET by ID. Pinterest v5's list endpoints have no `id` filter (only
    // `campaign_ids` / `ad_group_ids` / `ad_ids`), so listing with `?id=` and
    // taking the first item returned an arbitrary entity from the account.
    const path = interpolatePath(config.getPath, {
      adAccountId: filters.adAccountId,
      entityId: encodeURIComponent(entityId),
    });

    const result = (await this.httpClient.get(path, {}, context)) as unknown;

    // Never hand back an entity other than the one asked for — every write
    // tool's snapshot, dry-run, duplicate and previous-bid read builds on this.
    const returnedId =
      result && typeof result === "object" && !Array.isArray(result)
        ? (result as Record<string, unknown>)[config.idField]
        : undefined;
    if (returnedId == null || String(returnedId) !== entityId) {
      throw new McpError(
        JsonRpcErrorCode.NotFound,
        `${config.displayName} with ID ${entityId} not found`,
        { entityType, entityId, returnedId: returnedId == null ? null : String(returnedId) }
      );
    }
    return result as PinterestEntityMap[T];
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

    const data = await this.httpClient.post(path, [body], context);
    if (!config.batchWrite) {
      return data as PinterestEntityMap[T];
    }
    return unwrapBatchWriteItem(data, config.displayName, "create") as PinterestEntityMap[T];
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

    // Batch endpoints expect an array body and return { items: [{ data, exceptions }] }
    const data = await this.httpClient.patch(
      path,
      [{ id: entityId, ...(updates as object) }],
      context
    );
    return unwrapBatchWriteItem(
      data,
      config.displayName,
      "update",
      entityId
    ) as PinterestEntityMap[T];
  }

  async deleteEntity(
    entityType: PinterestEntityType,
    filters: { adAccountId: string },
    entityIds: string[],
    context?: RequestContext
  ): Promise<{ results: Array<{ entityId: string; success: boolean; error?: string }> }> {
    const config = getEntityConfig(entityType);

    await this.rateLimiter.consume(`pinterest:${filters.adAccountId}`, 3);

    // Single-entity delete endpoints (e.g. /v5/pins/{entityId}) — delete each
    // individually. Use allSettled so a failure after an earlier success is
    // reported per-id rather than discarding the destructive work already done.
    if (config.deletePath.includes("{entityId}")) {
      const settled = await Promise.allSettled(
        entityIds.map((id) => {
          const path = interpolatePath(config.deletePath, {
            adAccountId: filters.adAccountId,
            entityId: id,
          });
          return this.httpClient.delete(path, {}, context);
        })
      );
      return {
        results: settled.map((outcome, i) => ({
          entityId: entityIds[i],
          success: outcome.status === "fulfilled",
          ...(outcome.status === "rejected"
            ? {
                error:
                  outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
              }
            : {}),
        })),
      };
    }

    // Bulk delete via query params (e.g. ?campaign_ids=id1,id2) — a single atomic
    // request. A throw here propagates (whole-batch failure, nothing deleted);
    // success means every id was accepted.
    const path = interpolatePath(config.deletePath, { adAccountId: filters.adAccountId });
    await this.httpClient.delete(path, { [config.deleteIdsParam]: entityIds.join(",") }, context);
    return { results: entityIds.map((entityId) => ({ entityId, success: true })) };
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

  async listAdAccounts(
    params: { bookmark?: string; pageSize?: number } = {},
    context?: RequestContext
  ): Promise<{ entities: unknown[]; nextCursor?: string }> {
    await this.rateLimiter.consume("pinterest:default");
    const query: Record<string, string> = {};
    if (params.bookmark) query.bookmark = params.bookmark;
    if (params.pageSize !== undefined) query.page_size = String(params.pageSize);
    const response = (await this.httpClient.get("/v5/ad_accounts", query, context)) as Record<
      string,
      unknown
    >;
    const entities = Array.isArray(response.items) ? response.items : [];
    // Pinterest returns an empty-string bookmark on the last page — treat that as exhausted.
    const nextCursor =
      typeof response.bookmark === "string" && response.bookmark !== ""
        ? response.bookmark
        : undefined;
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
      this.logger.debug(
        { entityType },
        "Duplicate skipped: entity type does not support duplication"
      );
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `Entity type ${entityType} does not support duplication`
      );
    }

    // Pinterest v5 has no native copy/duplicate endpoint — implement as client-side read+create.
    // Read source entity, strip system-managed fields, then create a new one.
    const source = (await this.getEntity(
      entityType,
      filters,
      entityId,
      context
    )) as unknown as Record<string, unknown>;

    const SYSTEM_FIELDS = [
      "id",
      "created_time",
      "updated_time",
      "ad_account_id",
      "pin_count",
      "view_tags",
    ] as const;
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
        // `bidPrice` is in the advertiser's currency (major units, e.g. 1.5 =
        // $1.50); Pinterest's `bid_in_micro_currency` is an integer in micros.
        const bidMicros = currencyToMicros(adjustment.bidPrice);
        if (bidMicros < 1) {
          throw new McpError(
            JsonRpcErrorCode.InvalidParams,
            `bidPrice ${adjustment.bidPrice} is below the smallest representable bid (0.000001)`
          );
        }

        // Read current ad group state
        const entity = await this.getEntity("adGroup", filters, adjustment.adGroupId, context);
        // Report the previous bid in the same unit as the input (currency, not micros).
        const previousBid =
          entity.bid_in_micro_currency != null
            ? microsToCurrency(Number(entity.bid_in_micro_currency))
            : undefined;

        // Update bid
        await this.updateEntity(
          "adGroup",
          filters,
          adjustment.adGroupId,
          {
            bid_in_micro_currency: bidMicros,
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

  async bulkCreateEntities(
    entityType: PinterestEntityType,
    filters: { adAccountId: string },
    items: unknown[],
    context?: RequestContext
  ): Promise<{ results: Array<{ success: boolean; entity?: unknown; error?: string }> }> {
    const results = await executeBulkConcurrent(
      items,
      async (data) => {
        return this.createEntity(entityType, filters, data, context);
      },
      { logger: this.logger }
    );
    return { results };
  }

  async bulkUpdateEntities(
    entityType: PinterestEntityType,
    filters: { adAccountId: string },
    items: Array<{ entityId: string; data: unknown }>,
    context?: RequestContext
  ): Promise<{ results: Array<{ entityId: string; success: boolean; error?: string }> }> {
    const bulkResults = await executeBulkConcurrent(
      items,
      async (item) => {
        return this.updateEntity(entityType, filters, item.entityId, item.data, context);
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
    entityType: PinterestEntityType,
    filters: { adAccountId: string },
    entityIds: string[],
    status: string,
    context?: RequestContext
  ): Promise<{ results: Array<{ entityId: string; success: boolean; error?: string }> }> {
    this.logger.debug({ entityType, count: entityIds.length, status }, "Bulk status update");

    const bulkResults = await executeBulkConcurrent(
      entityIds,
      async (entityId) => {
        return this.updateEntity(entityType, filters, entityId, { status }, context);
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

  async getTargetingOptions(targetingType?: string, context?: RequestContext): Promise<unknown> {
    await this.rateLimiter.consume("pinterest:default");

    // If no type specified, return the list of supported targeting types
    if (!targetingType) {
      return {
        targeting_types: [
          "APPTYPE",
          "GENDER",
          "LOCALE",
          "AGE_BUCKET",
          "LOCATION",
          "GEO",
          "INTEREST",
          "KEYWORD",
          "AUDIENCE_INCLUDE",
          "AUDIENCE_EXCLUDE",
        ],
      };
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

const MICROS_PER_UNIT = 1_000_000;

/** Currency (major units) → integer micro-currency, e.g. `1.5` → `1500000`. */
export function currencyToMicros(amount: number): number {
  return Math.round(amount * MICROS_PER_UNIT);
}

/** Integer micro-currency → currency (major units), e.g. `1500000` → `1.5`. */
export function microsToCurrency(micros: number): number | undefined {
  return Number.isFinite(micros) ? micros / MICROS_PER_UNIT : undefined;
}

interface PinterestBatchException {
  code?: number;
  message?: string;
}

/**
 * Unwrap the single item of a Pinterest batch write response.
 *
 * `POST`/`PATCH /v5/ad_accounts/{id}/{campaigns,ad_groups,ads}` answer HTTP 200
 * with `{ items: [{ data, exceptions }] }` even when the item was rejected, so
 * a 2xx alone says nothing about whether the write happened. Per the v5 spec
 * `exceptions` is an array on campaigns/ad groups (`CampaignBatchItem`,
 * `Pinterest.Lib.BatchItemException[]`) and a single object on ads
 * (`AdBatchItem.exceptions: Pinterest.Lib.Error`) — both are handled.
 *
 * Throws when the item carries exceptions or the response lacks an item/data,
 * so single-entity tools fail and bulk tools record a per-item error.
 */
export function unwrapBatchWriteItem(
  response: unknown,
  displayName: string,
  operation: "create" | "update",
  entityId?: string
): Record<string, unknown> {
  const subject = entityId ? `${displayName} ${entityId}` : displayName;
  const items =
    response &&
    typeof response === "object" &&
    Array.isArray((response as { items?: unknown }).items)
      ? (response as { items: unknown[] }).items
      : undefined;
  const item = items?.[0];
  if (!item || typeof item !== "object") {
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      `Pinterest ${operation} of ${subject} returned no result item; the outcome is unknown — verify before retrying`,
      { operation, entityId }
    );
  }

  const { data, exceptions } = item as { data?: unknown; exceptions?: unknown };
  const exceptionList: PinterestBatchException[] = (
    Array.isArray(exceptions) ? exceptions : exceptions ? [exceptions] : []
  ).filter((e): e is PinterestBatchException => !!e && typeof e === "object");

  if (exceptionList.length > 0) {
    const detail = exceptionList
      .map((e) => (e.code != null ? `[${e.code}] ${e.message ?? ""}` : (e.message ?? "")).trim())
      .join("; ");
    throw new McpError(
      JsonRpcErrorCode.ValidationError,
      `Pinterest rejected ${operation} of ${subject}: ${detail || "unspecified error"}`,
      { operation, entityId, exceptions: exceptionList }
    );
  }

  if (!data || typeof data !== "object") {
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      `Pinterest ${operation} of ${subject} returned an item with neither data nor exceptions; the outcome is unknown — verify before retrying`,
      { operation, entityId }
    );
  }
  return data as Record<string, unknown>;
}
