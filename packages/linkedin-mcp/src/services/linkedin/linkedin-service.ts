// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { LinkedInHttpClient } from "./linkedin-http-client.js";
import type { RestliQueryValue } from "./restli-query.js";
import {
  FACET_URN_PREFIX,
  supportedFinders,
  toFacetUrn,
  type TargetingFinder,
} from "./targeting-facets.js";
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
import type { LinkedInRegisterUploadResponse } from "../../mcp-server/tools/utils/media-types.js";

/**
 * Tokens a write draws from `linkedin:default` (a read draws 1). This is the
 * server's own cost model, not a LinkedIn figure: no LinkedIn source here
 * states per-call quota costs.
 */
export const LINKEDIN_WRITE_TOKENS = 3;

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

/** `targetingCriteria`: `{ include: { and: [{ or: { facetUrn: [values] } }] }, exclude?: { or: { facetUrn: [values] } } }`. */
export type LinkedInTargetingCriteria = {
  include: { and: Array<{ or: Record<string, string[]> }> };
  exclude?: { or: Record<string, string[]> };
};

interface TargetingEntitiesLocale {
  language: string;
  country: string;
}

/** One `/rest/adTargetingEntities` request; the finder decides which other fields apply. */
export type LinkedInTargetingEntitiesQuery =
  | { finder: "adTargetingFacet"; facet: string; locale?: TargetingEntitiesLocale }
  | {
      finder: "typeahead";
      facet: string;
      query: string;
      entityType?: string;
      locale?: TargetingEntitiesLocale;
    }
  | {
      finder: "similarEntities";
      facet: string;
      entities: readonly string[];
      entityType?: string;
      locale?: TargetingEntitiesLocale;
    }
  | { finder: "urns"; urns: readonly string[]; locale?: TargetingEntitiesLocale };

type LinkedInMoney = { amount: string; currencyCode: string };

/** A `/rest/adSupplyForecasts?q=criteriaV2` request. */
export interface LinkedInAdSupplyForecastQuery {
  account: string;
  campaignType: string;
  /** Epoch milliseconds; `start` must be in the future. */
  timeRange: { start: number; end: number };
  targetingCriteria: LinkedInTargetingCriteria;
  dailyBudget?: LinkedInMoney;
  totalBudget?: LinkedInMoney;
  competingBid?: { bidType: string; bidPrice: LinkedInMoney };
  optimizationTarget?: string;
  campaign?: string;
  creativeType?: string;
  objectiveType?: string;
  enableAudienceNetwork?: boolean;
  enableAudienceExpansion?: boolean;
  connectedTelevisionOnly?: boolean;
  targetCost?: string;
  costCap?: string;
}

const FINDER_ADVICE: Record<TargetingFinder, string> = {
  adTargetingFacet: "browse it (no `query`)",
  typeahead: "search it with a `query`",
  similarEntities: "find similar entities from seed `entities`",
};

