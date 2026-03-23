// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { RateLimiter } from "@cesteral/shared";
import { McpError, JsonRpcErrorCode } from "@cesteral/shared";
import type { MsAdsHttpClient } from "./msads-http-client.js";
import {
  getEntityConfig,
  type MsAdsEntityType,
} from "../../mcp-server/tools/utils/entity-mapping.js";
import { type RequestContext, executeBulkConcurrent } from "@cesteral/shared";
import { MSADS_READ_KEY, MSADS_WRITE_KEY } from "./rate-limit-keys.js";
import type {
  MsAdsCampaign,
  MsAdsAdGroup,
  MsAdsAd,
  MsAdsKeyword,
  MsAdsBudget,
  MsAdsAdExtension,
  MsAdsAudience,
  MsAdsLabel,
} from "./types.js";

export type {
  MsAdsCampaign,
  MsAdsAdGroup,
  MsAdsAd,
  MsAdsKeyword,
  MsAdsBudget,
  MsAdsAdExtension,
  MsAdsAudience,
  MsAdsLabel,
};

interface MsAdsEntityMap {
  campaign: MsAdsCampaign;
  adGroup: MsAdsAdGroup;
  ad: MsAdsAd;
  keyword: MsAdsKeyword;
  budget: MsAdsBudget;
  adExtension: MsAdsAdExtension;
  audience: MsAdsAudience;
  label: MsAdsLabel;
}

/**
 * Microsoft Ads entity service — generic CRUD wrapping MsAdsHttpClient.
 *
 * Uses entity mapping to route operations to the correct verb-based endpoints.
 * Microsoft Ads REST API uses POST for all operations (even reads).
 */
export class MsAdsService {
  constructor(
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: MsAdsHttpClient,
    private readonly logger: Logger
  ) {}

  /**
   * List entities by account or parent.
   * - Top-level entities (campaign, budget, label): uses getByAccountOperation with AccountId
   * - Child entities (adGroup, ad, keyword): uses getByParentOperation with parentId
   */
  async listEntities<T extends MsAdsEntityType>(
    entityType: T,
    params: {
      accountId?: string;
      parentId?: string;
      filters?: Record<string, unknown>;
    },
    context?: RequestContext
  ): Promise<{ entities: MsAdsEntityMap[T][] }> {
    const config = getEntityConfig(entityType);

    await this.rateLimiter.consume(MSADS_READ_KEY);

    let raw: unknown;

    if (params.parentId && config.getByParentOperation && config.parentIdField) {
      const body: Record<string, unknown> = {
        [config.parentIdField]: Number(params.parentId),
        ...params.filters,
      };
      this.logger.debug({ entityType, parentId: params.parentId }, "Listing entities by parent");
      raw = await this.httpClient.post(config.getByParentOperation, body, context);
    } else if (config.getByAccountOperation) {
      const body: Record<string, unknown> = {
        AccountId: Number(params.accountId),
        ...params.filters,
      };
      this.logger.debug({ entityType, accountId: params.accountId }, "Listing entities by account");
      raw = await this.httpClient.post(config.getByAccountOperation, body, context);
    } else {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        entityType === "audience"
          ? "Use getEntity with specific AudienceIds. Audiences cannot be listed by account in the MS Ads REST API v13."
          : entityType === "budget"
            ? "Use getEntity with specific BudgetIds. Budgets cannot be listed by account in the MS Ads REST API v13."
            : `Entity type '${entityType}' does not support listing. Use getEntity with specific IDs.`
      );
    }

