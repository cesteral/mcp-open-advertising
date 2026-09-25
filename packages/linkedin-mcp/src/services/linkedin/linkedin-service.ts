// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { LinkedInHttpClient } from "./linkedin-http-client.js";
import type { RestliQueryValue } from "./restli-query.js";
import type { RateLimiter } from "@cesteral/shared";
import { type RequestContext, executeBulkConcurrent } from "@cesteral/shared";
import { McpError, JsonRpcErrorCode } from "@cesteral/shared";
import {
  getEntityConfig,
  type LinkedInEntityType,
  adAccountIdFromUrn,
} from "../../mcp-server/tools/utils/entity-mapping.js";
import type {
  LinkedInAdAccount,
  LinkedInCampaignGroup,
  LinkedInCampaign,
  LinkedInCreative,
  LinkedInConversionRule,
  LinkedInElementsResponse,
  CreateLinkedInCampaignGroupRequest,
  CreateLinkedInCampaignRequest,
  CreateLinkedInCreativeRequest,
} from "./types.js";

export type {
  LinkedInAdAccount,
  LinkedInCampaignGroup,
  LinkedInCampaign,
  LinkedInCreative,
  LinkedInConversionRule,
  CreateLinkedInCampaignGroupRequest,
  CreateLinkedInCampaignRequest,
  CreateLinkedInCreativeRequest,
};

interface LinkedInEntityMap {
  adAccount: LinkedInAdAccount;
  campaignGroup: LinkedInCampaignGroup;
  campaign: LinkedInCampaign;
  creative: LinkedInCreative;
  conversionRule: LinkedInConversionRule;
}

type LinkedInCreateEntityInputMap = {
  adAccount: Record<string, unknown>; // not typically created via API
  campaignGroup: CreateLinkedInCampaignGroupRequest;
  campaign: CreateLinkedInCampaignRequest;
  creative: CreateLinkedInCreativeRequest;
  conversionRule: Record<string, unknown>;
};

type LinkedInUpdateEntityInputMap = {
  [K in LinkedInEntityType]: Partial<LinkedInEntityMap[K]> & Record<string, unknown>;
};

/**
 * LinkedIn Service — Generic CRUD operations for LinkedIn Ads entities,
 * plus bulk operations and targeting search.
 *
 * Uses entity-mapping.ts for API path construction and LinkedInHttpClient
 * for authenticated HTTP calls with retry logic.
 *
 * LinkedIn API uses URN IDs like urn:li:sponsoredAccount:123.
 * These must be URL-encoded when used in path segments.
 */
export class LinkedInService {
  constructor(
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: LinkedInHttpClient
  ) {}

  /** Expose the underlying HTTP client for direct use (e.g., media uploads). */
  get client(): LinkedInHttpClient {
    return this.httpClient;
  }

  // ─── Standard CRUD ─────────────────────────────────────────────────

  async listEntities<T extends LinkedInEntityType>(
    entityType: T,
    adAccountUrn?: string,
    start?: number,
    count?: number,
    context?: RequestContext
  ): Promise<{ entities: LinkedInEntityMap[T][]; total?: number; start?: number }> {
    const config = getEntityConfig(entityType);

    await this.rateLimiter.consume(`linkedin:${adAccountUrn ?? "default"}`);

    const params: Record<string, RestliQueryValue> = {
      q: "search",
      start: String(start ?? 0),
      count: String(Math.min(count ?? 25, 100)),
    };

    // Under /rest/ the ad account lives in the PATH; under the legacy /v2/
    // surface it is a query parameter. entity-mapping.ts owns which is which.
    // A `list` param is sent as a one-element Rest.li 2.0 `List(...)`.
    if (adAccountUrn && config.listScopingParam) {
      const { name, list } = config.listScopingParam;
      params[name] = list ? [adAccountUrn] : adAccountUrn;
    }

    const path = config.collectionPath(
      config.accountScoped && adAccountUrn ? adAccountIdFromUrn(adAccountUrn) : undefined
    );

    const result = (await this.httpClient.get(path, params, context)) as LinkedInElementsResponse<
      LinkedInEntityMap[T]
    >;

    return {
      entities: result.elements ?? [],
      total: result.paging?.total,
      start: result.paging?.start,
    };
  }

  async getEntity<T extends LinkedInEntityType>(
    entityType: T,
    entityUrn: string,
    context?: RequestContext
  ): Promise<LinkedInEntityMap[T]> {
    await this.rateLimiter.consume(`linkedin:default`);

    return this.httpClient.get(
      this.entityItemPath(entityType, entityUrn),
      undefined,
      context
    ) as Promise<LinkedInEntityMap[T]>;
  }

