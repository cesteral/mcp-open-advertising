// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { SnapchatHttpClient } from "./snapchat-http-client.js";
import { consumeSnapchatQuota, snapchatQuotaKey } from "./rate-limit-keys.js";
import type { RateLimiter } from "@cesteral/shared";
import { type RequestContext, McpError, JsonRpcErrorCode } from "@cesteral/shared";
import {
  getEntityConfig,
  interpolatePath,
  type SnapchatEntityType,
} from "../../mcp-server/tools/utils/entity-mapping.js";
import type {
  SnapchatCampaign,
  SnapchatAdSquad,
  SnapchatAd,
  SnapchatCreative,
  SnapchatAdAccount,
} from "./types.js";

import { buildSnapchatDuplicateCopy } from "../../mcp-server/tools/utils/duplicate-copy.js";
import type {
  SnapchatMediaUploadResponse,
  SnapchatMediaGetResponse,
} from "../../mcp-server/tools/utils/media-types.js";

export type { SnapchatCampaign, SnapchatAdSquad, SnapchatAd, SnapchatCreative, SnapchatAdAccount };

interface SnapchatEntityMap {
  campaign: SnapchatCampaign;
  adGroup: SnapchatAdSquad;
  ad: SnapchatAd;
  creative: SnapchatCreative;
}

/** Snapchat pagination response */
interface SnapchatPaging {
  next_link?: string;
}

interface SnapchatSubrequest {
  sub_request_status?: string;
  status?: string;
  sub_request_error_message?: string;
  [key: string]: unknown;
}

interface SnapchatTargetingEndpointConfig {
  path: string;
  responseKey?: string;
  requiresCountryCode?: boolean;
}

const TARGETING_ENDPOINTS: Record<string, SnapchatTargetingEndpointConfig> = {
  country_support: { path: "/v1/targeting/v1/options" },
  geo_country: { path: "/v1/targeting/geo/country", responseKey: "country" },
  geo_region: {
    path: "/v1/targeting/geo/{countryCode}/region",
    responseKey: "region",
    requiresCountryCode: true,
  },
  geo_metro: {
    path: "/v1/targeting/geo/{countryCode}/metro",
    responseKey: "metro",
    requiresCountryCode: true,
  },
  geo_postal_code: {
    path: "/v1/targeting/geo/{countryCode}/postal_code",
    responseKey: "postal_code",
    requiresCountryCode: true,
  },
  interests_slc: { path: "/v1/targeting/v1/interests/scls", responseKey: "scls" },
  interests_vac: { path: "/v1/targeting/v1/interests/vac", responseKey: "vac" },
  interests_shp: { path: "/v1/targeting/v1/interests/shp", responseKey: "shp" },
};

function getSubrequestStatus(item: SnapchatSubrequest): string | undefined {
  const statusValue = item["sub_request_status"] ?? item["status"];
  return typeof statusValue === "string" ? statusValue.toUpperCase() : undefined;
}

/**
 * Unwrap array of entity items from Snapchat response envelope.
 * Input: { request_status, <responseKey>: [{ sub_request_status, <entityKey>: {...} }] }
 * Output: array of inner entity objects
 */
function unwrapEntities(responseKey: string, entityKey: string, response: unknown): unknown[] {
  const envelope = response as Record<string, unknown>;
  const items = envelope[responseKey];
  if (!Array.isArray(items)) return [];
  return items
    .filter((rawItem) => {
      const item = rawItem as SnapchatSubrequest;
      const status = getSubrequestStatus(item);
      return status === undefined || status === "SUCCESS";
    })
    .map((item: Record<string, unknown>) => item[entityKey] ?? item);
}

function unwrapSingleEntity(responseKey: string, entityKey: string, response: unknown): unknown {
  const entities = unwrapEntities(responseKey, entityKey, response);
  return entities[0];
}

/**
 * Body field that links each entity type to the parent its collection route is
 * scoped by, and the path param carrying that parent's ID. The package's
 * request types (`CreateSnapchatCampaignRequest.ad_account_id`,
 * `CreateSnapchatAdSquadRequest.campaign_id`, `CreateSnapchatAdRequest.ad_squad_id`)
 * and entity types (`SnapchatCreative.ad_account_id`) carry these fields.
 */
const PARENT_LINKS: Record<
  SnapchatEntityType,
  { bodyField: string; pathParam: "adAccountId" | "campaignId" | "adSquadId" }
> = {
  campaign: { bodyField: "ad_account_id", pathParam: "adAccountId" },
  creative: { bodyField: "ad_account_id", pathParam: "adAccountId" },
  adGroup: { bodyField: "campaign_id", pathParam: "campaignId" },
  ad: { bodyField: "ad_squad_id", pathParam: "adSquadId" },
};

