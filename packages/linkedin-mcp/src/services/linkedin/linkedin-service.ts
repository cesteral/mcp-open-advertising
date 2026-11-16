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
  entityItemRequest,
  type LinkedInEntityType,
  type LinkedInListPaging,
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
import type {
  LinkedInInitializeImageUploadResponse,
  LinkedInInitializeVideoUploadResponse,
  LinkedInVideoUploadInstruction,
} from "../../mcp-server/tools/utils/media-types.js";

/**
 * The upload instructions, checked to cover the file exactly once in order
 * (the Videos API: "Parts are sorted by non-overlapping byte-range" starting at
 * byte 0). Checked before any byte is sent, so a malformed response uploads
 * nothing.
 */
function videoUploadParts(
  instructions: LinkedInVideoUploadInstruction[] | undefined,
  fileSizeBytes: number
): Array<{ uploadUrl: string; firstByte: number; lastByte: number }> {
  const parts: Array<{ uploadUrl: string; firstByte: number; lastByte: number }> = [];
  let next = 0;
  for (const i of instructions ?? []) {
    if (!i.uploadUrl || i.firstByte !== next || i.lastByte === undefined || i.lastByte < next) {
      break;
    }
    parts.push({ uploadUrl: i.uploadUrl, firstByte: i.firstByte, lastByte: i.lastByte });
    next = i.lastByte + 1;
  }
  if (
    parts.length === 0 ||
    parts.length !== (instructions ?? []).length ||
    next !== fileSizeBytes
  ) {
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      `LinkedIn video initializeUpload returned upload instructions that do not cover the ${fileSizeBytes}-byte file`
    );
  }
  return parts;
}