  async createEntity<T extends LinkedInEntityType>(
    entityType: T,
    data: LinkedInCreateEntityInputMap[T],
    context?: RequestContext
  ): Promise<LinkedInEntityMap[T]> {
    const config = getEntityConfig(entityType);

    // Writes consume 3x rate limit tokens
    await this.rateLimiter.consume(`linkedin:default`, 3);

    // A create payload for an account-scoped entity carries the owning account,
    // so the path can be built without adding a parameter to the tool schema.
    const payload = data as unknown as Record<string, unknown>;
    const path = config.collectionPath(
      config.accountScoped
        ? adAccountIdFromUrn(requireAccountInPayload(payload, entityType))
        : undefined
    );

    return this.httpClient.post(path, payload, context) as Promise<LinkedInEntityMap[T]>;
  }

  async updateEntity<T extends LinkedInEntityType>(
    entityType: T,
    entityUrn: string,
    data: LinkedInUpdateEntityInputMap[T],
    context?: RequestContext
  ): Promise<LinkedInEntityMap[T]> {
    // Writes consume 3x rate limit tokens
    await this.rateLimiter.consume(`linkedin:default`, 3);

    return this.httpClient.patch(
      this.entityItemPath(entityType, entityUrn),
      data as unknown as Record<string, unknown>,
      context
    ) as Promise<LinkedInEntityMap[T]>;
  }

  async deleteEntity(
    entityType: LinkedInEntityType,
    entityUrn: string,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`linkedin:default`, 3);

