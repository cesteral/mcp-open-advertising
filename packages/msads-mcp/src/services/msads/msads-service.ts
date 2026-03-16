// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { RateLimiter } from "@cesteral/shared";
import type { MsAdsHttpClient } from "./msads-http-client.js";
import {
  getEntityConfig,
  type MsAdsEntityType,
} from "../../mcp-server/tools/utils/entity-mapping.js";
import type { RequestContext } from "@cesteral/shared";

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
  async listEntities(
    entityType: MsAdsEntityType,
    params: {
      accountId?: string;
      parentId?: string;
      filters?: Record<string, unknown>;
    },
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);

    await this.rateLimiter.consume("msads:read");

    if (params.parentId && config.getByParentOperation && config.parentIdField) {
      const body: Record<string, unknown> = {
        [config.parentIdField]: params.parentId,
        ...params.filters,
      };
      this.logger.debug({ entityType, parentId: params.parentId }, "Listing entities by parent");
      return this.httpClient.post(config.getByParentOperation, body, context);
    }

    if (config.getByAccountOperation) {
      const body: Record<string, unknown> = {
        AccountId: params.accountId,
        ...params.filters,
      };
      this.logger.debug({ entityType, accountId: params.accountId }, "Listing entities by account");
      return this.httpClient.post(config.getByAccountOperation, body, context);
    }

    throw new Error(`Entity type '${entityType}' does not support listing. Use getEntity with specific IDs.`);
  }

  /**
   * Get entity by ID(s). Uses getByIdsOperation.
   */
  async getEntity(
    entityType: MsAdsEntityType,
    entityIds: string[],
    params?: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);

    await this.rateLimiter.consume("msads:read");

    const body: Record<string, unknown> = {
      [config.idsField]: entityIds.map(Number),
      ...params,
    };

    this.logger.debug({ entityType, entityIds }, "Getting entities by IDs");
    return this.httpClient.post(config.getByIdsOperation, body, context);
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
    await this.rateLimiter.consume("msads:write", 3);
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
    await this.rateLimiter.consume("msads:write", 3);
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
    await this.rateLimiter.consume("msads:write", 3);
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
      await this.rateLimiter.consume("msads:write", 3);
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
      await this.rateLimiter.consume("msads:write", 3);
      const body = { [config.pluralName]: batch };
      this.logger.info({ entityType, batchSize: batch.length }, "Bulk updating entities");
      const result = await this.httpClient.post(config.updateOperation, body, context);
      results.push(result);
    }

    return results;
  }

  /**
   * Bulk update entity status — updates Status field on each entity.
   */
  async bulkUpdateStatus(
    entityType: MsAdsEntityType,
    entityIds: string[],
    status: string,
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);
    const items = entityIds.map((id) => ({
      Id: Number(id),
      Status: status,
    }));
    await this.rateLimiter.consume("msads:write", 3);
    const body = { [config.pluralName]: items };
    this.logger.info({ entityType, count: entityIds.length, status }, "Bulk updating status");
    return this.httpClient.post(config.updateOperation, body, context);
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
    const currentData = (await this.getEntity(entityType, entityIds, undefined, context)) as Record<string, unknown>;
    const currentEntities = (currentData[config.pluralName] as Record<string, unknown>[]) ?? [];

    // Apply bid changes
    const updatedEntities = adjustments.map((adj) => {
      const current = currentEntities.find(
        (e) => String((e as Record<string, unknown>)[config.idField]) === adj.entityId
      );
      return {
        ...(current ?? {}),
        Id: Number(adj.entityId),
        [adj.bidField]: adj.newBid,
      };
    });

    await this.rateLimiter.consume("msads:write", 3);
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
    await this.rateLimiter.consume("msads:read");
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
    await this.rateLimiter.consume("msads:write", 3);
    this.logger.debug({ path }, "Executing custom operation");
    return this.httpClient.post(path, data, context);
  }
}