    const result = raw as Record<string, unknown>;
    const entities = ((result[config.pluralName] as unknown[]) ?? []) as MsAdsEntityMap[T][];
    return { entities };
  }

  /**
   * Get entity by ID(s). Uses getByIdsOperation.
   */
  async getEntity<T extends MsAdsEntityType>(
    entityType: T,
    entityIds: string[],
    params?: Record<string, unknown>,
    context?: RequestContext
  ): Promise<{ entities: MsAdsEntityMap[T][] }> {
    const config = getEntityConfig(entityType);

    await this.rateLimiter.consume(MSADS_READ_KEY);

    const body: Record<string, unknown> = {
      [config.idsField]: entityIds.map(Number),
      ...params,
    };

    this.logger.debug({ entityType, entityIds }, "Getting entities by IDs");
    const raw = await this.httpClient.post(config.getByIdsOperation, body, context);
    const result = raw as Record<string, unknown>;
    const entities = ((result[config.pluralName] as unknown[]) ?? []) as MsAdsEntityMap[T][];
    return { entities };
  }

  /**
   * Create entities via the Add operation.
   */
  async createEntity(
    entityType: MsAdsEntityType,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);
    if (entityType === "campaign" && data["AccountId"] === undefined) {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        "Campaign create requires AccountId in the request data"
      );
    }
    await this.rateLimiter.consume(MSADS_WRITE_KEY, 3);
    this.logger.info({ entityType }, "Creating entity");
    return this.httpClient.post(config.addOperation, data, context);
  }

  /**
   * Update entities via the Update operation.
   */
  async updateEntity(
    entityType: MsAdsEntityType,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);
    await this.rateLimiter.consume(MSADS_WRITE_KEY, 3);
    this.logger.info({ entityType }, "Updating entity");
    return this.httpClient.post(config.updateOperation, data, context);
  }

  /**
   * Delete entities via the Delete operation.
   */
  async deleteEntity(
    entityType: MsAdsEntityType,
    entityIds: string[],
    params?: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);
    await this.rateLimiter.consume(MSADS_WRITE_KEY, 3);
    const body: Record<string, unknown> = {
      [config.idsField]: entityIds.map(Number),
      ...params,
    };
    this.logger.info({ entityType, entityIds }, "Deleting entities");
    return this.httpClient.post(config.deleteOperation, body, context);
  }

  /**
   * Bulk create entities — batches items per entity batch limit.
   */
  async bulkCreateEntities(
    entityType: MsAdsEntityType,
    items: Record<string, unknown>[],
    context?: RequestContext
  ): Promise<unknown[]> {
    const config = getEntityConfig(entityType);
    const results: unknown[] = [];

    for (let i = 0; i < items.length; i += config.batchLimit) {
      const batch = items.slice(i, i + config.batchLimit);
      await this.rateLimiter.consume(MSADS_WRITE_KEY, 3);
      const body = { [config.pluralName]: batch };
      this.logger.info({ entityType, batchSize: batch.length, batchIndex: i }, "Bulk creating entities");
      const result = await this.httpClient.post(config.addOperation, body, context);
      results.push(result);
    }

    return results;
  }

  /**
   * Bulk update entities — batches items per entity batch limit.
   */
  async bulkUpdateEntities(
    entityType: MsAdsEntityType,
    items: Record<string, unknown>[],
    context?: RequestContext
  ): Promise<unknown[]> {
    const config = getEntityConfig(entityType);
    const results: unknown[] = [];

    for (let i = 0; i < items.length; i += config.batchLimit) {
      const batch = items.slice(i, i + config.batchLimit);
      await this.rateLimiter.consume(MSADS_WRITE_KEY, 3);
      const body = { [config.pluralName]: batch };
      this.logger.info({ entityType, batchSize: batch.length }, "Bulk updating entities");
      const result = await this.httpClient.post(config.updateOperation, body, context);
      results.push(result);
    }

    return results;
  }

  /**
   * Bulk update entity status — per-entity calls for granular success/failure reporting.
   */
  async bulkUpdateStatus(
    entityType: MsAdsEntityType,
    entityIds: string[],
    status: string,
    context?: RequestContext
  ): Promise<{ results: Array<{ entityId: string; success: boolean; error?: string }> }> {
    const config = getEntityConfig(entityType);

    this.logger.info({ entityType, count: entityIds.length, status }, "Bulk updating status");

    const bulkResults = await executeBulkConcurrent(entityIds, async (entityId) => {
      // Cost 1 (not 3) — status-only updates are minimal single-field payloads
      await this.rateLimiter.consume(MSADS_WRITE_KEY, 1);
      const body = {
        [config.pluralName]: [{ Id: Number(entityId), Status: status }],
      };
      return this.httpClient.post(config.updateOperation, body, context);
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
   * Adjust bids — safe read-modify-write pattern for keyword/adGroup bids.
   */
  async adjustBids(
    entityType: MsAdsEntityType,
    adjustments: Array<{
      entityId: string;
      bidField: string;
      newBid: number;
    }>,
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);

    // Read current entities
    const entityIds = adjustments.map((a) => a.entityId);
    const { entities: currentEntities } = await this.getEntity(entityType, entityIds, undefined, context);

    // Apply bid changes — skip missing entities to prevent data loss
    const updatedEntities = adjustments
      .map((adj) => {
        const current = currentEntities.find(
          (e) => String((e as unknown as Record<string, unknown>)[config.idField]) === adj.entityId
        );
        if (!current) {
          this.logger.warn({ entityId: adj.entityId }, "Entity not found during bid adjustment — skipping to prevent data loss");
          return null;
        }
        return { ...(current as unknown as Record<string, unknown>), [adj.bidField]: adj.newBid };
      })
      .filter((e): e is Record<string, unknown> => e !== null);

    if (updatedEntities.length === 0) {
      throw new McpError(JsonRpcErrorCode.InvalidParams, "No entities found for bid adjustment — all entity IDs were invalid or deleted");
    }

    await this.rateLimiter.consume(MSADS_WRITE_KEY, 3);
    const body = { [config.pluralName]: updatedEntities };
    this.logger.info({ entityType, count: adjustments.length }, "Adjusting bids");
    return this.httpClient.post(config.updateOperation, body, context);
  }

  /**
   * Generic POST for read operations not covered by standard CRUD.
   */
  async executeReadOperation(
    path: string,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(MSADS_READ_KEY);
    this.logger.debug({ path }, "Executing custom read operation");
    return this.httpClient.post(path, data, context);
  }

  /**
   * Generic POST for write operations not covered by CRUD (ad extensions, criterions, etc.)
   */
  async executeOperation(
    path: string,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(MSADS_WRITE_KEY, 3);
    this.logger.debug({ path }, "Executing custom operation");
    return this.httpClient.post(path, data, context);
  }

  // ─── Internal Helpers ───────────────────────────────────────────

}