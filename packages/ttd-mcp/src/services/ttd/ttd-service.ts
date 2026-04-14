// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { TtdHttpClient } from "./ttd-http-client.js";
import type { RateLimiter } from "../../utils/security/rate-limiter.js";
import { type RequestContext, executeBulkConcurrent } from "@cesteral/shared";
import { McpError, JsonRpcErrorCode } from "../../utils/errors/index.js";
import { getEntityConfig, type TtdEntityType } from "../../mcp-server/tools/utils/entity-mapping.js";
import type {
  TtdAdvertiser,
  TtdCampaign,
  TtdAdGroup,
  TtdCreative,
  TtdConversionTracker,
} from "./types.js";

export type {
  TtdAdvertiser,
  TtdCampaign,
  TtdAdGroup,
  TtdCreative,
  TtdConversionTracker,
};

export interface WorkflowCallbackInput {
  callbackUrl: string;
  callbackHeaders?: Record<string, string> | null;
}

export interface RestRequestInput {
  methodType: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  endpoint: string | null;
  dataBody?: string | null;
}

export interface FirstPartyDataJobInput {
  advertiserId: string;
  nameFilter?: string | null;
  queryShape?: string | null;
  callbackInput?: WorkflowCallbackInput | null;
}

export interface ThirdPartyDataJobInput {
  partnerId: string;
  queryShape?: string | null;
  callbackInput?: WorkflowCallbackInput | null;
}

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

    body.PageStartIndex = pageToken ? (parseInt(pageToken, 10) || 0) : 0;

    const result = (await this.httpClient.fetch(
      config.queryPath,
      context,
      {
        method: "POST",
        body: JSON.stringify(body),
      }
    )) as Record<string, unknown>;

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

    return this.httpClient.fetch(
      `${config.apiPath}/${entityId}`,
      context,
      { method: "GET" }
    ) as Promise<TtdEntityMap[T]>;
  }

  async createEntity<T extends TtdEntityType>(
    entityType: T,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<TtdEntityMap[T]> {
    const config = getEntityConfig(entityType);
    const partnerId = this.httpClient.partnerId;

    await this.rateLimiter.consume(`ttd:${partnerId}`);

    return this.httpClient.fetch(
      config.apiPath,
      context,
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    ) as Promise<TtdEntityMap[T]>;
  }

  async updateEntity<T extends TtdEntityType>(
    entityType: T,
    entityId: string,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<TtdEntityMap[T]> {
    const config = getEntityConfig(entityType);
    const partnerId = this.httpClient.partnerId;

    await this.rateLimiter.consume(`ttd:${partnerId}`);

    // TTD PUT endpoints take no ID in URL; ID must be in the request body
    const payload = { ...data, [config.idField]: entityId };

    return this.httpClient.fetch(
      config.apiPath,
      context,
      {
        method: "PUT",
        body: JSON.stringify(payload),
      }
    ) as Promise<TtdEntityMap[T]>;
  }

  async deleteEntity(
    entityType: TtdEntityType,
    entityId: string,
    context?: RequestContext
  ): Promise<void> {
    const config = getEntityConfig(entityType);
    const partnerId = this.httpClient.partnerId;

    await this.rateLimiter.consume(`ttd:${partnerId}`);

    await this.httpClient.fetch(
      `${config.apiPath}/${entityId}`,
      context,
      { method: "DELETE" }
    );
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
        await this.httpClient.fetch(
          config.apiPath,
          context,
          { method: "PUT", body: JSON.stringify(payload) }
        );
      } else {
        await this.httpClient.fetch(
          config.apiPath,
          context,
          { method: "POST", body: JSON.stringify(data) }
        );
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
        const errorBody = (error.data as { errorBody?: string } | undefined)?.errorBody ?? errorMessage;
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
    const results = await executeBulkConcurrent(items, async (data) => {
      return this.createEntity(entityType, data, context);
    }, { logger: this.logger });
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
    const results = await executeBulkConcurrent(items, async (item) => {
      return this.updateEntity(entityType, item.entityId, item.data, context);
    }, { logger: this.logger });
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
    const bulkResults = await executeBulkConcurrent(entityIds, async (entityId) => {
      return this.updateAvailability(entityType, entityId, "Archived", context);
    }, { logger: this.logger });

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
    const bulkResults = await executeBulkConcurrent(entityIds, async (entityId) => {
      return this.updateAvailability(entityType, entityId, status, context);
    }, { logger: this.logger });

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

    // GET current entity (full payload)
    const current = (await this.httpClient.fetch(
      `${config.apiPath}/${entityId}`,
      context,
      { method: "GET" }
    )) as Record<string, unknown>;

    // Set Availability on the full entity
    current.Availability = availability;

    // PUT full entity back (no ID in URL, ID already in body)
    await this.rateLimiter.consume(`ttd:${partnerId}`);
    return this.httpClient.fetch(
      config.apiPath,
      context,
      {
        method: "PUT",
        body: JSON.stringify(current),
      }
    );
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
  ): Promise<{ results: Array<{ adGroupId: string; success: boolean; entity?: unknown; error?: string }> }> {
    const partnerId = this.httpClient.partnerId;

    const adGroupConfig = getEntityConfig("adGroup");

    // Phase 1: Fetch all current ad group entities in parallel (concurrency=5)
    const getResults = await executeBulkConcurrent(adjustments, async (adj) => {
      await this.rateLimiter.consume(`ttd:${partnerId}`);
      return this.httpClient.fetch(`${adGroupConfig.apiPath}/${adj.adGroupId}`, context, { method: "GET" });
    }, { logger: this.logger });

    // Separate successful GETs from failed ones; build PUT inputs for successes
    type PutItem = {
      adj: (typeof adjustments)[number];
      current: Record<string, unknown>;
    };
    const putItems: PutItem[] = [];
    const putIndexMap: number[] = []; // maps putItems index → adjustments index

    const results: Array<{ adGroupId: string; success: boolean; entity?: unknown; error?: string }> =
      new Array(adjustments.length);

    for (let i = 0; i < getResults.length; i++) {
      const getResult = getResults[i];
      const adj = adjustments[i];
      if (!getResult.success) {
        results[i] = { adGroupId: adj.adGroupId, success: false, error: getResult.error };
      } else {
        putItems.push({ adj, current: getResult.entity as Record<string, unknown> });
        putIndexMap.push(i);
      }
    }

    // Phase 2: Apply bid adjustments and PUT all entities in parallel (concurrency=5)
    if (putItems.length > 0) {
      const putResults = await executeBulkConcurrent(putItems, async ({ adj, current }) => {
        const rtb = (current.RTBAttributes as Record<string, unknown>) || {};
        const cc = adj.currencyCode || "USD";

        if (adj.baseBidCpm !== undefined) {
          rtb.BaseBidCPM = { Amount: adj.baseBidCpm, CurrencyCode: cc };
        }
        if (adj.maxBidCpm !== undefined) {
          rtb.MaxBidCPM = { Amount: adj.maxBidCpm, CurrencyCode: cc };
        }

        // TTD PUT endpoints take no ID in URL; full entity with ID in body
        await this.rateLimiter.consume(`ttd:${partnerId}`);
        return this.httpClient.fetch(adGroupConfig.apiPath, context, {
          method: "PUT",
          body: JSON.stringify({ ...current, RTBAttributes: rtb }),
        });
      }, { logger: this.logger });

      // Map PUT results back to the original adjustments index, preserving adGroupId
      for (let k = 0; k < putResults.length; k++) {
        const origIndex = putIndexMap[k];
        const adGroupId = adjustments[origIndex].adGroupId;
        const putResult = putResults[k];
        results[origIndex] = { adGroupId, success: putResult.success, entity: putResult.entity, error: putResult.error };
      }
    }

    return { results };
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
    return this.httpClient.fetchDirect(
      this.graphqlUrl,
      context,
      {
        method: "POST",
        headers: options?.betaFeatures
          ? { "TTD-GQL-Beta": options.betaFeatures }
          : undefined,
        body: JSON.stringify({ query, variables }),
      }
    );
  }

  // ─── Workflows / Standard Jobs ───────────────────────────────────

  async restRequest(
    input: RestRequestInput,
    context?: RequestContext
  ): Promise<unknown> {
    const partnerId = this.httpClient.partnerId;
    await this.rateLimiter.consume(`ttd:${partnerId}`);

    return this.httpClient.fetch("/restrequest", context, {
      method: "POST",
      body: JSON.stringify({
        methodType: input.methodType,
        endpoint: input.endpoint,
        ...(input.dataBody !== undefined ? { dataBody: input.dataBody } : {}),
      }),
    });
  }

  async getJobStatus(
    jobId: number,
    context?: RequestContext
  ): Promise<unknown> {
    const partnerId = this.httpClient.partnerId;
    await this.rateLimiter.consume(`ttd:${partnerId}`);

    return this.httpClient.fetch(`/standardjob/${jobId}/status`, context, {
      method: "GET",
    });
  }

  async getFirstPartyDataJob(
    input: FirstPartyDataJobInput,
    context?: RequestContext
  ): Promise<unknown> {
    const partnerId = this.httpClient.partnerId;
    await this.rateLimiter.consume(`ttd:${partnerId}`);

    return this.httpClient.fetch("/standardjob/firstpartydata", context, {
      method: "POST",
      body: JSON.stringify({
        advertiserId: input.advertiserId,
        ...(input.nameFilter !== undefined ? { nameFilter: input.nameFilter } : {}),
        ...(input.queryShape !== undefined ? { queryShape: input.queryShape } : {}),
        ...(input.callbackInput ? { callbackInput: input.callbackInput } : {}),
      }),
    });
  }

  async getThirdPartyDataJob(
    input: ThirdPartyDataJobInput,
    context?: RequestContext
  ): Promise<unknown> {
    const partnerId = this.httpClient.partnerId;
    await this.rateLimiter.consume(`ttd:${partnerId}`);

    return this.httpClient.fetch("/standardjob/thirdpartydata", context, {
      method: "POST",
      body: JSON.stringify({
        partnerId: input.partnerId,
        ...(input.queryShape !== undefined ? { queryShape: input.queryShape } : {}),
        ...(input.callbackInput ? { callbackInput: input.callbackInput } : {}),
      }),
    });
  }

  async getCampaignVersion(
    campaignId: string,
    context?: RequestContext
  ): Promise<unknown> {
    const partnerId = this.httpClient.partnerId;
    await this.rateLimiter.consume(`ttd:${partnerId}`);

    return this.httpClient.fetch(`/campaign/${campaignId}/version`, context, {
      method: "GET",
    });
  }

  async createCampaignWorkflow(
    input: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    return this.postWorkflow("/campaign", input, context);
  }

  async updateCampaignWorkflow(
    input: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    return this.patchWorkflow("/campaign", input, context);
  }

  async createCampaignsJob(
    input: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    return this.postWorkflow("/standardjob/campaign/bulk", input, context);
  }

  async updateCampaignsJob(
    input: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    return this.patchWorkflow("/standardjob/campaign/bulk", input, context);
  }

  async createAdGroupWorkflow(
    input: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    return this.postWorkflow("/adgroup", input, context);
  }

  async updateAdGroupWorkflow(
    input: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    return this.patchWorkflow("/adgroup", input, context);
  }

  async createAdGroupsJob(
    input: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    return this.postWorkflow("/standardjob/adgroup/bulk", input, context);
  }

  async updateAdGroupsJob(
    input: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    return this.patchWorkflow("/standardjob/adgroup/bulk", input, context);
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

  // ─── Bid List CRUD ────────────────────────────────────────────────

  async createBidList(data: Record<string, unknown>, context?: RequestContext): Promise<Record<string, unknown>> {
    const partnerId = this.httpClient.partnerId;
    await this.rateLimiter.consume(`ttd:${partnerId}`);
    return this.httpClient.fetch("/bidlist", context, {
      method: "POST",
      body: JSON.stringify(data),
    }) as Promise<Record<string, unknown>>;
  }

  async getBidList(bidListId: string, context?: RequestContext): Promise<Record<string, unknown>> {
    const partnerId = this.httpClient.partnerId;
    await this.rateLimiter.consume(`ttd:${partnerId}`);
    return this.httpClient.fetch(`/bidlist/${bidListId}`, context, {
      method: "GET",
    }) as Promise<Record<string, unknown>>;
  }

  async updateBidList(data: Record<string, unknown>, context?: RequestContext): Promise<Record<string, unknown>> {
    const partnerId = this.httpClient.partnerId;
    await this.rateLimiter.consume(`ttd:${partnerId}`);
    return this.httpClient.fetch("/bidlist", context, {
      method: "PUT",
      body: JSON.stringify(data),
    }) as Promise<Record<string, unknown>>;
  }

  async batchGetBidLists(bidListIds: string[], context?: RequestContext): Promise<Record<string, unknown>[]> {
    const partnerId = this.httpClient.partnerId;
    await this.rateLimiter.consume(`ttd:${partnerId}`);
    return this.httpClient.fetch("/bidlist/batch/get", context, {
      method: "POST",
      body: JSON.stringify({ BidListIds: bidListIds }),
    }) as Promise<Record<string, unknown>[]>;
  }

  async batchUpdateBidLists(items: Record<string, unknown>[], context?: RequestContext): Promise<Record<string, unknown>[]> {
    const partnerId = this.httpClient.partnerId;
    await this.rateLimiter.consume(`ttd:${partnerId}`);
    return this.httpClient.fetch("/bidlist/batch", context, {
      method: "PUT",
      body: JSON.stringify(items),
    }) as Promise<Record<string, unknown>[]>;
  }

  // ─── Internal Helpers ─────────────────────────────────────────────

  private async postWorkflow(
    path: string,
    input: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    const partnerId = this.httpClient.partnerId;
    await this.rateLimiter.consume(`ttd:${partnerId}`);

    return this.httpClient.fetch(path, context, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  private async patchWorkflow(
    path: string,
    input: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    const partnerId = this.httpClient.partnerId;
    await this.rateLimiter.consume(`ttd:${partnerId}`);

    return this.httpClient.fetch(path, context, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

}
