// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import { z } from "zod";
import type { CM360HttpClient } from "./cm360-http-client.js";
import type { BulkResult, RateLimiter } from "@cesteral/shared";
import {
  McpError,
  JsonRpcErrorCode,
  executeBulkConcurrent,
  type RequestContext,
} from "@cesteral/shared";
import type { CM360EntityType } from "../../mcp-server/tools/utils/entity-mapping.js";
import { getEntityConfig } from "../../mcp-server/tools/utils/entity-mapping.js";
import type { components } from "../../generated/types.js";

const PaginatedListEnvelopeSchema = z
  .object({
    nextPageToken: z.string().optional(),
  })
  .catchall(z.unknown());

function parseListEnvelope(
  value: unknown,
  endpoint: string
): { nextPageToken?: string } & Record<string, unknown> {
  const result = PaginatedListEnvelopeSchema.safeParse(value);
  if (!result.success) {
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      `CM360 response from ${endpoint} did not match expected shape: ${result.error.message}`
    );
  }
  return result.data;
}

type CM360Campaign = components["schemas"]["Campaign"];
type CM360Placement = components["schemas"]["Placement"];
type CM360Ad = components["schemas"]["Ad"];
type CM360Creative = components["schemas"]["Creative"];
type CM360Site = components["schemas"]["Site"];
type CM360Advertiser = components["schemas"]["Advertiser"];
type CM360FloodlightActivity = components["schemas"]["FloodlightActivity"];
type CM360FloodlightConfiguration = components["schemas"]["FloodlightConfiguration"];

interface CM360EntityMap {
  campaign: CM360Campaign;
  placement: CM360Placement;
  ad: CM360Ad;
  creative: CM360Creative;
  site: CM360Site;
  advertiser: CM360Advertiser;
  floodlightActivity: CM360FloodlightActivity;
  floodlightConfiguration: CM360FloodlightConfiguration;
}

export type {
  CM360Campaign,
  CM360Placement,
  CM360Ad,
  CM360Creative,
  CM360Site,
  CM360Advertiser,
  CM360FloodlightActivity,
  CM360FloodlightConfiguration,
};

export class CM360Service {
  constructor(
    private readonly logger: Logger,
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: CM360HttpClient
  ) {}

  async listUserProfiles(context?: RequestContext): Promise<unknown> {
    await this.rateLimiter.consume("cm360");
    this.logger.debug({ requestId: context?.requestId }, "Listing CM360 user profiles");
    return this.httpClient.fetch("/userprofiles", context);
  }

