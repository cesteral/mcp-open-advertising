// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { TtdHttpClient } from "./ttd-http-client.js";
import type { RateLimiter } from "@cesteral/shared";
import { type RequestContext, executeBulkConcurrent, fetchWithTimeout } from "@cesteral/shared";
import { McpError, JsonRpcErrorCode } from "@cesteral/shared";
import {
  getEntityConfig,
  type TtdEntityType,
} from "../../mcp-server/tools/utils/entity-mapping.js";
import type {
  TtdAdvertiser,
  TtdCampaign,
  TtdAdGroup,
  TtdCreative,
  TtdConversionTracker,
} from "./types.js";

export type { TtdAdvertiser, TtdCampaign, TtdAdGroup, TtdCreative, TtdConversionTracker };

interface GraphqlQueryOptions {
  betaFeatures?: string;
}

interface TtdEntityMap {
  advertiser: TtdAdvertiser;
  campaign: TtdCampaign;
  adGroup: TtdAdGroup;
  creative: TtdCreative;
  conversionTracker: TtdConversionTracker;
}

/**
 * TTD Service — Generic CRUD operations for TTD entities,
 * plus bulk operations, archive, GraphQL passthrough, and validate-only mode.
 *
 * Uses entity-mapping.ts for path construction and the TtdHttpClient
 * for authenticated HTTP calls with retry logic.
 */
export class TtdService {
  constructor(
    private readonly logger: Logger,
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: TtdHttpClient,
    private readonly graphqlUrl: string = "https://desk.thetradedesk.com/graphql"
  ) {}

  // ─── Standard CRUD ─────────────────────────────────────────────────

  async listEntities<T extends TtdEntityType>(
    entityType: T,
    filters: Record<string, unknown>,
    pageToken?: string,
    pageSize?: number,
    context?: RequestContext
  ): Promise<{ entities: TtdEntityMap[T][]; nextPageToken?: string }> {
    const config = getEntityConfig(entityType);
    const partnerId = this.httpClient.partnerId;

    await this.rateLimiter.consume(`ttd:${partnerId}`);

    this.logger.debug({ entityType, partnerId }, "Listing TTD entities");

    // TTD v3 uses POST for queries/list operations
    const body: Record<string, unknown> = {
      ...filters,
      PageSize: pageSize || 25,
    };

    if (entityType === "advertiser") {
      if (typeof body.PartnerId !== "string" || body.PartnerId.trim().length === 0) {
        throw new McpError(
          JsonRpcErrorCode.InvalidParams,
          "partnerId is required when listing advertiser entities"
        );
      }
    }

    body.PageStartIndex = pageToken ? parseInt(pageToken, 10) || 0 : 0;

    const result = (await this.httpClient.fetch(config.queryPath, context, {
      method: "POST",
      body: JSON.stringify(body),
    })) as Record<string, unknown>;

    // TTD returns { Result: [...], TotalCount, ResultCount }
    const entities = ((result.Result as unknown[]) || []) as TtdEntityMap[T][];
    const totalCount = (result.TotalCount as number) || 0;
    const resultCount = (result.ResultCount as number) || 0;
    const startIndex = pageToken ? parseInt(pageToken, 10) || 0 : 0;
    const nextStartIndex = startIndex + resultCount;

    return {
      entities,
      nextPageToken: nextStartIndex < totalCount ? String(nextStartIndex) : undefined,
    };
  }

  async getEntity<T extends TtdEntityType>(
    entityType: T,
    entityId: string,
    context?: RequestContext
  ): Promise<TtdEntityMap[T]> {
    const config = getEntityConfig(entityType);
    const partnerId = this.httpClient.partnerId;

    await this.rateLimiter.consume(`ttd:${partnerId}`);

    return this.httpClient.fetch(`${config.apiPath}/${entityId}`, context, {
      method: "GET",
    }) as Promise<TtdEntityMap[T]>;
  }