/** Parent entity type an entity's `PARENT_LINKS.bodyField` points at (null = the ad account). */
const PARENT_ENTITY_TYPE: Record<SnapchatEntityType, SnapchatEntityType | null> = {
  campaign: null,
  creative: null,
  adGroup: "campaign",
  ad: "adGroup",
};

/**
 * Limiter tokens one read / one write `consume` costs (a read passes no count,
 * i.e. `consume`'s default of 1). Exported because the bulk capacity pre-check
 * (`tools/utils/bulk-capacity.ts`) projects a batch from exactly these costs —
 * a change here must move the projection with it.
 */
export const SNAPCHAT_READ_TOKENS = 1;
export const SNAPCHAT_WRITE_TOKENS = 3;

/**
 * Limiter consumes, in order, of ONE `getEntity(entityType)` whose ownership is
 * not yet memoized, in the worst case: the entity's own GET (`fetchEntity`) plus
 * one GET per ancestor `resolveOwningAccount` may walk when a level carries no
 * `ad_account_id` — ad → ad squad → campaign, so `ad` = 3, `adGroup` = 2,
 * `campaign` / `creative` = 1.
 *
 * Worst case on purpose: `owningAccountCache` makes a repeat read of a resolved
 * parent free, but the bulk paths read their items concurrently
 * (`Promise.all` / `Promise.allSettled`), so every item of the first wave walks
 * the same uncached parent before any of them populates the cache, and later
 * waves queue behind those walks. The memo cannot be counted on inside a batch.
 */
export function getEntityWorstCaseConsumes(entityType: SnapchatEntityType): number[] {
  const costs = [SNAPCHAT_READ_TOKENS];
  for (let t = PARENT_ENTITY_TYPE[entityType]; t; t = PARENT_ENTITY_TYPE[t]) {
    costs.push(SNAPCHAT_READ_TOKENS);
  }
  return costs;
}

/**
 * Upper bound on targeting pages `searchTargeting` scans for a keyword. Each
 * page is one API request (and one rate-limiter token), so the scan is capped;
 * the result reports whether every page was covered.
 */
const MAX_TARGETING_SEARCH_PAGES = 5;
/** Page size requested while scanning for a keyword (clamped per endpoint in getTargetingOptions). */
const TARGETING_SEARCH_PAGE_SIZE = 1000;

/**
 * Unwrap bulk response preserving positional alignment with input items.
 * Unlike unwrapEntities(), failed subrequests are NOT dropped — they produce
 * { success: false, error } at the same index, keeping 1:1 mapping with inputs.
 */
function unwrapBulkResults(
  responseKey: string,
  entityKey: string,
  response: unknown
): Array<{ success: boolean; entity?: unknown; error?: string }> {
  const envelope = response as Record<string, unknown>;
  const items = envelope[responseKey];
  if (!Array.isArray(items)) return [];
  return items.map((rawItem) => {
    const item = rawItem as SnapchatSubrequest;
    const status = getSubrequestStatus(item);
    if (status === undefined || status === "SUCCESS") {
      return { success: true, entity: item[entityKey] ?? item };
    }
    const errorMsg =
      item["sub_request_error_message"] ?? item["sub_request_status"] ?? "Unknown error";
    return { success: false, error: String(errorMsg) };
  });
}

/**
 * Unwrap the single sub-request of a create/update response. Unlike
 * `unwrapSingleEntity`, a failed sub-request is surfaced as an error carrying
 * Snapchat's `sub_request_error_message` instead of being filtered out (which
 * returned `undefined` and hid the reason the write was rejected).
 */
function unwrapSingleWriteResult(
  responseKey: string,
  entityKey: string,
  response: unknown,
  operation: string
): unknown {
  const [first] = unwrapBulkResults(responseKey, entityKey, response);
  if (!first) {
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      `Snapchat ${operation}: response contained no '${responseKey}' sub-request result`
    );
  }
  if (!first.success) {
    throw new McpError(
      JsonRpcErrorCode.InvalidRequest,
      `Snapchat rejected the ${operation}: ${first.error ?? "unknown error"}`,
      { subRequestError: first.error }
    );
  }
  return first.entity;
}

function extractNextCursor(response: unknown): string | undefined {
  const envelope = response as Record<string, unknown>;
  const paging = envelope["paging"] as SnapchatPaging | undefined;
  return paging?.next_link;
}