  async listEntities<T extends CM360EntityType>(
    entityType: T,
    profileId: string,
    filters?: Record<string, unknown>,
    pageToken?: string,
    maxResults?: number,
    context?: RequestContext
  ): Promise<{ entities: CM360EntityMap[T][]; nextPageToken?: string }> {
    await this.rateLimiter.consume("cm360");
    const config = getEntityConfig(entityType);

    const params = new URLSearchParams();
    if (pageToken) params.set("pageToken", pageToken);
    if (maxResults) params.set("maxResults", String(maxResults));
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null) {
          params.set(key, String(value));
        }
      }
    }

    const queryString = params.toString();
    const path = `/userprofiles/${profileId}/${config.apiCollection}${queryString ? `?${queryString}` : ""}`;

    const raw = await this.httpClient.fetch(path, context);
    const result = parseListEnvelope(raw, `GET ${path}`);
    const rawEntities = result[config.apiCollection];
    if (rawEntities === undefined) {
      this.logger.warn(
        {
          entityType,
          collection: config.apiCollection,
          responseKeys: Object.keys(result),
          requestId: context?.requestId,
        },
        `CM360 API response missing expected collection key "${config.apiCollection}" — returning empty results`
      );
    }
    const entities = (Array.isArray(rawEntities) ? rawEntities : []) as CM360EntityMap[T][];

    return { entities, nextPageToken: result.nextPageToken };
  }

  async getEntity<T extends CM360EntityType>(
    entityType: T,
    profileId: string,
    entityId: string,
    context?: RequestContext
  ): Promise<CM360EntityMap[T]> {
    await this.rateLimiter.consume("cm360");
    const config = getEntityConfig(entityType);
    const path = `/userprofiles/${profileId}/${config.apiCollection}/${entityId}`;
    return this.httpClient.fetch(path, context) as Promise<CM360EntityMap[T]>;
  }

  async createEntity<T extends CM360EntityType>(
    entityType: T,
    profileId: string,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<CM360EntityMap[T]> {
    await this.rateLimiter.consume("cm360");
    const config = getEntityConfig(entityType);
    const path = `/userprofiles/${profileId}/${config.apiCollection}`;
    return this.httpClient.fetch(path, context, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }) as Promise<CM360EntityMap[T]>;
  }

  /**
   * Full replacement — dfareporting v5 `{collection}.update`
   * (`PUT userprofiles/{profileId}/{collection}`, entity id in the body).
   * Any field absent from `data` is reset by CM360, so this is only safe with
   * a complete entity object (e.g. the read-modify-write in
   * {@link bulkUpdateStatus}). Partial updates must use {@link patchEntity}.
   */
  async updateEntity<T extends CM360EntityType>(
    entityType: T,
    profileId: string,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<CM360EntityMap[T]> {
    await this.rateLimiter.consume("cm360");
    const config = getEntityConfig(entityType);
    const path = `/userprofiles/${profileId}/${config.apiCollection}`;
    return this.httpClient.fetch(path, context, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }) as Promise<CM360EntityMap[T]>;
  }

  /**
   * Partial update — dfareporting v5 `{collection}.patch`
   * (`PATCH userprofiles/{profileId}/{collection}?id={entityId}`, `id` a
   * required query parameter on all 8 entity types). Only the fields present
   * in `patch` change; everything else on the entity is preserved. The id is
   * also written into the body so it can never disagree with the query.
   * Returns the full updated entity.
   */
  async patchEntity<T extends CM360EntityType>(
    entityType: T,
    profileId: string,
    entityId: string,
    patch: Record<string, unknown>,
    context?: RequestContext
  ): Promise<CM360EntityMap[T]> {
    await this.rateLimiter.consume("cm360");
    const config = getEntityConfig(entityType);
    const query = new URLSearchParams({ id: entityId }).toString();
    const path = `/userprofiles/${profileId}/${config.apiCollection}?${query}`;
    return this.httpClient.fetch(path, context, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...patch, id: entityId }),
    }) as Promise<CM360EntityMap[T]>;
  }

  async listTargetingOptions(
    profileId: string,
    targetingType: string,
    filters?: Record<string, unknown>,
    pageToken?: string,
    maxResults?: number,
    context?: RequestContext
  ): Promise<{ options: unknown[]; nextPageToken?: string }> {
    await this.rateLimiter.consume("cm360");

    const params = new URLSearchParams();
    if (pageToken) params.set("pageToken", pageToken);
    if (maxResults) params.set("maxResults", String(maxResults));
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null) {
          params.set(key, String(value));
        }
      }
    }

    const queryString = params.toString();
    const path = `/userprofiles/${profileId}/${targetingType}${queryString ? `?${queryString}` : ""}`;

    const raw = await this.httpClient.fetch(path, context);
    const result = parseListEnvelope(raw, `GET ${path}`);
    const rawOptions = result[targetingType];
    if (rawOptions === undefined) {
      this.logger.warn(
        { targetingType, responseKeys: Object.keys(result), requestId: context?.requestId },
        `CM360 API response missing expected key "${targetingType}" — returning empty results`
      );
    }
    const options = Array.isArray(rawOptions) ? rawOptions : [];

    return { options, nextPageToken: result.nextPageToken };
  }

  async deleteEntity(
    entityType: CM360EntityType,
    profileId: string,
    entityId: string,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume("cm360");
    const config = getEntityConfig(entityType);
    if (!config.supportsDelete) {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `Delete is not supported for entity type: ${entityType}`
      );
    }
    const path = `/userprofiles/${profileId}/${config.apiCollection}/${entityId}`;
    return this.httpClient.fetch(path, context, { method: "DELETE" });
  }

  // ─── Bulk Operations ──────────────────────────────────────────────
  //
  // CM360 has no native bulk endpoint, so each tool fan-outs to per-entity
  // CRUD calls. Concurrency is bounded by `executeBulkConcurrent` (default 5)
  // and individual failures are recorded without aborting the batch.

  async bulkCreateEntities<T extends CM360EntityType>(
    entityType: T,
    profileId: string,
    items: Record<string, unknown>[],
    context?: RequestContext
  ): Promise<BulkResult<CM360EntityMap[T]>[]> {
    return executeBulkConcurrent(
      items,
      (item) => this.createEntity(entityType, profileId, item, context),
      { logger: this.logger }
    );
  }

  async bulkUpdateEntities<T extends CM360EntityType>(
    entityType: T,
    profileId: string,
    items: Array<{ entityId: string; data: Record<string, unknown> }>,
    context?: RequestContext
  ): Promise<
    Array<{ entityId: string; success: boolean; entity?: CM360EntityMap[T]; error?: string }>
  > {
    const bulkResults = await executeBulkConcurrent(
      items,
      (item) => this.patchEntity(entityType, profileId, item.entityId, item.data, context),
      { logger: this.logger }
    );
    return bulkResults.map((r, i) => ({
      entityId: items[i]!.entityId,
      success: r.success,
      entity: r.entity,
      error: r.error,
    }));
  }

  /**
   * Read-modify-write status update: GET the full entity, flip its status
   * fields, then PUT the complete object back via {@link updateEntity}. The PUT
   * is a full replacement, which is safe here only because the body is the
   * whole entity just read. The caller provides the per-entity-type status
   * mapping via the `applyStatus` transform.
   */
  async bulkUpdateStatus<T extends CM360EntityType>(
    entityType: T,
    profileId: string,
    entityIds: string[],
    status: string,
    applyStatus: (current: Record<string, unknown>, status: string) => Record<string, unknown>,
    context?: RequestContext
  ): Promise<Array<{ entityId: string; success: boolean; error?: string }>> {
    const bulkResults = await executeBulkConcurrent(
      entityIds,
      async (entityId) => {
        const current = (await this.getEntity(entityType, profileId, entityId, context)) as Record<
          string,
          unknown
        >;
        await this.updateEntity(entityType, profileId, applyStatus(current, status), context);
        return entityId;
      },
      { logger: this.logger }
    );
    return bulkResults.map((r, i) => ({
      entityId: entityIds[i]!,
      success: r.success,
      error: r.error,
    }));
  }
}