  async createEntity<T extends TtdEntityType>(
    entityType: T,
    data: Record<string, unknown>,
    context?: RequestContext,
    options?: { strictMode?: boolean }
  ): Promise<TtdEntityMap[T]> {
    const config = getEntityConfig(entityType);
    const partnerId = this.httpClient.partnerId;

    await this.rateLimiter.consume(`ttd:${partnerId}`);

    return this.httpClient.fetch(config.apiPath, context, {
      method: "POST",
      body: JSON.stringify(data),
      ...(options?.strictMode ? { headers: { "TTD-Strict-Mode": "true" } } : {}),
    }) as Promise<TtdEntityMap[T]>;
  }

  // ─── Hosted Video Creative Upload ─────────────────────────────────
  //
  // TTD CAN host video creatives (they need not be third-party VAST-hosted).
  // The documented flow is three steps (repo docs:
  // packages/ttd-mcp/docs/api/ttd-api-reference-part2.md:641 —
  // "Generates a URL for uploading video files. The returned upload attributes
  // must be included in the subsequent POST creative call"):
  //   1. POST /v3/creative/generateuploadurlforvideocreative → presigned URL + attributes
  //   2. PUT the raw video bytes to the presigned URL (no TTD auth — it is a
  //      self-authenticating storage URL)
  //   3. POST /v3/creative with CreativeType "Video" + the returned upload attributes
  //
  // VERIFICATION NOTE: the exact JSON field names in the step-1 response are not
  // documented in the repo and TTD's Partner Portal reference is auth-walled, so
  // step 1's response is parsed defensively (`extractVideoUploadUrl`): the
  // presigned URL is the first https-valued string field, and every other field
  // is forwarded verbatim into the create body as TTD's required "upload
  // attributes". This is robust to the precise field casing; if TTD nests the
  // attributes under a single key, forwarding the whole object still satisfies
  // "include the returned attributes in the POST creative call".

  /**
   * Upload a video file to TTD and create a hosted video creative.
   *
   * `creativeFields` carries the standard POST /v3/creative fields (CreativeName,
   * Width, Height, AdvertiserId is passed separately, AdFormatId/ClickThroughUrl
   * optional). CreativeType is forced to "Video".
   */
  async uploadVideoCreative(
    advertiserId: string,
    fileName: string,
    buffer: Buffer,
    contentType: string,
    creativeFields: Record<string, unknown>,
    context?: RequestContext
  ): Promise<TtdCreative> {
    const partnerId = this.httpClient.partnerId;
    await this.rateLimiter.consume(`ttd:${partnerId}`);

    // Step 1 — presigned upload URL + attributes to echo back on create.
    const genResponse = (await this.httpClient.fetch(
      "/creative/generateuploadurlforvideocreative",
      context,
      {
        method: "POST",
        body: JSON.stringify({ FileName: fileName, AdvertiserId: advertiserId }),
      }
    )) as Record<string, unknown>;

    const { uploadUrl, uploadAttributes } = extractVideoUploadUrl(genResponse);

    // Step 2 — PUT the bytes to the presigned URL. No TTD-Auth header: presigned
    // storage URLs carry their own signature and reject extra auth. `fetchDirect`
    // would inject TTD-Auth, so use the bare timeout-guarded fetch instead.
    const putResponse = await fetchWithTimeout(uploadUrl, 300_000, context, {
      method: "PUT",
      body: buffer,
      headers: { "Content-Type": contentType },
    });
    if (!putResponse.ok) {
      const errBody = await putResponse.text().catch(() => "");
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        `TTD video upload failed: PUT to presigned URL returned HTTP ${putResponse.status}. ${errBody.substring(0, 200)}`
      );
    }