function extractTargetingDimensions(
  response: unknown,
  responseKey?: string
): Record<string, unknown>[] {
  const envelope = response as Record<string, unknown>;
  const items = envelope["targeting_dimensions"];
  if (!Array.isArray(items)) return [];

  return items
    .filter((rawItem) => {
      const item = rawItem as SnapchatSubrequest;
      const status = getSubrequestStatus(item);
      return status === undefined || status === "SUCCESS";
    })
    .map((rawItem) => {
      const item = rawItem as Record<string, unknown>;
      if (responseKey && item[responseKey] && typeof item[responseKey] === "object") {
        return item[responseKey] as Record<string, unknown>;
      }
      return item;
    });
}

/**
 * Snapchat Service — Generic CRUD operations for Snapchat Ads API v1 entities.
 *
 * Key Snapchat API patterns:
 * - ad_account_id is in URL paths (not query params or body)
 * - List paths use adAccountId or parent entity ID (e.g., campaignId for adGroups)
 * - Updates use collection-level PUT scoped by the parent resource
 * - Deletes use DELETE on entity-specific paths
 * - Pagination returns paging.next_link for the next page
 * - Create/update body wraps entity in: { <responseKey>: [{ ...data }] }
 * - Response envelope: { request_status, <responseKey>: [{ sub_request_status, <entityKey>: {...} }] }
 */
export class SnapchatService {
  private readonly rateLimiter: RateLimiter;
  /** `${entityType}:${id}` → owning ad account. Ownership never changes, so it is safe to memoize per session. */
  private readonly owningAccountCache = new Map<string, string>();

  constructor(
    private readonly httpClient: SnapchatHttpClient,
    private readonly orgId: string,
    private readonly adAccountId: string,
    rateLimiter: RateLimiter
  ) {
    this.rateLimiter = rateLimiter;
  }

  /**
   * The limiter key every call in this service draws on — the session's
   * per-user bucket (`snapchat:{principal}`, see `rate-limit-keys.ts`). The
   * bulk capacity pre-check projects against it, so another tenant's traffic
   * neither fills this bucket nor refuses this session's batch.
   */
  get quotaKey(): string {
    return snapchatQuotaKey(this.httpClient);
  }

  /**
   * Path params of the collection route an update is PUT to: the entity's own
   * parent (`ad_account_id`, `campaign_id` or `ad_squad_id` on the fetched
   * entity). A caller-supplied parent that names a different one is refused:
   * the route would name one parent while the merged body (copied from the
   * entity) names another. The caller's value is used only when the entity
   * carries no parent field.
   */
  private resolveUpdatePathParams<T extends SnapchatEntityType>(
    entityType: T,
    entityId: string,
    entity: SnapchatEntityMap[T],
    filters: Record<string, string>
  ): Record<string, string> {
    const { bodyField, pathParam } = PARENT_LINKS[entityType];
    const raw = (entity as unknown as Record<string, unknown>)[bodyField];
    const own = raw === undefined || raw === null || raw === "" ? undefined : String(raw);
    const given = filters[pathParam];

    if (own !== undefined && given !== undefined && own !== given) {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `${getEntityConfig(entityType).displayName} ${entityId} belongs to ${bodyField} '${own}', ` +
          `not ${pathParam} '${given}'. An update is sent to its own parent's route; ` +
          `pass ${pathParam} '${own}' (or update it in a separate call).`
      );
    }

