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
import { buildPinterestDuplicateCopy } from "../../mcp-server/tools/utils/duplicate-copy.js";
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

/**
 * Limiter tokens one read / one write `consume` costs (a read passes no count,
 * i.e. `consume`'s default of 1). Exported because the bulk capacity pre-check
 * (`tools/utils/bulk-capacity.ts`) projects a batch from exactly these costs —
 * a change here must move the projection with it.
 */
export const PINTEREST_READ_TOKENS = 1;
export const PINTEREST_WRITE_TOKENS = 3;

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
 * - List filters: `campaign_ids` / `ad_group_ids` query params (plural, per the v5 spec)
 * - Get: GET `/v5/ad_accounts/{ad_account_id}/{campaigns|ad_groups|ads}/{id}` (or `/v5/pins/{id}`)
 * - Create: campaigns/ad groups/ads POST an array body `[entityObject]` (batch
 *   endpoint, max 30 items; this service always sends exactly one) and get HTTP
 *   200 with `{ items: [{ data, exceptions }] }` — a rejected item still arrives
 *   as a 200, so every item's `exceptions` must be checked (see
 *   `unwrapBatchWriteItem`). Pins POST a single `PinCreate` object to `/v5/pins`.
 * - Update: PATCH with array body `[{ id, ...fields }]`, same `{ items: [{ data, exceptions }] }` shape
 * - Status update: PATCH (status is just a field in the update body)
 * - Removal: campaigns/ad groups/ads have NO DELETE method in v5 — they are
 *   archived via PATCH `status: "ARCHIVED"`. Only Pins have a real
 *   `DELETE /v5/pins/{pin_id}`.
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
    // Pinterest v5 list filters are plural arrays (`campaign_ids`, `ad_group_ids`);
    // the singular `campaign_id` / `ad_group_id` are not parameters and were
    // ignored, returning every entity in the account.
    if (filters.campaignId) params.campaign_ids = filters.campaignId;
    if (filters.adGroupId) params.ad_group_ids = filters.adGroupId;

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

    await this.rateLimiter.consume(`pinterest:${filters.adAccountId}`, PINTEREST_WRITE_TOKENS);

    if (!config.batchWrite) {
      // `POST /v5/pins` takes a single `PinCreate` object and returns the Pin.
      return (await this.httpClient.post(path, body, context)) as PinterestEntityMap[T];
    }
    // Batch endpoints take an array (max 30 items); one item per request here.
    const data = await this.httpClient.post(path, [body], context);
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

    await this.rateLimiter.consume(`pinterest:${filters.adAccountId}`, PINTEREST_WRITE_TOKENS);

    // Single-entity endpoints (e.g. /v5/pins/{entityId}) expect a flat body
    const isSingleEntity = config.updatePath.includes("{entityId}");
    if (isSingleEntity) {
      return this.httpClient.patch(path, updates, context) as Promise<PinterestEntityMap[T]>;
    }

    // Batch endpoints expect an array body and return { items: [{ data, exceptions }] }.
    // `id` is spread last: an `id` inside `updates` must not redirect the PATCH
    // to a different entity than the one the caller named (and governance
    // authorized) as `entityId`.
    const data = await this.httpClient.patch(
      path,
      [{ ...(updates as object), id: entityId }],
      context
    );
    return unwrapBatchWriteItem(
      data,
      config.displayName,
      "update",
      entityId
    ) as PinterestEntityMap[T];
  }

  /**
   * Remove entities the way Pinterest v5 supports for each type.
   *
   * - campaign / adGroup / ad: there is no DELETE method on these endpoints, so
   *   removal is a PATCH setting `status: "ARCHIVED"` — one request per id so
   *   each id's `exceptions` are attributed to it (batch responses carry no id
   *   on a rejected item). The entity still exists afterwards, archived.
   * - creative (Pin): `DELETE /v5/pins/{pin_id}`, one request per id.
   *
   * Per-id outcomes are reported; a failure after an earlier success never
   * discards the work already done.
   */
  async deleteEntity(
    entityType: PinterestEntityType,
    filters: { adAccountId: string },
    entityIds: string[],
    context?: RequestContext
  ): Promise<{
    removal: "archived" | "deleted";
    results: Array<{ entityId: string; success: boolean; error?: string }>;
  }> {
    const config = getEntityConfig(entityType);

    if (config.removal === "archive") {
      const bulkResults = await executeBulkConcurrent(
        entityIds,
        (entityId) =>
          this.updateEntity(entityType, filters, entityId, { status: "ARCHIVED" }, context),
        { logger: this.logger }
      );
      return {
        removal: "archived",
        results: bulkResults.map((r, i) => ({
          entityId: entityIds[i],
          success: r.success,
          ...(r.success ? {} : { error: r.error }),
        })),
      };
    }

    const deletePath = config.deletePath;
    if (!deletePath) {
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        `${config.displayName} is configured for DELETE removal but has no deletePath`
      );
    }

    await this.rateLimiter.consume(`pinterest:${filters.adAccountId}`, PINTEREST_WRITE_TOKENS);

    const settled = await Promise.allSettled(
      entityIds.map((id) => {
        const path = interpolatePath(deletePath, {
          adAccountId: filters.adAccountId,
          entityId: encodeURIComponent(id),
        });
        return this.httpClient.delete(path, {}, context);
      })
    );
    return {
      removal: "deleted",
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
    // buildPinterestDuplicateCopy strips read-only fields, applies `options`
    // and forces status PAUSED; the dry run projects the same body.
    const source = (await this.getEntity(
      entityType,
      filters,
      entityId,
      context
    )) as unknown as Record<string, unknown>;

    const { body, ignoredStatus } = buildPinterestDuplicateCopy(entityType, source, options);
    if (ignoredStatus !== undefined) {
      this.logger.warn(
        { entityType, requestedStatus: ignoredStatus },
        "Ignoring status override on duplicate; copies are always created PAUSED"
      );
    }

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

  /**
   * Search targeting options of one type.
   *
   * Pinterest v5's only targeting-options endpoint is
   * `GET /v5/resources/targeting/{targeting_type}` (`targeting_options/get`),
   * which takes no keyword or count parameter — so the keyword filter and the
   * limit are applied here, client-side, over the full option list.
   */
  async searchTargeting(
    targetingType: PinterestTargetingType,
    query: string | undefined,
    limit: number,
    filters: { adAccountId: string },
    context?: RequestContext
  ): Promise<Array<Record<string, unknown>>> {
    const options = await this.fetchTargetingOptions(targetingType, filters, context);
    const flattened = flattenTargetingOptions(options);
    const needle = query?.trim().toLowerCase();
    const matched = needle
      ? flattened.filter((option) => JSON.stringify(option).toLowerCase().includes(needle))
      : flattened;
    return matched.slice(0, limit);
  }

  /**
   * List targeting options. Without a type, returns the targeting types
   * Pinterest v5 accepts (`PublicTargetingType`); with one, the options from
   * `GET /v5/resources/targeting/{targeting_type}`.
   */
  async getTargetingOptions(
    targetingType: PinterestTargetingType | undefined,
    filters: { adAccountId: string },
    context?: RequestContext
  ): Promise<
    { targeting_types: readonly string[] } | { targeting_type: string; options: unknown[] }
  > {
    if (!targetingType) {
      return { targeting_types: PINTEREST_TARGETING_TYPES };
    }
    const options = await this.fetchTargetingOptions(targetingType, filters, context);
    return { targeting_type: targetingType, options };
  }

  private async fetchTargetingOptions(
    targetingType: PinterestTargetingType,
    filters: { adAccountId: string },
    context?: RequestContext
  ): Promise<unknown[]> {
    await this.rateLimiter.consume("pinterest:default");
    const data = await this.httpClient.get(
      `/v5/resources/targeting/${encodeURIComponent(targetingType)}`,
      { ad_account_id: filters.adAccountId },
      context
    );
    if (Array.isArray(data)) return data;
    return data && typeof data === "object" ? [data] : [];
  }

  // ─── Audience Estimate ──────────────────────────────────────────

  /**
   * Potential audience size for a targeting spec:
   * `POST /v5/ad_accounts/{ad_account_id}/ad_groups/audience_sizing` with the
   * spec in the JSON body as `targeting_spec` (`AdGroupAudienceSizingCreate`).
   * Response: `{ audience_size_lower_bound, audience_size_upper_bound }`.
   */
  async getAudienceEstimate(
    filters: { adAccountId: string },
    targetingSpec: unknown,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`pinterest:${filters.adAccountId}`);

    const path = `/v5/ad_accounts/${encodeURIComponent(filters.adAccountId)}/ad_groups/audience_sizing`;
    return this.httpClient.post(path, { targeting_spec: targetingSpec }, context);
  }

  // ─── Ad Previews ────────────────────────────────────────────────

  /**
   * Preview an existing ad. Pinterest v5 has no preview-by-ad-id endpoint;
   * `POST /v5/ad_accounts/{ad_account_id}/ad_previews` (`ad_previews/create`,
   * scope `ads:write`) previews a Pin. So the ad is read first for its
   * `pin_id`, and the preview is created from that Pin. The response is
   * `{ url }` — a preview page that expires after 7 days.
   */
  async getAdPreviews(
    filters: { adAccountId: string },
    adId: string,
    creativeType?: string,
    context?: RequestContext
  ): Promise<{ pinId: string; preview: unknown }> {
    const ad = (await this.getEntity("ad", filters, adId, context)) as Record<string, unknown>;
    const pinId = ad.pin_id;
    if (pinId == null || String(pinId) === "") {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `Ad ${adId} has no pin_id, so no preview can be created for it`,
        { adId }
      );
    }

    await this.rateLimiter.consume(`pinterest:${filters.adAccountId}`);

    const path = `/v5/ad_accounts/${encodeURIComponent(filters.adAccountId)}/ad_previews`;
    const preview = await this.httpClient.post(
      path,
      { pin_id: String(pinId), ...(creativeType ? { creative_type: creativeType } : {}) },
      context
    );
    return { pinId: String(pinId), preview };
  }

  // ─── Internal Helpers ───────────────────────────────────────────
}

/** Pinterest v5 `PublicTargetingType` — the path values of `/v5/resources/targeting/{targeting_type}`. */
export const PINTEREST_TARGETING_TYPES = [
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
] as const;

export type PinterestTargetingType = (typeof PINTEREST_TARGETING_TYPES)[number];

/**
 * `targeting_options/get` returns an array of `TargetingOption` objects whose
 * documented sample is a single id→name map (`[{"36313": "Australia: …", "GR": "Greece"}]`).
 * Expand map-shaped items into `{ id, name }` rows so they can be filtered and
 * limited per option; any other object shape is passed through unchanged.
 */
export function flattenTargetingOptions(options: unknown[]): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  for (const option of options) {
    if (!option || typeof option !== "object" || Array.isArray(option)) continue;
    const entries = Object.entries(option as Record<string, unknown>);
    if (entries.length > 0 && entries.every(([, v]) => typeof v === "string")) {
      for (const [id, name] of entries) rows.push({ id, name });
    } else {
      rows.push(option as Record<string, unknown>);
    }
  }
  return rows;
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