/** An ETag header may be quoted (`"e438…"`); the part id is the bare value. */
function unquoteEtag(etag: string): string {
  const trimmed = etag.trim();
  return trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1)
    : trimmed;
}

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
  // Images API and Videos API (#210; they replace the Assets API's
  // `/v2/assets?action=registerUpload`). Read from LinkedIn's Images API,
  // Videos API and Vector Asset pages, li-lms-2026-10, 2026-11-16; not
  // exercised against LinkedIn.
  //
  // The Rest.li actions (initializeUpload, finalizeUpload) draw
  // LINKEDIN_WRITE_TOKENS from `linkedin:default`, the server's own cost (no
  // LinkedIn source states one). The byte PUTs go to the `dms-uploads` URLs the
  // initialize response hands back, not to the Marketing API, and draw nothing:
  // a video is uploaded in 4 MB parts, so a per-part draw would make any video
  // over a few parts outlast the per-minute budget. The flow has no status
  // poll: the media is PROCESSING until LinkedIn marks it AVAILABLE.

  /**
   * Upload one image: `POST /rest/images?action=initializeUpload`, then PUT the
   * bytes (with the OAuth token) to the returned uploadUrl. Returns the
   * `urn:li:image:…`.
   */
  async uploadImage(
    ownerUrn: string,
    buffer: Buffer,
    contentType: string,
    context?: RequestContext
  ): Promise<string> {
    await this.rateLimiter.consume(`linkedin:default`, LINKEDIN_WRITE_TOKENS);
    const init = (await this.httpClient.post(
      "/rest/images?action=initializeUpload",
      { initializeUploadRequest: { owner: ownerUrn } },
      context
    )) as LinkedInInitializeImageUploadResponse;
    const uploadUrl = init.value?.uploadUrl;
    const imageUrn = init.value?.image;
    if (!uploadUrl || !imageUrn) {
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        "LinkedIn image initializeUpload returned no uploadUrl or image URN"
      );
    }
    await this.httpClient.putBinary(
      uploadUrl,
      buffer,
      contentType,
      { withAccessToken: true },
      context
    );
    return imageUrn;
  }

  /**
   * Upload one video: `POST /rest/videos?action=initializeUpload` with the file
   * size, PUT each part the upload instructions name (inclusive byte ranges,
   * no OAuth token) keeping each response's ETag, then
   * `POST /rest/videos?action=finalizeUpload` with the ETags in instruction
   * order. Returns the `urn:li:video:…`. A failure after initialize leaves the
   * video WAITING_UPLOAD upstream; the Videos API documents no delete for it.
   */
  async uploadVideo(ownerUrn: string, buffer: Buffer, context?: RequestContext): Promise<string> {
    await this.rateLimiter.consume(`linkedin:default`, LINKEDIN_WRITE_TOKENS);
    const init = (await this.httpClient.post(
      "/rest/videos?action=initializeUpload",
      {
        initializeUploadRequest: {
          owner: ownerUrn,
          fileSizeBytes: buffer.length,
          uploadCaptions: false,
          uploadThumbnail: false,
        },
      },
      context
    )) as LinkedInInitializeVideoUploadResponse;
    const videoUrn = init.value?.video;
    if (!videoUrn) {
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        "LinkedIn video initializeUpload returned no video URN"
      );
    }
    const parts = videoUploadParts(init.value?.uploadInstructions, buffer.length);

    const uploadedPartIds: string[] = [];
    for (const part of parts) {
      const { etag } = await this.httpClient.putBinary(
        part.uploadUrl,
        buffer.subarray(part.firstByte, part.lastByte + 1),
        "application/octet-stream",
        { withAccessToken: false },
        context
      );
      if (!etag) {
        throw new McpError(
          JsonRpcErrorCode.InternalError,
          `LinkedIn returned no ETag for video part bytes ${part.firstByte}-${part.lastByte}, so the upload cannot be finalized`
        );
      }
      uploadedPartIds.push(unquoteEtag(etag));
    }

    await this.rateLimiter.consume(`linkedin:default`, LINKEDIN_WRITE_TOKENS);
    await this.httpClient.post(
      "/rest/videos?action=finalizeUpload",
      {
        finalizeUploadRequest: {
          video: videoUrn,
          uploadToken: init.value?.uploadToken ?? "",
          uploadedPartIds,
        },
      },
      context
    );
    return videoUrn;
  }

  // ─── Standard CRUD ─────────────────────────────────────────────────

  /**
   * One page of a finder. Cursor finders take `page.count` as the page size
   * (default 25, refused above the finder's documented maximum) and
   * `page.pageToken` from the previous page; a `none` finder returns every
   * element at once, so a `pageToken` is refused rather than silently ignored.
   */
  async listEntities<T extends LinkedInEntityType>(
    entityType: T,
    adAccountUrn: string | undefined,
    page: { count?: number; pageToken?: string },
    context?: RequestContext
  ): Promise<{
    entities: LinkedInEntityMap[T][];
    paging: LinkedInListPaging;
    /** Cursor finders only: the token for the next page, absent on the last. */
    nextPageToken?: string;
  }> {
    const config = getEntityConfig(entityType);
    const finder = config.listFinder;

    if (finder.paging === "none" && page.pageToken !== undefined) {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `LinkedIn returns every ${entityType} in one response; pageToken does not apply.`
      );
    }
    if (finder.paging === "cursor" && page.count !== undefined && page.count > finder.maxPageSize) {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `LinkedIn pages ${entityType} lists at most ${finder.maxPageSize} per page; count ${page.count} is larger.`
      );
    }

    await this.rateLimiter.consume(`linkedin:${adAccountUrn ?? "default"}`);

    const params: Record<string, RestliQueryValue> = { q: finder.name };
    if (finder.paging === "cursor") {
      params.pageSize = String(page.count ?? 25);
      if (page.pageToken !== undefined) params.pageToken = page.pageToken;
    }

    // For account-scoped collections the ad account lives in the PATH; for a
    // conversion rule it is a query parameter. entity-mapping.ts owns which.
    if (adAccountUrn && config.listScopingParam) {
      params[config.listScopingParam.name] = adAccountUrn;
    }

    const path = config.collectionPath(
      config.accountScoped && adAccountUrn ? adAccountIdFromUrn(adAccountUrn) : undefined
    );

    // The Creatives page says a finder call "must" carry X-RestLi-Method:
    // FINDER; LinkedIn's official clients send it on every finder.
    const result = (await this.httpClient.get(path, params, context, {
      restliMethod: "FINDER",
    })) as LinkedInElementsResponse<LinkedInEntityMap[T]>;

    return {
      entities: result.elements ?? [],
      paging: finder.paging,
      ...(finder.paging === "cursor" && result.metadata?.nextPageToken
        ? { nextPageToken: result.metadata.nextPageToken }
        : {}),
    };
  }

  /**
   * `adAccountUrn` is the entity's owning ad account: every item path but an ad
   * account's own is addressed under it (entity-mapping.ts `itemRequest`).
   */
  async getEntity<T extends LinkedInEntityType>(
    entityType: T,
    entityUrn: string,
    adAccountUrn: string | undefined,
    context?: RequestContext
  ): Promise<LinkedInEntityMap[T]> {
    const item = entityItemRequest(entityType, entityUrn, adAccountUrn);
    await this.rateLimiter.consume(`linkedin:default`);

    return this.httpClient.get(item.path, item.query, context) as Promise<LinkedInEntityMap[T]>;
  }

  /**
   * `adAccountUrn` is the account the entity is created in. A creative's body
   * has no writable account, so its path comes from `adAccountUrn` alone; a
   * campaign or campaign group body carries `account`, which is used when
   * `adAccountUrn` is absent and must agree with it when both are given.
   */
  async createEntity<T extends LinkedInEntityType>(
    entityType: T,
    data: LinkedInCreateEntityInputMap[T],
    adAccountUrn: string | undefined,
    context?: RequestContext
  ): Promise<LinkedInEntityMap[T]> {
    const config = getEntityConfig(entityType);
    const payload = data as unknown as Record<string, unknown>;
    const path = config.collectionPath(
      config.accountScoped ? createAccountId(entityType, payload, adAccountUrn) : undefined
    );

    await this.rateLimiter.consume(`linkedin:default`, LINKEDIN_WRITE_TOKENS);

    return this.httpClient.post(path, payload, context) as Promise<LinkedInEntityMap[T]>;
  }

  async updateEntity<T extends LinkedInEntityType>(
    entityType: T,
    entityUrn: string,
    adAccountUrn: string | undefined,
    data: LinkedInUpdateEntityInputMap[T],
    context?: RequestContext
  ): Promise<LinkedInEntityMap[T]> {
    const item = entityItemRequest(entityType, entityUrn, adAccountUrn);
    await this.rateLimiter.consume(`linkedin:default`, LINKEDIN_WRITE_TOKENS);

    return this.httpClient.patch(
      item.path,
      data as unknown as Record<string, unknown>,
      context,
      item.query
    ) as Promise<LinkedInEntityMap[T]>;
  }

  /**
   * HTTP DELETE on the entity. LinkedIn deletes only DRAFT campaigns, campaign
   * groups, accounts and creatives this way (a creative also when its campaign
   * is DRAFT, or a failed video); anything else is deleted by setting its
   * status (a creative's `intendedStatus`) to `PENDING_DELETION`. LinkedIn
   * documents no delete for a conversion rule, so one is refused here.
   */
  async deleteEntity(
    entityType: LinkedInEntityType,
    entityUrn: string,
    adAccountUrn: string | undefined,
    context?: RequestContext
  ): Promise<unknown> {
    if (entityType === "conversionRule") {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        "LinkedIn's Conversions API documents no delete for a conversion rule, so none is sent. " +
          "Change it with linkedin_update_entity instead."
      );
    }
    const item = entityItemRequest(entityType, entityUrn, adAccountUrn);
    await this.rateLimiter.consume(`linkedin:default`, LINKEDIN_WRITE_TOKENS);

    return this.httpClient.delete(item.path, context, item.query);
  }

  // ─── Bulk Operations ──────────────────────────────────────────────

  /**
   * Bulk update entity statuses.
   * Each entity is updated individually with concurrency limit.
   */
  async bulkUpdateStatus(
    entityType: LinkedInEntityType,
    entityUrns: string[],
    adAccountUrn: string | undefined,
    status: string,
    context?: RequestContext
  ): Promise<{ results: Array<{ entityUrn: string; success: boolean; error?: string }> }> {
    // A creative's status field on the Creatives API is `intendedStatus`.
    const patch = entityType === "creative" ? { intendedStatus: status } : { status };
    const bulkResults = await executeBulkConcurrent(entityUrns, async (entityUrn) => {
      return this.updateEntity(entityType, entityUrn, adAccountUrn, patch, context);
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
    adAccountUrn: string | undefined,
    items: LinkedInCreateEntityInputMap[T][],
    context?: RequestContext
  ): Promise<{
    results: Array<{ success: boolean; entity?: LinkedInEntityMap[T]; error?: string }>;
  }> {
    const results = await executeBulkConcurrent(items, async (data) => {
      return this.createEntity(entityType, data, adAccountUrn, context);
    });
    return { results };
  }

  /**
   * Bulk update entities with arbitrary data.
   * Each item is updated individually with concurrency limit.
   */
  async bulkUpdateEntities<T extends LinkedInEntityType>(
    entityType: T,
    adAccountUrn: string | undefined,
    items: Array<{ entityUrn: string; data: LinkedInUpdateEntityInputMap[T] }>,
    context?: RequestContext
  ): Promise<{ results: Array<{ entityUrn: string; success: boolean; error?: string }> }> {
    const bulkResults = await executeBulkConcurrent(items, async (item) => {
      return this.updateEntity(entityType, item.entityUrn, adAccountUrn, item.data, context);
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
    adAccountUrn: string,
    adjustments: Array<{ campaignUrn: string; bidAmount: Record<string, unknown> }>,
    context?: RequestContext
  ): Promise<{ results: Array<{ campaignUrn: string; success: boolean; error?: string }> }> {
    const results: Array<{ campaignUrn: string; success: boolean; error?: string }> = [];

    for (const adjustment of adjustments) {
      try {
        await this.updateEntity(
          "campaign",
          adjustment.campaignUrn,
          adAccountUrn,
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
   * The copy is created in the source's ad account.
   */
  async duplicateEntity<T extends LinkedInEntityType>(
    entityType: T,
    entityUrn: string,
    adAccountUrn: string | undefined,
    options?: { newName?: string },
    context?: RequestContext
  ): Promise<LinkedInEntityMap[T]> {
    assertDuplicable(entityType);

    // Read source entity
    const source = await this.getEntity(entityType, entityUrn, adAccountUrn, context);

    // Build copy payload — strip read-only fields
    const copyData: Record<string, unknown> = { ...(source as unknown as Record<string, unknown>) };
    const readOnly =
      entityType === "creative"
        ? CREATIVE_READ_ONLY_FIELDS
        : [
            "id",
            "changeAuditStamps",
            "created",
            "lastModified",
            "review",
            "servingStatuses",
            "version",
            "associatedEntity",
          ];
    for (const field of readOnly) delete copyData[field];

    if (options?.newName) {
      copyData.name = options.newName;
    } else if (typeof copyData.name === "string") {
      copyData.name = `Copy of ${copyData.name}`;
    }

    // A campaign / group / conversion-rule body names its account; a creative's
    // does not (it is read-only), and its create path comes from adAccountUrn.
    if (entityType !== "creative" && copyData.account === undefined && adAccountUrn !== undefined) {
      copyData.account = `urn:li:sponsoredAccount:${adAccountIdFromUrn(adAccountUrn)}`;
    }

    // The copy starts as a draft. A creative's status field is intendedStatus.
    copyData[entityType === "creative" ? "intendedStatus" : "status"] = "DRAFT";

    return this.createEntity(
      entityType,
      copyData as LinkedInCreateEntityInputMap[T],
      adAccountUrn,
      context
    );
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
}

/**
 * The entity type `linkedin_duplicate_entity` cannot copy, and why.
 *
 * An ad account: LinkedIn's Ad Accounts page documents create (BUSINESS type
 * only) but no copy, and a copied account is a new billing relationship, not a
 * campaign setting.
 */
/**
 * Creative fields the Creatives page marks read-only (read 2026-11-14), plus
 * `isTest` and `metadata`, which are derived on read. A duplicate drops them.
 */
const CREATIVE_READ_ONLY_FIELDS = [
  "id",
  "account",
  "createdAt",
  "createdBy",
  "lastModifiedAt",
  "lastModifiedBy",
  "isServing",
  "isTest",
  "review",
  "servingHoldReasons",
  "metadata",
];

export function assertDuplicable(entityType: LinkedInEntityType): void {
  if (entityType === "adAccount") {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      "An ad account cannot be duplicated. Create a new one with linkedin_create_entity " +
        "(LinkedIn accepts BUSINESS-type accounts only)."
    );
  }
}

/**
 * The numeric ad account id a create posts under
 * (`/rest/adAccounts/{accountId}/…`).
 *
 * A creative's body has no writable account (`account` is read-only on the
 * Creatives API), so it needs `adAccountUrn`. A campaign or campaign group body
 * names its `account`; that is used when `adAccountUrn` is absent, and the two
 * must agree when both are given, so a create cannot land in a different
 * account than its body names.
 */
function createAccountId(
  entityType: LinkedInEntityType,
  payload: Record<string, unknown>,
  adAccountUrn: string | undefined
): string {
  const bodyAccount =
    typeof payload.account === "string" && payload.account.length > 0 ? payload.account : undefined;
  if (adAccountUrn !== undefined && bodyAccount !== undefined) {
    if (adAccountIdFromUrn(adAccountUrn) !== adAccountIdFromUrn(bodyAccount)) {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `adAccountUrn ${adAccountUrn} names a different ad account than data.account ${bodyAccount}.`
      );
    }
  }
  const account = adAccountUrn ?? bodyAccount;
  if (account === undefined) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `Creating a ${entityType} needs its ad account: LinkedIn posts it to ` +
        `/rest/adAccounts/{accountId}/…. Pass adAccountUrn` +
        (entityType === "creative" ? "." : ` or an "account" URN in data.`)
    );
  }
  return adAccountIdFromUrn(account);
}
