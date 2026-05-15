// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { TtdHttpClient } from "./ttd-http-client.js";
import type { RateLimiter } from "@cesteral/shared";
import { type RequestContext, executeBulkConcurrent } from "@cesteral/shared";
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