    const parentId = own ?? given ?? (pathParam === "adAccountId" ? this.adAccountId : undefined);
    if (parentId === undefined) {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `${getEntityConfig(entityType).displayName} ${entityId} carries no ${bodyField}; pass ${pathParam}.`
      );
    }
    return { [pathParam]: parentId };
  }

  private async buildMergedUpdateItem<T extends SnapchatEntityType>(
    entityType: T,
    entityId: string,
    data: Record<string, unknown>,
    filters: Record<string, string>,
    context?: RequestContext
  ): Promise<{ mergedItem: Record<string, unknown>; pathParams: Record<string, string> }> {
    const currentEntity = await this.getEntity(entityType, entityId, context);
    const pathParams = this.resolveUpdatePathParams(entityType, entityId, currentEntity, filters);
    const mergedItem: Record<string, unknown> = {
      ...(currentEntity as unknown as Record<string, unknown>),
      ...data,
      id: entityId,
    };

    // The route is the entity's own parent (resolveUpdatePathParams), but the
    // body's parent field can still differ when `data` patches it: an update
    // cannot move an entity to another parent through this route. Refuse that
    // rather than PUT a body naming one parent into another's collection — the
    // same rule `resolveCreateTarget` applies to creates (#236).
    const { bodyField, pathParam } = PARENT_LINKS[entityType];
    const bodyParent = mergedItem[bodyField];
    const routeParent = pathParams[pathParam];
    if (
      bodyParent !== undefined &&
      bodyParent !== null &&
      bodyParent !== "" &&
      routeParent !== undefined &&
      String(bodyParent) !== routeParent
    ) {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `${getEntityConfig(entityType).displayName} ${entityId} has ${bodyField} '${String(bodyParent)}', ` +
          `but its update is sent to ${pathParam} '${routeParent}'. An update cannot move it to another ` +
          `parent; leave ${bodyField} out of data.`
      );
    }

    return { mergedItem, pathParams };
  }

  /**
   * Resolve the create route's path params and inject the parent-link field into
   * every item, so the body carries the same parent the route is scoped by:
   * `ad_account_id` (campaign, creative), `campaign_id` (adGroup) or
   * `ad_squad_id` (ad). The parent comes from the tool's top-level param; when
   * that is absent it may come from the items' own field. A disagreement between
   * the two — or between items — is refused rather than sent, since the route
   * and the body would name different parents.
   */
  private resolveCreateTarget(
    entityType: SnapchatEntityType,
    filters: Record<string, string>,
    items: Record<string, unknown>[]
  ): { pathParams: Record<string, string>; items: Record<string, unknown>[] } {
    const { bodyField, pathParam } = PARENT_LINKS[entityType];
    const displayName = getEntityConfig(entityType).displayName;

    let parentId: string | undefined =
      pathParam === "adAccountId" ? (filters.adAccountId ?? this.adAccountId) : filters[pathParam];
    const source = parentId !== undefined ? `${pathParam} '${parentId}'` : undefined;

    items.forEach((item, i) => {
      const raw = item[bodyField];
      if (raw === undefined || raw === null || raw === "") return;
      const value = String(raw);
      if (parentId === undefined) {
        parentId = value;
        return;
      }
      if (value !== parentId) {
        const where = items.length > 1 ? `items[${i}].${bodyField}` : `data.${bodyField}`;
        throw new McpError(
          JsonRpcErrorCode.InvalidParams,
          `${where} '${value}' does not match ${source ?? `${bodyField} '${parentId}'`}. ` +
            `A ${displayName} is created under exactly one parent; omit ${bodyField} from the data to have it filled in.`
        );
      }
    });

    if (!parentId) {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `${pathParam} is required to create a ${displayName} (it selects the parent collection route and is injected as ${bodyField}).`
      );
    }

    const resolvedParentId = parentId;
    return {
      pathParams: {
        adAccountId: filters.adAccountId ?? this.adAccountId,
        [pathParam]: resolvedParentId,
      },
      items: items.map((item) => ({ ...item, [bodyField]: resolvedParentId })),
    };
  }

  /**
   * For adGroup/ad creates, verify the parent (campaign / ad squad) named in the
   * route belongs to the session's bound ad account. Campaign and creative
   * creates are scoped by the ad account itself, which the tool layer already
   * asserts via `assertAccountScope`.
   */
  private async assertParentInBoundAccount(
    entityType: SnapchatEntityType,
    pathParams: Record<string, string>,
    context?: RequestContext
  ): Promise<void> {
    const parentType = PARENT_ENTITY_TYPE[entityType];
    if (!parentType) return;
    const parentId = pathParams[PARENT_LINKS[entityType].pathParam];
    if (parentId) await this.getEntity(parentType, parentId, context);
  }

  /**
   * Resolve the ad account an entity belongs to: its own `ad_account_id` when
   * present, otherwise by walking up the parent chain (ad → ad squad →
   * campaign). Returns undefined when no linking field is present, which the
   * caller treats as "cannot determine" (best-effort, never a false refusal).
   */
  private async resolveOwningAccount(
    entityType: SnapchatEntityType,
    entity: Record<string, unknown>,
    context?: RequestContext
  ): Promise<string | undefined> {
    const direct = entity["ad_account_id"];
    if (typeof direct === "string" && direct !== "") return direct;

    const parentType = PARENT_ENTITY_TYPE[entityType];
    const parentId = entity[PARENT_LINKS[entityType].bodyField];
    if (!parentType || typeof parentId !== "string" || parentId === "") return undefined;

    const cacheKey = `${parentType}:${parentId}`;
    const cached = this.owningAccountCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const parent = (await this.fetchEntity(parentType, parentId, context)) as unknown as Record<
      string,
      unknown
    >;
    const account = await this.resolveOwningAccount(parentType, parent, context);
    if (account !== undefined) this.owningAccountCache.set(cacheKey, account);
    return account;
  }

  /**
   * Refuse an entity that demonstrably belongs to a different ad account than
   * the one this session is bound to. Snapchat's entity-ID routes
   * (`/v1/campaigns/{id}`, `/v1/adsquads/{id}`, …) carry no ad account, so a
   * token with access to several accounts could otherwise read, update,
   * duplicate or delete outside the bound account even though every tool
   * asserts its `adAccountId` input.
   */
  private async assertInBoundAccount(
    entityType: SnapchatEntityType,
    entityId: string,
    entity: Record<string, unknown>,
    context?: RequestContext
  ): Promise<void> {
    if (!this.adAccountId || !entity || typeof entity !== "object") return;
    const account = await this.resolveOwningAccount(entityType, entity, context);
    if (account === undefined) return;
    this.owningAccountCache.set(`${entityType}:${entityId}`, account);
    if (account !== this.adAccountId) {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `${getEntityConfig(entityType).displayName} ${entityId} belongs to ad account '${account}', not this session's ad account '${this.adAccountId}'. This session is bound to a single ad account.`
      );
    }
  }

  // ─── Media uploads ──────────────────────────────────────────────
  //
  // The upload tools used to reach the HTTP client through a `client` getter,
  // so the media create, the binary upload and every status poll bypassed the
  // limiter (#237, snapchat #21). These draw from the session's entity bucket
  // like every other call: the two POSTs as writes, each poll as a read. The
  // getter is gone so no tool can bypass the limiter again.

  /** `POST /v1/adaccounts/{adAccountId}/media` — create one media entity. */
  async createMedia(
    adAccountId: string,
    media: { name: string; type: "IMAGE" | "VIDEO" },
    context?: RequestContext
  ): Promise<SnapchatMediaUploadResponse> {
    await consumeSnapchatQuota(this.rateLimiter, this.httpClient, SNAPCHAT_WRITE_TOKENS);
    return (await this.httpClient.post(
      `/v1/adaccounts/${adAccountId}/media`,
      { media: [{ ...media, ad_account_id: adAccountId }] },
      context
    )) as SnapchatMediaUploadResponse;
  }

  /** `POST /v1/media/{mediaId}/upload` — the binary, as multipart field `file`. */
  async uploadMediaFile(
    mediaId: string,
    file: { buffer: Buffer; filename: string; contentType: string },
    context?: RequestContext
  ): Promise<void> {
    await consumeSnapchatQuota(this.rateLimiter, this.httpClient, SNAPCHAT_WRITE_TOKENS);
    await this.httpClient.postMultipart(
      `/v1/media/${mediaId}/upload`,
      {},
      "file",
      file.buffer,
      file.filename,
      file.contentType,
      context
    );
  }

  /** `GET /v1/media/{mediaId}` — one status poll. */
  async getMedia(mediaId: string, context?: RequestContext): Promise<SnapchatMediaGetResponse> {
    await consumeSnapchatQuota(this.rateLimiter, this.httpClient);
    return (await this.httpClient.get(
      `/v1/media/${mediaId}`,
      undefined,
      context
    )) as SnapchatMediaGetResponse;
  }

  // ─── Standard CRUD ──────────────────────────────────────────────

  async listEntities<T extends SnapchatEntityType>(
    entityType: T,
    filters?: Record<string, string>,
    cursor?: string,
    context?: RequestContext
  ): Promise<{ entities: SnapchatEntityMap[T][]; nextCursor?: string }> {
    await consumeSnapchatQuota(this.rateLimiter, this.httpClient);

    const config = getEntityConfig(entityType);

    const pathParams: Record<string, string> = {
      adAccountId: filters?.adAccountId ?? this.adAccountId,
      ...(filters?.campaignId ? { campaignId: filters.campaignId } : {}),
      ...(filters?.adSquadId ? { adSquadId: filters.adSquadId } : {}),
    };

    const interpolatedPath = interpolatePath(config.listPath, pathParams);

    const response = cursor?.startsWith("http")
      ? await this.httpClient.get(cursor, {}, context)
      : await this.httpClient.get(interpolatedPath, cursor ? { cursor } : {}, context);
    const entities = unwrapEntities(
      config.responseKey,
      config.entityKey,
      response
    ) as SnapchatEntityMap[T][];
    const nextCursor = extractNextCursor(response);

    return { entities, nextCursor };
  }

  /**
   * Get one entity by ID. The entity-specific GET path carries no ad account, so
   * the fetched entity is checked against the session's bound ad account (see
   * `assertInBoundAccount`) before it is returned — every read-modify-write,
   * duplicate, delete and dry-run path reads through here.
   */
  async getEntity<T extends SnapchatEntityType>(
    entityType: T,
    entityId: string,
    context?: RequestContext
  ): Promise<SnapchatEntityMap[T]> {
    const entity = await this.fetchEntity(entityType, entityId, context);
    await this.assertInBoundAccount(
      entityType,
      entityId,
      entity as unknown as Record<string, unknown>,
      context
    );
    return entity;
  }

  /** Raw GET by ID — no account-ownership check. Internal (parent-chain walks). */
  private async fetchEntity<T extends SnapchatEntityType>(
    entityType: T,
    entityId: string,
    context?: RequestContext
  ): Promise<SnapchatEntityMap[T]> {
    await consumeSnapchatQuota(this.rateLimiter, this.httpClient);

    const config = getEntityConfig(entityType);
    const interpolatedPath = interpolatePath(config.getPath, { entityId });

    const response = await this.httpClient.get(interpolatedPath, undefined, context);

    const entity = unwrapSingleEntity(config.responseKey, config.entityKey, response);
    if (!entity) {
      throw new McpError(
        JsonRpcErrorCode.NotFound,
        `${config.displayName} with ID ${entityId} not found`
      );
    }

    return entity as SnapchatEntityMap[T];
  }

  async createEntity<T extends SnapchatEntityType>(
    entityType: T,
    filters: Record<string, string>,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<SnapchatEntityMap[T]> {
    const config = getEntityConfig(entityType);
    const { pathParams, items } = this.resolveCreateTarget(entityType, filters, [data]);
    await this.assertParentInBoundAccount(entityType, pathParams, context);

    await consumeSnapchatQuota(this.rateLimiter, this.httpClient, SNAPCHAT_WRITE_TOKENS);

    const interpolatedPath = interpolatePath(config.createPath, pathParams);

    const body = { [config.responseKey]: items };
    const response = await this.httpClient.post(interpolatedPath, body, context);

    return unwrapSingleWriteResult(
      config.responseKey,
      config.entityKey,
      response,
      `${config.displayName} create`
    ) as SnapchatEntityMap[T];
  }

  /**
   * Duplicate an entity via the client-side read+create clone pattern (Snapchat
   * has no native copy endpoint). Reads the source, strips system-managed
   * fields, then creates a fresh copy. Only entity types whose create endpoint
   * needs no extra parent ID (campaign) are duplicable — enforced client-side.
   */
  async duplicateEntity(
    entityType: SnapchatEntityType,
    filters: Record<string, string>,
    entityId: string,
    options?: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
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

    // Always PAUSED: a copy of a live campaign must not spend at once.
    const { body } = buildSnapchatDuplicateCopy(source, options);

    return this.createEntity(entityType, filters, body, context);
  }

  async updateEntity<T extends SnapchatEntityType>(
    entityType: T,
    entityId: string,
    filters: Record<string, string>,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<SnapchatEntityMap[T]> {
    const config = getEntityConfig(entityType);

    await consumeSnapchatQuota(this.rateLimiter, this.httpClient, SNAPCHAT_WRITE_TOKENS);

    const { mergedItem, pathParams } = await this.buildMergedUpdateItem(
      entityType,
      entityId,
      data,
      filters,
      context
    );
    const interpolatedPath = interpolatePath(config.updatePath, pathParams);
    const body = { [config.responseKey]: [mergedItem] };
    const response = await this.httpClient.put(interpolatedPath, body, context);

    return unwrapSingleWriteResult(
      config.responseKey,
      config.entityKey,
      response,
      `${config.displayName} ${entityId} update`
    ) as SnapchatEntityMap[T];
  }

  async deleteEntity(
    entityType: SnapchatEntityType,
    entityId: string,
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);

    // Pre-read so the ownership check runs before an irreversible DELETE: the
    // entity-specific path carries no ad account, so without it any entity the
    // token can reach would be deletable from a session bound to another account.
    await this.getEntity(entityType, entityId, context);

    await consumeSnapchatQuota(this.rateLimiter, this.httpClient, SNAPCHAT_WRITE_TOKENS);

    const interpolatedPath = interpolatePath(config.deletePath, { entityId });
    return this.httpClient.delete(interpolatedPath, undefined, context);
  }

  async updateEntityStatus<T extends SnapchatEntityType>(
    entityType: T,
    entityId: string,
    status: "ACTIVE" | "PAUSED",
    filters: Record<string, string> = {},
    context?: RequestContext
  ): Promise<SnapchatEntityMap[T]> {
    return this.updateEntity(entityType, entityId, filters, { status }, context);
  }

  // ─── Advertiser Account ──────────────────────────────────────────

  async listAdAccounts(
    params: { cursor?: string; limit?: number } = {},
    context?: RequestContext
  ): Promise<{ entities: SnapchatAdAccount[]; nextCursor?: string }> {
    await consumeSnapchatQuota(this.rateLimiter, this.httpClient);

    // Snapchat returns an absolute `next_link` URL as its cursor; follow it verbatim
    // when supplied, otherwise hit the base endpoint with an optional `limit`.
    const query: Record<string, string> = {};
    if (params.limit !== undefined) query.limit = String(params.limit);
    const response = params.cursor?.startsWith("http")
      ? await this.httpClient.get(params.cursor, {}, context)
      : await this.httpClient.get(`/v1/organizations/${this.orgId}/adaccounts`, query, context);
    const entities = unwrapEntities("adaccounts", "adaccount", response) as SnapchatAdAccount[];
    const nextCursor = extractNextCursor(response);

    return { entities, nextCursor };
  }

  // ─── Bid Adjustment ─────────────────────────────────────────────

  async adjustBids(
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
        // Read current ad group state
        const entity = await this.getEntity("adGroup", adjustment.adGroupId, context);
        const previousBid = entity.bid_micro != null ? entity.bid_micro / 1_000_000 : undefined;

        // Update bid — convert currency to micros (Snapchat stores bids in micro-currency)
        const bidMicro = Math.round(adjustment.bidPrice * 1_000_000);
        await this.updateEntity(
          "adGroup",
          adjustment.adGroupId,
          {},
          {
            bid_micro: bidMicro,
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
    entityType: SnapchatEntityType,
    filters: Record<string, string>,
    items: Record<string, unknown>[],
    context?: RequestContext
  ): Promise<{ results: Array<{ success: boolean; entity?: unknown; error?: string }> }> {
    const config = getEntityConfig(entityType);
    const { pathParams, items: bodyItems } = this.resolveCreateTarget(entityType, filters, items);
    await this.assertParentInBoundAccount(entityType, pathParams, context);

    await consumeSnapchatQuota(this.rateLimiter, this.httpClient, SNAPCHAT_WRITE_TOKENS);

    const interpolatedPath = interpolatePath(config.createPath, pathParams);

    const body = { [config.responseKey]: bodyItems };
    const response = await this.httpClient.post(interpolatedPath, body, context);
    const bulkResults = unwrapBulkResults(config.responseKey, config.entityKey, response);

    return {
      results: items.map(
        (_, i) => bulkResults[i] ?? { success: false, error: `No result returned for item ${i}` }
      ),
    };
  }

  async bulkUpdateEntities(
    entityType: SnapchatEntityType,
    filters: Record<string, string>,
    items: Array<{ entityId: string; data: Record<string, unknown> }>,
    context?: RequestContext
  ): Promise<{ results: Array<{ entityId: string; success: boolean; error?: string }> }> {
    const config = getEntityConfig(entityType);

    // The first PUT's tokens are taken before the reads, as the bulk capacity
    // model (`snapchatBulkCost.bulkUpdate`, leading consume) projects.
    await consumeSnapchatQuota(this.rateLimiter, this.httpClient, SNAPCHAT_WRITE_TOKENS);

    // Every item is read (and its parent resolved) before anything is written,
    // so a parent mismatch refuses the whole batch with nothing sent.
    const mergedItems = await Promise.all(
      items.map(async (item) => {
        const { mergedItem, pathParams } = await this.buildMergedUpdateItem(
          entityType,
          item.entityId,
          item.data,
          filters,
          context
        );
        return { mergedItem, pathParams };
      })
    );

    // The update route is the parent's collection, so items under different
    // parents (possible only when no parent filter is given; every tool passes
    // one) go out as one PUT per parent instead of all to the first item's
    // route. Each PUT after the first takes its own write tokens.
    const groups = new Map<string, number[]>();
    mergedItems.forEach((item, i) => {
      const path = interpolatePath(config.updatePath, item.pathParams);
      groups.set(path, [...(groups.get(path) ?? []), i]);
    });

    const outcomes: Array<{ success: boolean; error?: string } | undefined> = [];
    let firstPut = true;
    for (const [collectionPath, indices] of groups) {
      if (!firstPut) {
        await consumeSnapchatQuota(this.rateLimiter, this.httpClient, SNAPCHAT_WRITE_TOKENS);
      }
      firstPut = false;
      const body = {
        [config.responseKey]: indices.map((i) => mergedItems[i]?.mergedItem),
      };
      const response = await this.httpClient.put(collectionPath, body, context);
      const bulkResults = unwrapBulkResults(config.responseKey, config.entityKey, response);
      indices.forEach((itemIndex, position) => {
        outcomes[itemIndex] = bulkResults[position];
      });
    }

    return {
      results: items.map((item, i) => {
        const r = outcomes[i];
        return {
          entityId: item.entityId,
          success: r?.success ?? false,
          error: r?.success ? undefined : (r?.error ?? `No result returned for ${item.entityId}`),
        };
      }),
    };
  }

  async bulkUpdateStatus(
    entityType: SnapchatEntityType,
    filters: Record<string, string>,
    entityIds: string[],
    status: "ACTIVE" | "PAUSED",
    context?: RequestContext
  ): Promise<{ results: Array<{ entityId: string; success: boolean; error?: string }> }> {
    return this.bulkUpdateEntities(
      entityType,
      filters,
      entityIds.map((entityId) => ({ entityId, data: { status } })),
      context
    );
  }

  // ─── Targeting ───────────────────────────────────────────────────

  /**
   * Keyword search over a targeting endpoint. Snapchat has no server-side search
   * for these lists, so the pages are fetched and filtered client-side. With a
   * query, pages are followed via `next_link` (up to MAX_TARGETING_SEARCH_PAGES)
   * until `limit` matches are found; `searchedAllPages` reports whether the scan
   * reached the last page, so a short result is never mistaken for "no match".
   */
  async searchTargeting(
    targetingType: string,
    countryCode: string | undefined,
    query?: string,
    limit = 20,
    context?: RequestContext
  ): Promise<{
    results: Record<string, unknown>[];
    nextCursor?: string;
    pagesScanned: number;
    searchedAllPages: boolean;
  }> {
    const normalizedQuery = query?.trim().toLowerCase();

    if (!normalizedQuery) {
      const response = await this.getTargetingOptions(
        targetingType,
        countryCode,
        limit,
        undefined,
        context
      );
      return {
        results: response.results.slice(0, limit),
        nextCursor: response.nextCursor,
        pagesScanned: 1,
        searchedAllPages: !response.nextCursor,
      };
    }

    const matches: Record<string, unknown>[] = [];
    let cursor: string | undefined;
    let pagesScanned = 0;
    do {
      const page = await this.getTargetingOptions(
        targetingType,
        countryCode,
        TARGETING_SEARCH_PAGE_SIZE,
        cursor,
        context
      );
      pagesScanned += 1;
      for (const item of page.results) {
        if (JSON.stringify(item).toLowerCase().includes(normalizedQuery)) matches.push(item);
      }
      cursor = page.nextCursor;
    } while (cursor && matches.length < limit && pagesScanned < MAX_TARGETING_SEARCH_PAGES);

    return {
      results: matches.slice(0, limit),
      nextCursor: cursor,
      pagesScanned,
      searchedAllPages: !cursor,
    };
  }

  async getTargetingOptions(
    targetingType = "country_support",
    countryCode?: string,
    limit = 50,
    cursor?: string,
    context?: RequestContext
  ): Promise<{ results: Record<string, unknown>[]; nextCursor?: string }> {
    await consumeSnapchatQuota(this.rateLimiter, this.httpClient);

    const config = TARGETING_ENDPOINTS[targetingType];
    if (!config) {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `Unsupported Snapchat targeting type: ${targetingType}`
      );
    }
    if (config.requiresCountryCode && !countryCode) {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `Targeting type ${targetingType} requires countryCode`
      );
    }

    const path = interpolatePath(config.path, {
      countryCode: countryCode?.toLowerCase() ?? "",
    });
    const params: Record<string, string> = {};
    if (countryCode) {
      params.country_code = countryCode.toLowerCase();
    }
    if (targetingType.startsWith("interests_")) {
      params.limit = String(Math.max(50, Math.min(limit, 1000)));
    } else if (targetingType === "geo_postal_code") {
      params.limit = String(Math.max(10, Math.min(limit, 10000)));
    }

    // Snapchat returns an absolute `next_link` URL as its cursor; follow it
    // verbatim when supplied (query params are already baked into that URL),
    // otherwise hit the base endpoint with the derived params.
    const response = cursor?.startsWith("http")
      ? await this.httpClient.get(cursor, {}, context)
      : await this.httpClient.get(path, params, context);

    if (targetingType === "country_support") {
      return {
        results: [response as Record<string, unknown>],
        nextCursor: extractNextCursor(response),
      };
    }

    return {
      results: extractTargetingDimensions(response, config.responseKey),
      nextCursor: extractNextCursor(response),
    };
  }

  // ─── Audience Estimate ──────────────────────────────────────────

  async getAudienceEstimate(
    targetingConfig: Record<string, unknown>,
    adAccountId?: string,
    context?: RequestContext
  ): Promise<unknown> {
    await consumeSnapchatQuota(this.rateLimiter, this.httpClient);

    const effectiveAdAccountId = adAccountId ?? this.adAccountId;
    return this.httpClient.post(
      `/v1/adaccounts/${effectiveAdAccountId}/audience_size_v2`,
      targetingConfig,
      context
    );
  }

  // ─── Ad Previews ────────────────────────────────────────────────

  async getCreativePreview(creativeId: string, context?: RequestContext): Promise<unknown> {
    // Ownership check first — the preview path is keyed by creative ID alone.
    await this.getEntity("creative", creativeId, context);
    await consumeSnapchatQuota(this.rateLimiter, this.httpClient);
    return this.httpClient.get(`/v1/creatives/${creativeId}/creative_preview`, undefined, context);
  }
}
