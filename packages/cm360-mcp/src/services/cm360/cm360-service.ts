// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import { z } from "zod";
import type { CM360HttpClient } from "./cm360-http-client.js";
import type { BulkCapacityCheck, BulkResult, RateLimiter } from "@cesteral/shared";
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

/**
 * Rate-limit cost of ONE item of each bulk method, on `cm360:user:{quotaUser}` —
 * one entry per `consume` the item makes, in order (see the bulk methods at
 * the bottom of {@link CM360Service}):
 *
 * - `create`: {@link CM360Service.createEntity} (POST) — 1 token.
 * - `update`: {@link CM360Service.patchEntity} (PATCH) — 1 token.
 * - `status`: read-modify-write — {@link CM360Service.getEntity} (GET) then
 *   {@link CM360Service.updateEntity} (PUT), 1 token each.
 *
 * CM360 has no native bulk endpoint, so none of these batch: cost is linear in
 * item count. At the 5/min default a 120s queue budget admits 15 tokens — 15
 * creates/updates or 7 status changes — so a 50-item batch would otherwise
 * queue for up to ~10 minutes, past client and Cloud Run request timeouts.
 * Keep in step with the consume calls below.
 */
export const CM360_BULK_COST_PER_ITEM = {
  create: [1],
  update: [1],
  status: [1, 1],
} as const satisfies Record<string, readonly number[]>;

export type CM360BulkOperation = keyof typeof CM360_BULK_COST_PER_ITEM;

/**
 * The {@link BulkCapacityCheck} for a CM360 bulk batch, for
 * `assertBulkCapacity` / `projectBulkCapacity`. `rateLimiter` must be the
 * limiter the session's {@link CM360Service} consumes from (the package's
 * `rateLimiter` from `utils/platform.ts`, which both transports hand to
 * `createSessionServices`), and `quotaUser` that service's
 * {@link CM360Service.quotaUser}.
 */
export function cm360BulkCapacityCheck(
  rateLimiter: RateLimiter,
  toolName: string,
  operation: CM360BulkOperation,
  quotaUser: string,
  itemCount: number
): BulkCapacityCheck {
  return {
    rateLimiter,
    toolName,
    itemCount,
    buckets: [{ key: `cm360:user:${quotaUser}`, costPerItem: CM360_BULK_COST_PER_ITEM[operation] }],
  };
}

/**
 * Query parameters each `userprofiles/{profileId}/{targetingType}` list method
 * accepts besides `profileId` — dfareporting v5 Discovery, revision 20260721.
 * Only `contentCategories` paginates and only `cities` filters; the other
 * eleven take `profileId` alone and return the whole list in one response.
 */
export const CM360_TARGETING_LIST_PARAMS: Readonly<Record<string, readonly string[]>> = {
  browsers: [],
  connectionTypes: [],
  countries: [],
  languages: [],
  metros: [],
  mobileCarriers: [],
  operatingSystemVersions: [],
  operatingSystems: [],
  platformTypes: [],
  postalCodes: [],
  regions: [],
  contentCategories: ["ids", "maxResults", "pageToken", "searchString", "sortField", "sortOrder"],
  cities: ["countryDartIds", "dartIds", "namePrefix", "regionDartIds"],
};

/** Query keys the list methods set themselves; a `filters` entry must not override them. */
const RESERVED_LIST_PARAMS = new Set(["pageToken", "maxResults"]);

function assertNoReservedFilterKeys(filters: Record<string, unknown> | undefined): void {
  const reserved = Object.keys(filters ?? {}).filter((key) => RESERVED_LIST_PARAMS.has(key));
  if (reserved.length > 0) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `filters must not set ${reserved.join(", ")}; pass pageToken / maxResults as their own parameters.`
    );
  }
}

/**
 * Append one filter value. Google's `repeated` query parameters take one key
 * per value (`ids=1&ids=2`), which is how Google's own Node client encodes
 * them (googleapis-common: `qs.stringify(params, { arrayFormat: "repeat" })`).
 * `String(array)` sent the single value `ids=1,2` instead.
 */