    return this.httpClient.delete(this.entityItemPath(entityType, entityUrn), context);
  }

  // ─── Ad Accounts ───────────────────────────────────────────────────

  /**
   * List ad accounts accessible to the authenticated user.
   */
  async listAdAccounts(
    start?: number,
    count?: number,
    context?: RequestContext
  ): Promise<{ accounts: LinkedInAdAccount[]; total?: number }> {
    await this.rateLimiter.consume(`linkedin:default`);

    const params: Record<string, string> = {
      q: "search",
      start: String(start ?? 0),
      count: String(Math.min(count ?? 25, 100)),
    };

    const result = (await this.httpClient.get(
      "/rest/adAccounts",
      params,
      context
    )) as LinkedInElementsResponse<LinkedInAdAccount>;

    return {
      accounts: result.elements ?? [],
      total: result.paging?.total,
    };
  }

  // ─── Bulk Operations ──────────────────────────────────────────────

  /**
   * Bulk update entity statuses.
   * Each entity is updated individually with concurrency limit.
   */
  async bulkUpdateStatus(
    entityType: LinkedInEntityType,
    entityUrns: string[],
    status: string,
    context?: RequestContext
  ): Promise<{ results: Array<{ entityUrn: string; success: boolean; error?: string }> }> {
    const bulkResults = await executeBulkConcurrent(entityUrns, async (entityUrn) => {
      return this.updateEntity(entityType, entityUrn, { status }, context);
    });

    return {
      results: bulkResults.map((r, i) => ({
        entityUrn: entityUrns[i],
        success: r.success,
        error: r.error,
      })),
    };
  }

  /**
   * Bulk create entities of the same type.
   * Sends individual create calls with concurrency limit.
   */
  async bulkCreateEntities<T extends LinkedInEntityType>(
    entityType: T,
    items: LinkedInCreateEntityInputMap[T][],
    context?: RequestContext
  ): Promise<{
    results: Array<{ success: boolean; entity?: LinkedInEntityMap[T]; error?: string }>;
  }> {
    const results = await executeBulkConcurrent(items, async (data) => {
      return this.createEntity(entityType, data, context);
    });
    return { results };
  }

  /**
   * Bulk update entities with arbitrary data.
   * Each item is updated individually with concurrency limit.
   */
  async bulkUpdateEntities<T extends LinkedInEntityType>(
    entityType: T,
    items: Array<{ entityUrn: string; data: LinkedInUpdateEntityInputMap[T] }>,
    context?: RequestContext
  ): Promise<{ results: Array<{ entityUrn: string; success: boolean; error?: string }> }> {
    const bulkResults = await executeBulkConcurrent(items, async (item) => {
      return this.updateEntity(entityType, item.entityUrn, item.data, context);
    });

    return {
      results: bulkResults.map((r, i) => ({
        entityUrn: items[i].entityUrn,
        success: r.success,
        error: r.error,
      })),
    };
  }

  // ─── Bid Adjustments ──────────────────────────────────────────────

  /**
   * Adjust bids for campaigns via read-modify-write.
   */
  async adjustBids(
    adjustments: Array<{ campaignUrn: string; bidAmount: Record<string, unknown> }>,
    context?: RequestContext
  ): Promise<{ results: Array<{ campaignUrn: string; success: boolean; error?: string }> }> {
    const results: Array<{ campaignUrn: string; success: boolean; error?: string }> = [];

    for (const adjustment of adjustments) {
      try {
        await this.updateEntity(
          "campaign",
          adjustment.campaignUrn,
          { unitCost: adjustment.bidAmount } as unknown as LinkedInUpdateEntityInputMap["campaign"],
          context
        );
        results.push({ campaignUrn: adjustment.campaignUrn, success: true });
      } catch (error) {
        // Break early on rate limit errors to avoid noisy redundant failures
        if (error instanceof McpError && error.code === JsonRpcErrorCode.RateLimited) {
          results.push({
            campaignUrn: adjustment.campaignUrn,
            success: false,
            error: error.message,
          });
          // Mark remaining adjustments as skipped
          for (const remaining of adjustments.slice(adjustments.indexOf(adjustment) + 1)) {
            results.push({
              campaignUrn: remaining.campaignUrn,
              success: false,
              error: "Skipped due to rate limit",
            });
          }
          break;
        }
        results.push({
          campaignUrn: adjustment.campaignUrn,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { results };
  }

  // ─── Targeting Search ────────────────────────────────────────────

  /**
   * Search targeting facets (interests, locations, etc.).
   *
   * `/rest/adTargetingFacets` is a Rest.li collection finder and supports
   * offset-based pagination via `start`/`count`, returning a `paging` block.
   */
  async searchTargeting(
    facetType: string,
    query?: string,
    limit?: number,
    start?: number,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`linkedin:default`);

    const params: Record<string, string> = {
      q: "type",
      facetType,
      start: String(start ?? 0),
      count: String(Math.min(limit ?? 20, 100)),
    };

    if (query) {
      params.query = query;
    }

    return this.httpClient.get("/rest/adTargetingFacets", params, context);
  }

  /**
   * Browse targeting categories / facets for an ad account.
   *
   * Like `searchTargeting`, this hits the `/rest/adTargetingFacets` Rest.li
   * collection finder, which supports offset-based pagination via `start`/
   * `count` and returns a `paging` block. Large accounts can expose more
   * facets than fit in one page, so the offset is threaded through.
   */
  async getTargetingOptions(
    adAccountUrn: string,
    facetType?: string,
    start?: number,
    limit?: number,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`linkedin:default`);

    const params: Record<string, string> = {
      q: "account",
      account: adAccountUrn,
      start: String(start ?? 0),
      count: String(Math.min(limit ?? 20, 100)),
    };

    if (facetType) {
      params.facetType = facetType;
    }

    return this.httpClient.get("/rest/adTargetingFacets", params, context);
  }

  // ─── Duplicate Entity ────────────────────────────────────────────

  /**
   * Duplicate an entity by reading it and creating a copy.
   * LinkedIn does not have a native copy endpoint, so this is a manual copy.
   */
  async duplicateEntity<T extends LinkedInEntityType>(
    entityType: T,
    entityUrn: string,
    options?: { newName?: string },
    context?: RequestContext
  ): Promise<LinkedInEntityMap[T]> {
    // Read source entity
    const source = await this.getEntity(entityType, entityUrn, context);

    // Build copy payload — strip read-only fields
    const copyData: Record<string, unknown> = { ...(source as unknown as Record<string, unknown>) };
    delete copyData.id;
    delete copyData.changeAuditStamps;
    delete copyData.created;
    delete copyData.lastModified;
    delete copyData.review;
    delete copyData.servingStatuses;
    delete copyData.version;
    delete copyData.associatedEntity;

    if (options?.newName) {
      copyData.name = options.newName;
    } else if (typeof copyData.name === "string") {
      copyData.name = `Copy of ${copyData.name}`;
    }

    // Set to draft/paused status
    copyData.status = "DRAFT";

    return this.createEntity(entityType, copyData as LinkedInCreateEntityInputMap[T], context);
  }

  // ─── Delivery Forecast ────────────────────────────────────────────

  /**
   * Get delivery forecast for targeting criteria.
   */
  async getDeliveryForecast(
    adAccountUrn: string,
    targetingCriteria: Record<string, unknown>,
    optimizationTargetType?: string,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`linkedin:default`);

    const requestBody: Record<string, unknown> = {
      account: adAccountUrn,
      targetingCriteria,
    };

    if (optimizationTargetType) {
      requestBody.optimizationTargetType = optimizationTargetType;
    }

    // NOT migrated. #210 guesses /rest/adForecasts, but the versioned surface is
    // the Media Planning API and neither the resource name nor the request shape
    // is corroborated. A renamed guess that 404s is worse than a known-legacy path.
    return this.httpClient.post("/v2/adForecastsV2", requestBody, context);
  }

  // ─── Ad Previews ─────────────────────────────────────────────────

  /**
   * Get ad preview for a creative.
   */
  async getAdPreviews(
    creativeUrn: string,
    adFormat?: string,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`linkedin:default`);

    const encodedUrn = LinkedInHttpClient.encodeUrn(creativeUrn);
    const params: Record<string, string> = {};

    if (adFormat) {
      params.adFormat = adFormat;
    }

    // NOT migrated, and #210's guess is wrong: the versioned equivalent is
    // /rest/adPreviews with `action=livePreviewForCreative`/accurate-preview
    // semantics — an action POST, not a GET on a URN, so it is a call-shape
    // change rather than a re-path. Held for the same reason as creatives.
    return this.httpClient.get(`/v2/adCreativePreviews/${encodedUrn}`, params, context);
  }

  // ─── Internal Helpers ────────────────────────────────────────────

  /**
   * Path for a single entity.
   *
   * Under `/rest/` an account-scoped entity's item path is
   * `/rest/adAccounts/{accountId}/adCampaigns/{campaignId}` — the account is
   * required for GET/PATCH/DELETE too, not just for listing. A LinkedIn URN
   * (`urn:li:sponsoredCampaign:123`) does not carry its owning account, and this
   * server binds no session-level account, so there is nothing to derive it
   * from. Supplying it means a new parameter on `get`/`update`/`delete_entity`,
   * which changes their inputSchema and therefore every governed
   * `definitionHash` in this package — deliberately staged separately (#210).
   *
   * Until then these keep the legacy `/v2/` item path. They are NOT converted
   * into refusals: that `/v2/` is fully dead for these products is #210's claim
   * and it is unverified from here, so refusing would risk breaking a call that
   * still works, on our own say-so.
   *
   * `adAccount` is the exception that IS on `/rest/`, and its key is the
   * NUMERIC account id — `/rest/adAccounts/123`, not the encoded URN. LinkedIn's
   * official clients address it exactly that way against the versioned API
   * (linkedin-api-python-client README: `resource_path="/adAccounts/{id}"`,
   * `path_keys={"id": 123}`, `version_string="202212"`; its client_test expects
   * the path `/adAccounts/123`).
   */
  private entityItemPath(entityType: LinkedInEntityType, entityUrn: string): string {
    if (entityType === "adAccount") {
      return `${getEntityConfig("adAccount").collectionPath()}/${adAccountIdFromUrn(entityUrn)}`;
    }
    const encodedUrn = LinkedInHttpClient.encodeUrn(entityUrn);
    const config = getEntityConfig(entityType);
    const collection = config.accountScoped
      ? (config.legacyCollectionPath ?? config.collectionPath())
      : config.collectionPath();
    return `${collection}/${encodedUrn}`;
  }
}

/**
 * The ad account URN carried by a create payload.
 *
 * Under `/rest/` a create posts to `/rest/adAccounts/{accountId}/adCampaigns`,
 * so the account has to be known before the request is built. Campaign and
 * campaign-group payloads already carry it as `account`, which is why `create`
 * could be migrated without adding a tool parameter — unlike get/update/delete,
 * where nothing in the call supplies one.
 */
function requireAccountInPayload(
  payload: Record<string, unknown>,
  entityType: LinkedInEntityType
): string {
  const account = payload.account;
  if (typeof account === "string" && account.length > 0) return account;
  throw new McpError(
    JsonRpcErrorCode.InvalidParams,
    `Creating a ${entityType} requires an "account" URN in the payload — LinkedIn's versioned ` +
      `API posts to /rest/adAccounts/{accountId}/…, so the owning account must be known ` +
      `before the request is built. See #210.`
  );
}
