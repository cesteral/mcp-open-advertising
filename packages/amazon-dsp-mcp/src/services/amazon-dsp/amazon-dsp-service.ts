// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { AmazonDspHttpClient } from "./amazon-dsp-http-client.js";
import type { RateLimiter } from "@cesteral/shared";
import {
  type RequestContext,
  executeBulkConcurrent,
  fetchWithTimeout,
  McpError,
  JsonRpcErrorCode,
} from "@cesteral/shared";
import {
  getCanonicalEntityType,
  getEntityContract,
  interpolatePath,
  encodePathSegment,
  type AmazonDspEntityType,
} from "../../mcp-server/tools/utils/entity-mapping.js";
import { unifiedEntityPath, type AmazonDspEntityContract } from "./amazon-dsp-api-contract.js";
import { AMAZON_ADS_V1_HEADERS } from "./amazon-dsp-v1-api-contract.js";
import {
  buildDuplicatePayload,
  buildQueryBody,
  translateCreatePayload,
  translateUpdatePayload,
  type UnifiedPayloadIssue,
} from "./unified-payload.js";
import type {
  AmazonDspAdvertiser,
  AmazonDspPageInfo,
  AmazonDspApiError,
  AmazonDspUnifiedEntity,
  AmazonDspUnifiedErrorIndex,
  AmazonDspUnifiedPage,
} from "./types.js";

export type {
  AmazonDspAdvertiser,
  AmazonDspPageInfo,
  AmazonDspApiError,
  AmazonDspUnifiedEntity,
  AmazonDspUnifiedPage,
};

/** Raw legacy list response shape (`GET /dsp/advertisers`). */
interface AmazonDspRawListResponse {
  [key: string]: unknown;
  totalResults?: number;
}

/** How `deleteEntity` removed an entity. */
export type AmazonDspRemovalMode = "unified_delete" | "legacy_archive";

/**
 * Parse the `/assets/upload` response into the presigned upload URL. Amazon's
 * exact field casing is not confirmable from the auth-walled reference, so the
 * URL is the first field whose value is an http(s) string. Throws if none.
 */
export function extractAssetUploadUrl(response: Record<string, unknown>): string {
  for (const value of Object.values(response ?? {})) {
    if (typeof value === "string" && /^https?:\/\//i.test(value)) {
      return value;
    }
  }
  throw new McpError(
    JsonRpcErrorCode.InternalError,
    "Amazon did not return an upload URL from /assets/upload"
  );
}

function throwIssues(op: string, issues: UnifiedPayloadIssue[]): void {
  if (issues.length === 0) return;
  throw new McpError(
    JsonRpcErrorCode.InvalidParams,
    `Invalid ${op} payload: ${issues.map((i) => i.message).join("; ")}`,
    { issues }
  );
}

function unsupported(reason: string | undefined, what: string): void {
  if (reason) {
    throw new McpError(JsonRpcErrorCode.InvalidParams, `${what} is not supported: ${reason}`);
  }
}

/**
 * Unwrap a single-item 207 multi-status (`DSP<Entity>MultiStatusResponse`):
 * `success[].<itemKey>` on success, `error[].errors[]` surfaced as
 * `InvalidParams` with Amazon's codes and field locations.
 */
export function unwrapSingleMultiStatus(
  raw: unknown,
  contract: AmazonDspEntityContract,
  op: string
): AmazonDspUnifiedEntity {
  const r = (raw ?? {}) as {
    success?: Array<Record<string, unknown>>;
    error?: AmazonDspUnifiedErrorIndex[];
  };
  const success = Array.isArray(r.success) ? r.success : [];
  const errors = Array.isArray(r.error) ? r.error : [];
  const hit = success.find((s) => s?.index === 0) ?? success[0];
  const item = hit?.[contract.unified.itemKey];
  if (errors.length === 0 && item && typeof item === "object") {
    return item as AmazonDspUnifiedEntity;
  }
  if (errors.length > 0) {
    const detail = errors
      .flatMap((e) => (Array.isArray(e?.errors) ? e.errors : []))
      .map(
        (e) =>
          `[${e.code ?? "ERROR"}] ${e.message ?? "rejected"}${e.fieldLocation ? ` (at ${e.fieldLocation})` : ""}`
      )
      .join("; ");
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `Amazon DSP rejected the ${op} ${contract.displayName.toLowerCase()} request: ${detail || "no error detail"}`,
      { error: errors }
    );
  }
  throw new McpError(
    JsonRpcErrorCode.InternalError,
    `Amazon DSP returned an unexpected multi-status shape for a single-item ${op} (success=${success.length}, error=${errors.length})`,
    { raw }
  );
}