function appendQueryValue(params: URLSearchParams, key: string, value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item !== undefined && item !== null) params.append(key, String(item));
    }
    return;
  }
  params.append(key, String(value));
}

/**
 * Rate-limit keys: the limiter is configured for `cm360:*`, so every key must
 * carry the `cm360:` prefix — a bare `"cm360"` (what every call site used to
 * pass) matches nothing and is silently unlimited. Every trafficking call is
 * keyed per quota user, `cm360:user:{quotaUser}`, because CM360 counts its
 * per-user quota across all of a user's profiles (see `cm360QuotaUser`);
 * the per-profile key this replaced let one user with N profiles run N times
 * the default, and still isolates one user's bulk job from other users on the
 * instance. Reporting shares this bucket (see CM360ReportingService). Ratcheted by `scripts/lib/rate-limit-keys.test.mjs`.
 */
export class CM360Service {
  constructor(
    private readonly logger: Logger,
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: CM360HttpClient,
    /** Per-user quota key segment — see `cm360QuotaUser` (quota-user.ts). */
    readonly quotaUser: string
  ) {}

  async listUserProfiles(context?: RequestContext): Promise<unknown> {
    await this.rateLimiter.consume(`cm360:user:${this.quotaUser}`);
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
    const config = getEntityConfig(entityType);
    if (config.supportsPagination === false && (pageToken || maxResults)) {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `${config.apiCollection}.list does not paginate (dfareporting v5 takes no pageToken or ` +
          `maxResults for it); omit them, the response holds every result.`
      );
    }
    assertNoReservedFilterKeys(filters);
    await this.rateLimiter.consume(`cm360:user:${this.quotaUser}`);

    const params = new URLSearchParams();
    if (pageToken) params.set("pageToken", pageToken);
    if (maxResults) params.set("maxResults", String(maxResults));
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null) {
          appendQueryValue(params, key, value);
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
    await this.rateLimiter.consume(`cm360:user:${this.quotaUser}`);
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
    const config = getEntityConfig(entityType);
    if (config.supportsCreate === false) {
      // Refuse before spending a token or sending a POST no method would handle.
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `Create is not supported for entity type: ${entityType} — dfareporting v5 has no ` +
          `${config.apiCollection}.insert method. Update an existing one with cm360_update_entity.`
      );
    }
    await this.rateLimiter.consume(`cm360:user:${this.quotaUser}`);
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
    await this.rateLimiter.consume(`cm360:user:${this.quotaUser}`);
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
    await this.rateLimiter.consume(`cm360:user:${this.quotaUser}`);
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
    // Refuse what this targeting type's list method does not take, before
    // spending a token or sending anything.
    const accepted = CM360_TARGETING_LIST_PARAMS[targetingType];
    if (!accepted) {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `Unknown CM360 targeting type: ${targetingType}`
      );
    }
    assertNoReservedFilterKeys(filters);
    const requested = [
      ...(pageToken ? ["pageToken"] : []),
      ...(maxResults ? ["maxResults"] : []),
      ...Object.entries(filters ?? {})
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key]) => key),
    ];
    const unsupported = requested.filter((key) => !accepted.includes(key));
    if (unsupported.length > 0) {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `${targetingType}.list does not accept ${unsupported.join(", ")}; dfareporting v5 takes ` +
          `${accepted.length > 0 ? `only ${accepted.join(", ")}` : "no parameters besides profileId"} for it.`
      );
    }
    await this.rateLimiter.consume(`cm360:user:${this.quotaUser}`);

    const params = new URLSearchParams();
    if (pageToken) params.set("pageToken", pageToken);
    if (maxResults) params.set("maxResults", String(maxResults));
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null) {
          appendQueryValue(params, key, value);
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
    await this.rateLimiter.consume(`cm360:user:${this.quotaUser}`);
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