function assertFinderSupported(finder: TargetingFinder, facetName: string): void {
  const supported = supportedFinders(facetName);
  if (supported === undefined || supported.includes(finder)) return;
  const advice =
    supported.length === 0
      ? "LinkedIn lists no entity discovery for it"
      : `LinkedIn lists these finders for it: ${supported.map((f) => `${f} (${FINDER_ADVICE[f]})`).join("; ")}`;
  throw new McpError(
    JsonRpcErrorCode.InvalidParams,
    `The ${facetName} facet does not support the ${finder} finder. ${advice}.`
  );
}

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

  // ─── Media uploads ─────────────────────────────────────────────────
  //
  // The upload tools used to reach the HTTP client through a `client` getter,
  // so the registerUpload POST and the binary PUT drew no limiter token. These
  // draw from `linkedin:default` like every other call: both are writes, at
  // LINKEDIN_WRITE_TOKENS, the server's own cost (no LinkedIn source states
  // one). The flow has no status poll. The getter is gone so no tool can
  // bypass the limiter again.

  /** `POST /v2/assets?action=registerUpload` — register one ads asset upload. */
  async registerAssetUpload(
    ownerUrn: string,
    recipe: "urn:li:digitalmediaRecipe:ads-image" | "urn:li:digitalmediaRecipe:ads-video",
    context?: RequestContext
  ): Promise<LinkedInRegisterUploadResponse> {
    await this.rateLimiter.consume(`linkedin:default`, LINKEDIN_WRITE_TOKENS);
    return (await this.httpClient.post(
      "/v2/assets?action=registerUpload",
      {
        registerUploadRequest: {
          owner: ownerUrn,
          recipes: [recipe],
          serviceRelationships: [
            {
              identifier: "urn:li:userGeneratedContent",
              relationshipType: "OWNER",
            },
          ],
        },
      },
      context
    )) as LinkedInRegisterUploadResponse;
  }

  /** `PUT {uploadUrl}` — the binary, to the URL registerUpload returned. */
  async uploadAssetBinary(
    uploadUrl: string,
    buffer: Buffer,
    contentType: string,
    context?: RequestContext
  ): Promise<void> {
    await this.rateLimiter.consume(`linkedin:default`, LINKEDIN_WRITE_TOKENS);
    await this.httpClient.putBinary(uploadUrl, buffer, contentType, context);
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

    await this.rateLimiter.consume(`linkedin:default`, LINKEDIN_WRITE_TOKENS);

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
    await this.rateLimiter.consume(`linkedin:default`, LINKEDIN_WRITE_TOKENS);

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
    await this.rateLimiter.consume(`linkedin:default`, LINKEDIN_WRITE_TOKENS);

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

  // ─── Targeting ───────────────────────────────────────────────────

  /**
   * The facet descriptors LinkedIn offers for targeting.
   *
   * `GET /rest/adTargetingFacets` is a plain GET: no finder, no parameters, no
   * account. Each element carries `facetName`, `availableEntityFinders`,
   * `entityTypes` and `adTargetingFacetUrn` (Ad Targeting page, read 2026-10-01).
   * The `q=type` and `q=account` finders this used to send do not exist.
   */
  async listTargetingFacets(context?: RequestContext): Promise<unknown> {
    await this.rateLimiter.consume(`linkedin:default`);
    return this.httpClient.get("/rest/adTargetingFacets", undefined, context);
  }

  /**
   * The values inside a facet, or the names behind a list of value URNs.
   *
   * `GET /rest/adTargetingEntities` has four finders: `adTargetingFacet` (every
   * entity of a facet), `typeahead` (search within a facet), `similarEntities`
   * (entities like the given ones) and `urns` (resolve URNs). None documents
   * `start`/`count`, so none is sent. `QUERY_USES_URNS` is sent on all four: the
   * page's samples do, though its `adTargetingFacet` parameter table says
   * `QUERY_USES_VALUES`.
   *
   * A facet that LinkedIn lists as typeahead-only (`locations`, `schools`,
   * `employers`, …) is refused for the other finders, and the reverse, before any
   * request is made.
   */
  async getTargetingEntities(
    query: LinkedInTargetingEntitiesQuery,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`linkedin:default`);

    const params: Record<string, RestliQueryValue | undefined> = {
      q: query.finder,
      queryVersion: "QUERY_USES_URNS",
    };

    if (query.finder === "urns") {
      params.urns = [...query.urns];
    } else {
      const facetUrn = toFacetUrn(query.facet);
      assertFinderSupported(query.finder, facetUrn.slice(FACET_URN_PREFIX.length));
      params.facet = facetUrn;
      if (query.finder === "typeahead") {
        params.query = query.query;
        if (query.entityType) params.entityType = query.entityType;
      } else if (query.finder === "similarEntities") {
        params.entities = [...query.entities];
        if (query.entityType) params.entityType = query.entityType;
      }
    }

    if (query.locale) {
      params.locale = { language: query.locale.language, country: query.locale.country };
    }

    return this.httpClient.get("/rest/adTargetingEntities", params, context);
  }

  /**
   * How many members match `targetingCriteria`.
   *
   * `GET /rest/audienceCounts?q=targetingCriteriaV2` returns `{ active, total }`.
   * `total` is 0 below 300 members, to protect member privacy (Audience Counts
   * page, read 2026-10-01).
   */
  async getAudienceCount(
    targetingCriteria: LinkedInTargetingCriteria,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`linkedin:default`);
    return this.httpClient.get(
      "/rest/audienceCounts",
      { q: "targetingCriteriaV2", targetingCriteria },
      context
    );
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
   * Forecast impressions, clicks, spend and the rest for a campaign setup.
   *
   * `GET /rest/adSupplyForecasts?q=criteriaV2`, replacing the legacy
   * `POST /v2/adForecastsV2`. `account`, `campaignType`, `timeRange` (epoch
   * milliseconds, start in the future), `targetingCriteria`, and `dailyBudget`
   * or `totalBudget` are required. The answer is `elements[{ metricType,
   * granularity, timeSeries[{ timestamp, value, adForecastRange }] }]` — it
   * carries no audience size (Ad Supply Forecasts page, read 2026-10-01).
   */
  async getAdSupplyForecast(
    query: LinkedInAdSupplyForecastQuery,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`linkedin:default`);

    const params: Record<string, RestliQueryValue | undefined> = {
      q: "criteriaV2",
      account: query.account,
      campaignType: query.campaignType,
      timeRange: { start: query.timeRange.start, end: query.timeRange.end },
      targetingCriteria: query.targetingCriteria,
      dailyBudget: query.dailyBudget,
      totalBudget: query.totalBudget,
      competingBid: query.competingBid,
      optimizationTarget: query.optimizationTarget,
      campaign: query.campaign,
      creativeType: query.creativeType,
      objectiveType: query.objectiveType,
      enableAudienceNetwork: query.enableAudienceNetwork,
      enableAudienceExpansion: query.enableAudienceExpansion,
      connectedTelevisionOnly: query.connectedTelevisionOnly,
      targetCost: query.targetCost,
      costCap: query.costCap,
    };

    return this.httpClient.get("/rest/adSupplyForecasts", params, context);
  }

  // ─── Ad Previews ─────────────────────────────────────────────────

  /**
   * Preview an existing creative.
   *
   * `GET /rest/adPreviews?q=creative&creative={urn}&account={urn}` returns
   * `elements[{ preview, creative, placement }]`; `preview` is an iframe, valid
   * for about three hours (Ad Preview page, read 2026-10-01). There is no
   * `adFormat` parameter. The live previews (`action=livePreviewForCreative`) are
   * POST actions for a creative that does not exist yet and are not wrapped here.
   */
  async getAdPreviews(
    creativeUrn: string,
    adAccountUrn: string,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`linkedin:default`);
    return this.httpClient.get(
      "/rest/adPreviews",
      { q: "creative", creative: creativeUrn, account: adAccountUrn },
      context
    );
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
