// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { TtdHttpClient } from "./ttd-http-client.js";
import type { RateLimiter } from "../../utils/security/rate-limiter.js";
import type { RequestContext } from "@cesteral/shared";
import { McpError, JsonRpcErrorCode } from "../../utils/errors/index.js";
import { getEntityConfig, type TtdEntityType } from "../../mcp-server/tools/utils/entity-mapping.js";

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

  async listEntities(
    entityType: TtdEntityType,
    filters: Record<string, unknown>,
    pageToken?: string,
    pageSize?: number,
    context?: RequestContext
  ): Promise<{ entities: unknown[]; nextPageToken?: string }> {
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
      body.PartnerId = partnerId;
    }

    if (pageToken) {
      body.PageStartIndex = parseInt(pageToken, 10) || 0;
    }

    const result = (await this.httpClient.fetch(
      config.queryPath,
      context,
      {
        method: "POST",
        body: JSON.stringify(body),
      }
    )) as Record<string, unknown>;

    // TTD returns { Result: [...], TotalCount, ResultCount }
    const entities = (result.Result as unknown[]) || [];
    const totalCount = (result.TotalCount as number) || 0;
    const resultCount = (result.ResultCount as number) || 0;
    const startIndex = pageToken ? parseInt(pageToken, 10) || 0 : 0;
    const nextStartIndex = startIndex + resultCount;

    return {
      entities,
      nextPageToken: nextStartIndex < totalCount ? String(nextStartIndex) : undefined,
    };
  }

  async getEntity(
    entityType: TtdEntityType,
    entityId: string,
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);
    const partnerId = this.httpClient.partnerId;

    await this.rateLimiter.consume(`ttd:${partnerId}`);

    return this.httpClient.fetch(
      `${config.apiPath}/${entityId}`,
      context,
      { method: "GET" }
    );
  }

  async createEntity(
    entityType: TtdEntityType,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
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
    );
  }

  async updateEntity(
    entityType: TtdEntityType,
    entityId: string,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);
    const partnerId = this.httpClient.partnerId;

    await this.rateLimiter.consume(`ttd:${partnerId}`);

    // TTD PUT endpoints take no ID in URL; ID must be in the request body
    const payload = { [config.idField]: entityId, ...data };

    return this.httpClient.fetch(
      config.apiPath,
      context,
      {
        method: "PUT",
        body: JSON.stringify(payload),
      }
    );
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
        const payload = { [config.idField]: entityId, ...data };
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
    const results = await this.executeBulk(items, async (data) => {
      return this.createEntity(entityType, data, context);
    });
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
    const results = await this.executeBulk(items, async (item) => {
      return this.updateEntity(entityType, item.entityId, item.data, context);
    });
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
    const bulkResults = await this.executeBulk(entityIds, async (entityId) => {
      return this.updateAvailability(entityType, entityId, "Archived", context);
    });

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
    const bulkResults = await this.executeBulk(entityIds, async (entityId) => {
      return this.updateAvailability(entityType, entityId, status, context);
    });

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
    const getResults = await this.executeBulk(adjustments, async (adj) => {
      await this.rateLimiter.consume(`ttd:${partnerId}`);
      return this.httpClient.fetch(`${adGroupConfig.apiPath}/${adj.adGroupId}`, context, { method: "GET" });
    });

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
      const putResults = await this.executeBulk(putItems, async ({ adj, current }) => {
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
      });

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
    context?: RequestContext
  ): Promise<unknown> {
    const partnerId = this.httpClient.partnerId;
    await this.rateLimiter.consume(`ttd:${partnerId}`);

    // GraphQL lives on a different host (desk.thetradedesk.com) from the REST API
    return this.httpClient.fetchDirect(
      this.graphqlUrl,
      context,
      {
        method: "POST",
        body: JSON.stringify({ query, variables }),
      }
    );
  }

  // ─── Internal Helpers ─────────────────────────────────────────────

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