/**
 * AmazonDspService — entity CRUD over the Amazon Ads **Unified API**
 * (`/adsApi/v1/*`, #234), plus the legacy calls that have no Unified
 * equivalent (advertiser listing, ad preview, order/line-item archive).
 *
 * Unified patterns (basis: amzn/ads-advanced-tools-docs @ e25aace0,
 * unified-api-dsp.json; see amazon-dsp-api-contract.ts):
 * - Every call is `POST /adsApi/v1/{create|update|query|delete}/{resource}`
 *   with `Amazon-Ads-AccountId: <accountId>` and `Amazon-Ads-ClientId`.
 * - Writes are batch-shaped (`{ campaigns: [...] }`); this service sends one
 *   item per request and unwraps the 207 multi-status.
 * - Reads are `query/*` with `{ include: [...] }` filters and `nextToken`
 *   pagination.
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

  /** POST a Unified entity operation with the account header. */
  private async unifiedPost(
    path: string,
    body: Record<string, unknown>,
    accountId: string,
    context?: RequestContext
  ): Promise<unknown> {
    return this.httpClient.post(path, body, context, "application/json", undefined, {
      [AMAZON_ADS_V1_HEADERS.accountId]: accountId,
    });
  }

  // ─── Creative Asset Library Upload ──────────────────────────────
  //
  // Amazon's Creative Asset Library is the media-upload surface behind DSP
  // video creatives (a DSP video creative references an assetId from the
  // library). The documented three-step flow (Amazon Ads "Creative asset
  // library API"; exact paths/bodies mirror the official python-amazon-ad-api
  // client, ad_api/api/creative_assets.py):
  //   1. POST /assets/upload  { fileName }            → presigned upload URL (15-min TTL)
  //   2. PUT the raw bytes to that URL
  //   3. POST /assets/register { url, name, assetType, ... } → registered assetId
  //
  // VERIFICATION NOTE: /assets/* is the same Amazon Ads API host + Bearer/Scope
  // auth the legacy DSP endpoints use, so the existing httpClient carries it.
  // The step-1 response field holding the upload URL is parsed defensively
  // (`extractAssetUploadUrl`) because Amazon's exact casing is not confirmable
  // from the auth-walled reference; `assetType: "VIDEO"` and the DSP program
  // context are supplied by the caller in `registerFields`.

  /**
   * Upload a media asset to the Creative Asset Library and register it.
   * `registerFields` carries `name`, `assetType` (e.g. "VIDEO"), and any
   * optional metadata (asinList, tags, registrationContext, …).
   * Returns the raw registered-asset response (which carries the assetId).
   */
  async uploadCreativeAsset(
    fileName: string,
    buffer: Buffer,
    contentType: string,
    registerFields: Record<string, unknown>,
    context?: RequestContext
  ): Promise<{ uploadUrl: string; asset: Record<string, unknown> }> {
    await this.rateLimiter.consume("amazon_dsp:write", 3);

    // Step 1 — register an upload location.
    const uploadResponse = (await this.httpClient.post(
      "/assets/upload",
      { fileName },
      context
    )) as Record<string, unknown>;
    const uploadUrl = extractAssetUploadUrl(uploadResponse);

    // Step 2 — PUT bytes to the presigned URL. No Amazon auth headers: presigned
    // storage URLs are self-signed and reject extra Authorization headers.
    const putResponse = await fetchWithTimeout(uploadUrl, 300_000, context, {
      method: "PUT",
      body: buffer,
      headers: { "Content-Type": contentType },
    });
    if (!putResponse.ok) {
      const errBody = await putResponse.text().catch(() => "");
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        `Amazon asset upload failed: PUT to presigned URL returned HTTP ${putResponse.status}. ${errBody.substring(0, 200)}`
      );
    }

    // Step 3 — register the uploaded asset in the library.
    const asset = (await this.httpClient.post(
      "/assets/register",
      { url: uploadUrl, ...registerFields },
      context
    )) as Record<string, unknown>;

    return { uploadUrl, asset };
  }

  // ─── Unified entity reads ───────────────────────────────────────

  /**
   * One page of `POST /adsApi/v1/query/{resource}` (DSPQuery<Entity>).
   * `filters` keys are mapped by the contract's `filterKeys` (legacy names
   * accepted); values may be comma-separated.
   */
  async listEntities(
    entityType: AmazonDspEntityType,
    accountId: string,
    params: { filters?: Record<string, string>; maxResults?: number; nextToken?: string } = {},
    context?: RequestContext
  ): Promise<AmazonDspUnifiedPage> {
    const contract = getEntityContract(entityType);
    const { item: body, issues } = buildQueryBody(
      getCanonicalEntityType(entityType),
      params,
      accountId
    );
    throwIssues("query", issues);

    await this.rateLimiter.consume("amazon_dsp:read");
    const result = (await this.unifiedPost(
      unifiedEntityPath("query", contract.unified.resource),
      body,
      accountId,
      context
    )) as Record<string, unknown> | undefined;

    const entities = Array.isArray(result?.[contract.unified.resource])
      ? (result![contract.unified.resource] as AmazonDspUnifiedEntity[])
      : [];
    const nextToken =
      typeof result?.nextToken === "string" && result.nextToken !== ""
        ? result.nextToken
        : undefined;
    return { entities, nextToken };
  }

  /**
   * Read one entity: `query/{resource}` with `{idFilter}: { include: [id] }`.
   * Targets are refused — `DSPQueryTargetRequest` has no targetId filter.
   */
  async getEntity(
    entityType: AmazonDspEntityType,
    accountId: string,
    entityId: string,
    context?: RequestContext
  ): Promise<AmazonDspUnifiedEntity> {
    const contract = getEntityContract(entityType);
    unsupported(contract.getUnsupportedReason, `Reading a single ${entityType} by ID`);
    const { item: body, issues } = buildQueryBody(
      getCanonicalEntityType(entityType),
      { ids: [entityId], maxResults: 1 },
      accountId
    );
    throwIssues("query", issues);
    await this.rateLimiter.consume("amazon_dsp:read");
    const result = (await this.unifiedPost(
      unifiedEntityPath("query", contract.unified.resource),
      body,
      accountId,
      context
    )) as Record<string, unknown> | undefined;
    const list = Array.isArray(result?.[contract.unified.resource])
      ? (result![contract.unified.resource] as AmazonDspUnifiedEntity[])
      : [];
    const found = list.find((e) => String(e?.[contract.unified.idField]) === entityId);
    if (!found) {
      throw new McpError(
        JsonRpcErrorCode.NotFound,
        `Amazon DSP ${entityType} ${entityId} was not found in account ${accountId} (Unified query ${contract.unified.resource} returned no match)`
      );
    }
    return found;
  }

  // ─── Unified entity writes ──────────────────────────────────────

  /** `POST /adsApi/v1/create/{resource}` with a one-item batch. */
  async createEntity(
    entityType: AmazonDspEntityType,
    accountId: string,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<AmazonDspUnifiedEntity> {
    const contract = getEntityContract(entityType);
    unsupported(contract.createUnsupportedReason, `Creating a ${entityType}`);
    const { item, issues } = translateCreatePayload(
      getCanonicalEntityType(entityType),
      data,
      accountId
    );
    throwIssues("create", issues);

    await this.rateLimiter.consume("amazon_dsp:write", 3);
    const raw = await this.unifiedPost(
      unifiedEntityPath("create", contract.unified.resource),
      { [contract.unified.resource]: [item] },
      accountId,
      context
    );
    return unwrapSingleMultiStatus(raw, contract, "create");
  }

  /** `POST /adsApi/v1/update/{resource}` with `[{ <idField>: id, ...patch }]`. */
  async updateEntity(
    entityType: AmazonDspEntityType,
    accountId: string,
    entityId: string,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<AmazonDspUnifiedEntity> {
    const contract = getEntityContract(entityType);
    unsupported(contract.updateUnsupportedReason, `Updating a ${entityType}`);
    const { item, issues } = translateUpdatePayload(
      getCanonicalEntityType(entityType),
      entityId,
      data,
      accountId
    );
    throwIssues("update", issues);

    await this.rateLimiter.consume("amazon_dsp:write", 3);
    const raw = await this.unifiedPost(
      unifiedEntityPath("update", contract.unified.resource),
      { [contract.unified.resource]: [item] },
      accountId,
      context
    );
    return unwrapSingleMultiStatus(raw, contract, "update");
  }

  /** Status-only update (`DSPUpdateState`: ENABLED | PAUSED). */
  async updateEntityStatus(
    entityType: AmazonDspEntityType,
    accountId: string,
    entityId: string,
    state: string,
    context?: RequestContext
  ): Promise<AmazonDspUnifiedEntity> {
    return this.updateEntity(entityType, accountId, entityId, { state }, context);
  }

  /**
   * Remove one entity.
   * - target / creativeAssociation → `POST /adsApi/v1/delete/{resource}`
   *   `{ targetIds | adAssociationIds: [id] }` (DSPDeleteTarget /
   *   DSPDeleteAdAssociation).
   * - order / lineItem → LEGACY `PUT /dsp/orders|lineItems/{id} { state: "ARCHIVED" }`:
   *   the Unified DSP spec has neither a delete for campaigns / ad groups nor
   *   ARCHIVED in `DSPUpdateState`. Kept from before #234, never verified live.
   * - creative → refused (no Unified delete/ads, no ARCHIVED update state).
   */
  async deleteEntity(
    entityType: AmazonDspEntityType,
    accountId: string,
    entityId: string,
    context?: RequestContext
  ): Promise<{ mode: AmazonDspRemovalMode; entity: unknown }> {
    const contract = getEntityContract(entityType);
    unsupported(contract.deleteUnsupportedReason, `Removing a ${entityType}`);

    if (contract.unified.deleteIdsKey) {
      await this.rateLimiter.consume("amazon_dsp:write", 3);
      const raw = await this.unifiedPost(
        unifiedEntityPath("delete", contract.unified.resource),
        { [contract.unified.deleteIdsKey]: [entityId] },
        accountId,
        context
      );
      return { mode: "unified_delete", entity: unwrapSingleMultiStatus(raw, contract, "delete") };
    }

    if (contract.legacyArchive) {
      const path = interpolatePath(contract.legacyArchive.pathTemplate, { entityId });
      await this.rateLimiter.consume("amazon_dsp:write", 3);
      const entity = await this.httpClient.put(
        path,
        { state: "ARCHIVED" },
        context,
        contract.legacyArchive.mediaType
      );
      return { mode: "legacy_archive", entity };
    }

    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `Removing a ${entityType} is not supported on the Unified DSP API`
    );
  }

  // ─── Advertiser Account (LEGACY — no Unified DSP equivalent) ────

  /**
   * `GET /dsp/advertisers` — kept from before #234. unified-api-dsp.json has
   * no advertiser listing; Amazon's Postman collection lists
   * `query/advertiserAccounts` only under "Unified API — Beta", outside the
   * DSP spec, so it is not adopted here.
   */
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

    const entities = (result?.response as AmazonDspAdvertiser[]) ?? [];
    const totalResults = typeof result?.totalResults === "number" ? result.totalResults : undefined;

    return {
      entities,
      pageInfo: {
        startIndex,
        count: pageSize,
        totalResults,
      },
    };
  }

  // ─── Ad Previews (LEGACY — no Unified DSP equivalent) ───────────

  /**
   * `GET /dsp/creatives/{id}/preview` — kept from before #234; the Unified DSP
   * spec has no preview operation. Whether a Unified `adId` is accepted here
   * as a legacy creative ID is unverified.
   */
  async getAdPreviews(creativeId: string, context?: RequestContext): Promise<unknown> {
    await this.rateLimiter.consume("amazon_dsp:read");
    return this.httpClient.get(
      `/dsp/creatives/${encodePathSegment(creativeId, "creativeId")}/preview`,
      undefined,
      context
    );
  }

  // ─── Duplicate ──────────────────────────────────────────────────

  /**
   * Duplicate via read → project → create (the Unified DSP API has no copy
   * operation). The source is projected onto the create schema (read-only
   * fields stripped, see `projectForDuplicate`); `options` override last.
   * Campaigns and ad groups are created PAUSED — the only create state Amazon
   * accepts for them — so an `options.state` other than PAUSED is refused by
   * the create translation rather than ignored.
   */
  async duplicateEntity(
    entityType: AmazonDspEntityType,
    accountId: string,
    entityId: string,
    options?: Record<string, unknown>,
    context?: RequestContext
  ): Promise<AmazonDspUnifiedEntity> {
    const source = await this.getEntity(entityType, accountId, entityId, context);
    const copy = buildDuplicatePayload(getCanonicalEntityType(entityType), source, options);
    return this.createEntity(entityType, accountId, copy, context);
  }

  // ─── Bid Adjustment ─────────────────────────────────────────────

  /**
   * Set an ad group's (line item's) `bid.baseBid`. Reads the ad group, then
   * `POST /adsApi/v1/update/adGroups` with `bid: { baseBid, maxAverageBid? }`
   * (DSPUpdateAdGroupBid — `currencyCode` is read-only and not sent).
   */
  async adjustBids(
    accountId: string,
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
        const entity = await this.getEntity("lineItem", accountId, adjustment.lineItemId, context);
        const currentBid = (entity.bid ?? {}) as Record<string, unknown>;
        const previousBid = typeof currentBid.baseBid === "number" ? currentBid.baseBid : undefined;
        const bid: Record<string, unknown> = { baseBid: adjustment.bidAmount };
        if (typeof currentBid.maxAverageBid === "number") {
          bid.maxAverageBid = currentBid.maxAverageBid;
        }

        await this.updateEntity("lineItem", accountId, adjustment.lineItemId, { bid }, context);

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

  async bulkCreateEntities(
    entityType: AmazonDspEntityType,
    accountId: string,
    items: Record<string, unknown>[],
    context?: RequestContext
  ): Promise<{
    results: Array<{ success: boolean; entity?: AmazonDspUnifiedEntity; error?: string }>;
  }> {
    const results = await executeBulkConcurrent(items, async (data) => {
      return this.createEntity(entityType, accountId, data, context);
    });
    return { results };
  }

  async bulkUpdateEntities(
    entityType: AmazonDspEntityType,
    accountId: string,
    items: Array<{ entityId: string; data: Record<string, unknown> }>,
    context?: RequestContext
  ): Promise<{ results: Array<{ entityId: string; success: boolean; error?: string }> }> {
    const bulkResults = await executeBulkConcurrent(items, async (item) => {
      return this.updateEntity(entityType, accountId, item.entityId, item.data, context);
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
    accountId: string,
    entityIds: string[],
    status: string,
    context?: RequestContext
  ): Promise<{ results: Array<{ entityId: string; success: boolean; error?: string }> }> {
    const bulkResults = await executeBulkConcurrent(entityIds, async (entityId) => {
      return this.updateEntityStatus(entityType, accountId, entityId, status, context);
    });

    return {
      results: bulkResults.map((r, i) => ({
        entityId: entityIds[i],
        success: r.success,
        error: r.error,
      })),
    };
  }
}