    // Step 3 — create the hosted video creative referencing the uploaded file.
    const body: Record<string, unknown> = {
      ...uploadAttributes,
      ...creativeFields,
      AdvertiserId: advertiserId,
      CreativeType: "Video",
    };
    return this.httpClient.fetch("/creative", context, {
      method: "POST",
      body: JSON.stringify(body),
    }) as Promise<TtdCreative>;
  }

  /**
   * Duplicate an entity via the client-side read+create clone pattern (TTD has
   * no native copy endpoint). Reads the source, strips server-managed fields
   * (the id + audit timestamps), then creates a fresh copy. The source's own
   * `AdvertiserId` rides along in the body, so no extra parent ID is needed.
   * Only entity types flagged `supportsDuplicate` (campaign) are allowed.
   */
  async duplicateEntity<T extends TtdEntityType>(
    entityType: T,
    entityId: string,
    options?: Record<string, unknown>,
    context?: RequestContext
  ): Promise<TtdEntityMap[T]> {
    const config = getEntityConfig(entityType);
    if (!config.supportsDuplicate) {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `Entity type ${entityType} does not support duplication`
      );
    }

    const source = (await this.getEntity(entityType, entityId, context)) as unknown as Record<
      string,
      unknown
    >;

    // Server-managed fields the create endpoint rejects or reassigns.
    const SYSTEM_FIELDS = [config.idField, "CreatedAtUTC", "LastModifiedAtUTC", "Version"] as const;
    const body: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(source)) {
      if (!(SYSTEM_FIELDS as readonly string[]).includes(key)) {
        body[key] = val;
      }
    }
    // Caller overrides (e.g. a new CampaignName) win over the copied fields.
    if (options) Object.assign(body, options);

    return this.createEntity(entityType, body, context);
  }

  async updateEntity<T extends TtdEntityType>(
    entityType: T,
    entityId: string,
    data: Record<string, unknown>,
    context?: RequestContext,
    options?: { strictMode?: boolean }
  ): Promise<TtdEntityMap[T]> {
    const config = getEntityConfig(entityType);
    const partnerId = this.httpClient.partnerId;

    await this.rateLimiter.consume(`ttd:${partnerId}`);

    // TTD PUT endpoints take no ID in URL; ID must be in the request body
    const payload = { ...data, [config.idField]: entityId };

    return this.httpClient.fetch(config.apiPath, context, {
      method: "PUT",
      body: JSON.stringify(payload),
      ...(options?.strictMode ? { headers: { "TTD-Strict-Mode": "true" } } : {}),
    }) as Promise<TtdEntityMap[T]>;
  }

  async deleteEntity(
    entityType: TtdEntityType,
    entityId: string,
    context?: RequestContext
  ): Promise<void> {
    // TTD's Platform API does not expose REST DELETE for advertiser, campaign,
    // adGroup, creative, or conversionTracker (returns 405 Method Not Allowed).
    // The platform's data model uses Availability="Archived" as soft-delete —
    // this is TTD's documented end-state for retired entities. We delegate to
    // updateAvailability so callers get the semantic they expect without a 405.
    await this.updateAvailability(entityType, entityId, "Archived", context);
  }

  // ─── Validate-Only (Dry Run) ──────────────────────────────────────

  /**
   * Test an entity payload against the TTD API.
   *
   * WARNING: TTD has no dry-run mode. A successful create-mode call
   * CREATES a real entity; a successful update-mode call UPDATES it.
   * Use this primarily to diagnose validation failures (400 errors).
   */
  async testCreateOrUpdate(
    entityType: TtdEntityType,
    data: Record<string, unknown>,
    mode: "create" | "update",
    entityId?: string,
    context?: RequestContext
  ): Promise<{ valid: boolean; errors?: string[] }> {
    const config = getEntityConfig(entityType);
    const partnerId = this.httpClient.partnerId;

    await this.rateLimiter.consume(`ttd:${partnerId}`);

    try {
      if (mode === "update" && entityId) {
        // TTD PUT endpoints take no ID in URL; ID must be in the request body
        const payload = { ...data, [config.idField]: entityId };
        await this.httpClient.fetch(config.apiPath, context, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await this.httpClient.fetch(config.apiPath, context, {
          method: "POST",
          body: JSON.stringify(data),
        });
      }
      return { valid: true };
    } catch (error: unknown) {
      // Only treat client-error McpErrors as validation results.
      // Re-throw network, auth, rate-limit, and 5xx errors.
      const CLIENT_ERROR_CODES = new Set([
        JsonRpcErrorCode.InvalidRequest,
        JsonRpcErrorCode.InvalidParams,
        JsonRpcErrorCode.NotFound,
      ]);
      if (error instanceof McpError && CLIENT_ERROR_CODES.has(error.code)) {
        const errorMessage = error.message ?? String(error);
        const errorBody =
          (error.data as { errorBody?: string } | undefined)?.errorBody ?? errorMessage;
        return { valid: false, errors: [errorBody] };
      }
      throw error;
    }
  }

  // ─── Bulk Operations ──────────────────────────────────────────────

  /**
   * Bulk create entities of the same type.
   * Sends individual create calls in parallel (concurrency-limited).
   */
  async bulkCreateEntities(
    entityType: TtdEntityType,
    items: Record<string, unknown>[],
    context?: RequestContext
  ): Promise<{ results: Array<{ success: boolean; entity?: unknown; error?: string }> }> {
    const results = await executeBulkConcurrent(
      items,
      async (data) => {
        return this.createEntity(entityType, data, context);
      },
      { logger: this.logger }
    );
    return { results };
  }

  /**
   * Bulk update entities of the same type.
   * Each item must include the entity ID in its data payload.
   */
  async bulkUpdateEntities(
    entityType: TtdEntityType,
    items: Array<{ entityId: string; data: Record<string, unknown> }>,
    context?: RequestContext
  ): Promise<{ results: Array<{ success: boolean; entity?: unknown; error?: string }> }> {
    const results = await executeBulkConcurrent(
      items,
      async (item) => {
        return this.updateEntity(entityType, item.entityId, item.data, context);
      },
      { logger: this.logger }
    );
    return { results };
  }

  // ─── Archive (Batch Soft-Delete) ──────────────────────────────────

  /**
   * Archive multiple entities by setting Availability to "Archived".
   * Uses read-modify-write: GET full entity, set Availability, PUT full entity back.
   */
  async archiveEntities(
    entityType: TtdEntityType,
    entityIds: string[],
    context?: RequestContext
  ): Promise<{ results: Array<{ entityId: string; success: boolean; error?: string }> }> {
    const bulkResults = await executeBulkConcurrent(
      entityIds,
      async (entityId) => {
        return this.updateAvailability(entityType, entityId, "Archived", context);
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

  // ─── Bulk Status Update ───────────────────────────────────────────

  /**
   * Batch update availability status for multiple entities of the same type.
   * Uses read-modify-write: GET full entity, set Availability, PUT full entity back.
   */
  async bulkUpdateStatus(
    entityType: TtdEntityType,
    entityIds: string[],
    status: "Available" | "Paused" | "Archived",
    context?: RequestContext
  ): Promise<{ results: Array<{ entityId: string; success: boolean; error?: string }> }> {
    const bulkResults = await executeBulkConcurrent(
      entityIds,
      async (entityId) => {
        return this.updateAvailability(entityType, entityId, status, context);
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

  /**
   * Read-modify-write helper: GET entity, set Availability, PUT full entity back.
   * TTD uses full-replacement PUT semantics, so sending only { Availability } would
   * reset all other fields. This pattern preserves the full entity payload.
   */
  private async updateAvailability(
    entityType: TtdEntityType,
    entityId: string,
    availability: string,
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);
    const partnerId = this.httpClient.partnerId;

    await this.rateLimiter.consume(`ttd:${partnerId}`);

    // Partial PUT — only the ID + Availability field. Per TTD Foundations §8
    // best practices: "avoid copying GET payloads to PUT requests" — round-tripping
    // the full entity is fragile (TTD deprecates fields silently and rejects them
    // on PUT, e.g. 410 Gone for CtvTargetingAndAttribution). Single-call write is
    // also half the API budget.
    return this.httpClient.fetch(config.apiPath, context, {
      method: "PUT",
      body: JSON.stringify({ [config.idField]: entityId, Availability: availability }),
    });
  }

  // ─── Bid Adjustment ───────────────────────────────────────────────

  /**
   * Batch adjust bids for multiple ad groups.
   */
  async adjustBids(
    adjustments: Array<{
      adGroupId: string;
      baseBidCpm?: number;
      maxBidCpm?: number;
      currencyCode?: string;
    }>,
    context?: RequestContext
  ): Promise<{
    results: Array<{ adGroupId: string; success: boolean; entity?: unknown; error?: string }>;
  }> {
    const partnerId = this.httpClient.partnerId;
    const adGroupConfig = getEntityConfig("adGroup");

    // Partial PUTs only. Round-tripping the full entity is fragile under TTD —
    // deprecated fields (e.g. AdBrainHouseholdCrossDeviceEnabled, retired
    // 2026-01-12) come back from GET but TTD rejects them on PUT with 410 Gone.
    // Per TTD Foundations §8: "avoid copying GET payloads to PUT requests".
    // Sending only {AdGroupId, RTBAttributes:{BaseBidCPM, MaxBidCPM}} also
    // halves the API budget per adjustment.
    const putResults = await executeBulkConcurrent(
      adjustments,
      async (adj) => {
        const cc = adj.currencyCode || "USD";
        const rtb: Record<string, unknown> = {};
        if (adj.baseBidCpm !== undefined)
          rtb.BaseBidCPM = { Amount: adj.baseBidCpm, CurrencyCode: cc };
        if (adj.maxBidCpm !== undefined)
          rtb.MaxBidCPM = { Amount: adj.maxBidCpm, CurrencyCode: cc };

        await this.rateLimiter.consume(`ttd:${partnerId}`);
        return this.httpClient.fetch(adGroupConfig.apiPath, context, {
          method: "PUT",
          body: JSON.stringify({ AdGroupId: adj.adGroupId, RTBAttributes: rtb }),
        });
      },
      { logger: this.logger }
    );

    return {
      results: putResults.map((r, i) => ({
        adGroupId: adjustments[i].adGroupId,
        success: r.success,
        entity: r.entity,
        error: r.error,
      })),
    };
  }

  // ─── GraphQL Passthrough ──────────────────────────────────────────

  /**
   * Execute a GraphQL query or mutation against the TTD GraphQL API.
   *
   * This is a passthrough to the TTD GraphQL endpoint, enabling
   * rich nested queries and mutations not available in the REST API.
   */
  async graphqlQuery(
    query: string,
    variables?: Record<string, unknown>,
    context?: RequestContext,
    options?: GraphqlQueryOptions
  ): Promise<unknown> {
    const partnerId = this.httpClient.partnerId;
    await this.rateLimiter.consume(`ttd:${partnerId}`);

    // GraphQL lives on a different host (desk.thetradedesk.com) from the REST API
    return this.httpClient.fetchDirect(this.graphqlUrl, context, {
      method: "POST",
      headers: options?.betaFeatures ? { "TTD-GQL-Beta": options.betaFeatures } : undefined,
      body: JSON.stringify({ query, variables }),
    });
  }

  /**
   * Execute an immediate dimension-specific entity report via GraphQL.
   * Returns a download URL directly — no polling required.
   */
  async executeEntityReport(
    entityType: "adGroup" | "campaign" | "advertiser",
    entityId: string,
    reportType: string,
    context?: RequestContext
  ): Promise<unknown> {
    const partnerId = this.httpClient.partnerId;
    await this.rateLimiter.consume(`ttd:${partnerId}`);

    const mutationMap = {
      adGroup: { name: "adGroupReportExecute", typeEnum: "AdGroupReportType" },
      campaign: { name: "campaignReportExecute", typeEnum: "CampaignReportType" },
      advertiser: { name: "advertiserReportExecute", typeEnum: "AdvertiserReportType" },
    } as const;
    const { name, typeEnum } = mutationMap[entityType];
    if (!/^[A-Z][A-Z0-9_]*$/.test(reportType)) {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `reportType must be a valid ${typeEnum} enum value. Use ttd_get_entity_report_types to discover supported values for this entity.`
      );
    }

    const query = `
      mutation($entityId: ID!) {
        ${name}(input: { id: $entityId, report: ${reportType} }) {
          data { id url hasSampleData }
          userErrors { field message }
        }
      }
    `;
    return this.httpClient.fetchDirect(this.graphqlUrl, context, {
      method: "POST",
      body: JSON.stringify({ query, variables: { entityId } }),
    });
  }

  /**
   * Query available report types for an entity via GraphQL.
   * The `tile` parameter is the Kokai tile abbreviation from the TTD UI (e.g. Ag, Ca, Af).
   */
  async getEntityReportMetadata(
    entityType: "adGroup" | "campaign" | "advertiser",
    entityId: string,
    tile: string,
    context?: RequestContext
  ): Promise<unknown> {
    const partnerId = this.httpClient.partnerId;
    await this.rateLimiter.consume(`ttd:${partnerId}`);

    const variables: Record<string, string> = { tile };
    if (entityType === "adGroup") variables.adGroupId = entityId;
    else if (entityType === "campaign") variables.campaignId = entityId;
    else variables.advertiserId = entityId;

    const query = `
      query($adGroupId: ID, $campaignId: ID, $advertiserId: ID, $tile: ID!) {
        programmaticTileReportMetadata(input: {
          adGroupId: $adGroupId
          campaignId: $campaignId
          advertiserId: $advertiserId
          tile: $tile
        }) {
          data { available schedule type }
          userErrors { field message }
        }
      }
    `;
    return this.httpClient.fetchDirect(this.graphqlUrl, context, {
      method: "POST",
      body: JSON.stringify({ query, variables }),
    });
  }

  // ─── Bid Lists (GraphQL) ──────────────────────────────────────────
  //
  // All `/v3/bidlist*` REST endpoints are deprecated per TTD docs
  // (docs/api/ttd-api-reference-part2.md:176-200). These methods route to
  // the documented replacements: `bidList` query + `bidListCreate` /
  // `bidListUpdate` / `bidListSet` / `bidListDelete` mutations.
  //
  // The query selection is intentionally narrow (`id name`) so callers can
  // extend it via the `selection` parameter when they need richer payloads.

  private async bidListGraphql(
    body: { query: string; variables: Record<string, unknown> },
    context?: RequestContext
  ): Promise<unknown> {
    const partnerId = this.httpClient.partnerId;
    await this.rateLimiter.consume(`ttd:${partnerId}`);
    return this.httpClient.fetchDirect(this.graphqlUrl, context, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async createBidList(
    input: Record<string, unknown>,
    context?: RequestContext,
    selection = "id name"
  ): Promise<unknown> {
    const query = `mutation BidListCreate($input: BidListCreateInput!) {
      bidListCreate(input: $input) {
        data { ${selection} }
      }
    }`;
    return this.bidListGraphql({ query, variables: { input } }, context);
  }

  async getBidList(
    bidListId: string,
    context?: RequestContext,
    selection = "id name"
  ): Promise<unknown> {
    const query = `query BidListGet($id: ID!) {
      bidList(id: $id) { ${selection} }
    }`;
    return this.bidListGraphql({ query, variables: { id: bidListId } }, context);
  }

  /**
   * `bidListUpdate` — add and/or remove specific lines without restating the entire list.
   * Use this when you know the deltas (per TTD: "set lines to add and lines to remove").
   */
  async updateBidList(
    input: Record<string, unknown>,
    context?: RequestContext,
    selection = "id name"
  ): Promise<unknown> {
    const query = `mutation BidListUpdate($input: BidListUpdateInput!) {
      bidListUpdate(input: $input) {
        data { ${selection} }
      }
    }`;
    return this.bidListGraphql({ query, variables: { input } }, context);
  }

  /**
   * `bidListSet` — replace ALL lines with the supplied set (atomic full-replace).
   */
  async setBidList(
    input: Record<string, unknown>,
    context?: RequestContext,
    selection = "id name"
  ): Promise<unknown> {
    const query = `mutation BidListSet($input: BidListSetInput!) {
      bidListSet(input: $input) {
        data { ${selection} }
      }
    }`;
    return this.bidListGraphql({ query, variables: { input } }, context);
  }

  async deleteBidList(input: Record<string, unknown>, context?: RequestContext): Promise<unknown> {
    // BidListDeletePayload only exposes __typename — TTD returns the payload
    // type as a 200-OK confirmation that the deletion was processed.
    const query = `mutation BidListDelete($input: BidListDeleteInput!) {
      bidListDelete(input: $input) {
        __typename
      }
    }`;
    return this.bidListGraphql({ query, variables: { input } }, context);
  }

  /**
   * Batch get: fans out `bidList(id:)` queries in parallel.
   * (TTD's GraphQL has no native multi-id bidList query.)
   */
  async batchGetBidLists(
    bidListIds: string[],
    context?: RequestContext,
    selection = "id name"
  ): Promise<Array<{ bidListId: string; success: boolean; data?: unknown; error?: string }>> {
    const results = await executeBulkConcurrent(
      bidListIds,
      async (id) => this.getBidList(id, context, selection),
      { logger: this.logger }
    );
    return results.map((r, i) => ({
      bidListId: bidListIds[i],
      success: r.success,
      data: r.entity,
      error: r.error,
    }));
  }

  /**
   * Batch update: fans out `bidListUpdate` mutations in parallel.
   * Each item must be a complete `BidListUpdateInput` (TTD's GraphQL has no
   * native multi-input update for bid lists).
   */
  async batchUpdateBidLists(
    items: Record<string, unknown>[],
    context?: RequestContext,
    selection = "id name"
  ): Promise<Array<{ index: number; success: boolean; data?: unknown; error?: string }>> {
    const results = await executeBulkConcurrent(
      items,
      async (input) => this.updateBidList(input, context, selection),
      { logger: this.logger }
    );
    return results.map((r, i) => ({
      index: i,
      success: r.success,
      data: r.entity,
      error: r.error,
    }));
  }
}

/**
 * Parse the `generateuploadurlforvideocreative` response into the presigned
 * upload URL plus the "upload attributes" that must be echoed back on the
 * create call. TTD's exact field casing is not documented in the repo, so:
 *   - the upload URL is the first field whose value is an http(s) string;
 *   - all remaining fields are forwarded verbatim as upload attributes.
 * Throws if no upload URL is present (an unexpected/failed response).
 */
export function extractVideoUploadUrl(response: Record<string, unknown>): {
  uploadUrl: string;
  uploadAttributes: Record<string, unknown>;
} {
  let uploadUrl: string | undefined;
  const uploadAttributes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(response ?? {})) {
    if (uploadUrl === undefined && typeof value === "string" && /^https?:\/\//i.test(value)) {
      uploadUrl = value;
      continue;
    }
    uploadAttributes[key] = value;
  }
  if (!uploadUrl) {
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      "TTD did not return a presigned upload URL from generateuploadurlforvideocreative"
    );
  }
  return { uploadUrl, uploadAttributes };
}
