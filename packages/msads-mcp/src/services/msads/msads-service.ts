// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { RateLimiter } from "@cesteral/shared";
import { McpError, JsonRpcErrorCode } from "@cesteral/shared";
import type { MsAdsHttpClient } from "./msads-http-client.js";
import {
  getEntityConfig,
  type MsAdsEntityConfig,
  type MsAdsEntityType,
} from "../../mcp-server/tools/utils/entity-mapping.js";
import { type RequestContext, executeBulkConcurrent } from "@cesteral/shared";
import { MSADS_READ_KEY, MSADS_WRITE_KEY } from "./rate-limit-keys.js";
import {
  assertMsAdsWriteSucceeded,
  mapMsAdsItemOutcomes,
  type MsAdsItemOutcome,
} from "./partial-errors.js";
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

/**
 * Status forced onto every duplicated entity so the copy can never start
 * spending on creation. Microsoft Ads v13 accepts `Paused` on write for every
 * status-bearing entity this package handles: CampaignStatus, AdGroupStatus,
 * AdStatus and KeywordStatus all enumerate `Paused` (campaign-management-service
 * `campaignstatus.md`, `adgroupstatus.md`, `adstatus.md`, `keywordstatus.md`),
 * and `campaign.md` / `adgroup.md` document it as the Add default.
 */
export const MSADS_DUPLICATE_COPY_STATUS = "Paused";

/**
 * Batch description for `executeOperation` writes whose response reports
 * per-item failures in `PartialErrors` / `NestedPartialErrors` (ad extension
 * associations, criterions, import jobs).
 */
export interface MsAdsBatchWriteSpec {
  /** Operation label used in error messages (e.g. "setAssociations"). */
  operation: string;
  /** Human label for the items (e.g. "ad extension associations"). */
  entityLabel: string;
  /** Request-body key holding the submitted item array; its length is the batch size. */
  itemsField: string;
  /** Add responses: id list aligned with the request items (null = not added). */
  idsField?: string;
}

/** Result of an `executeOperation` write run with a `MsAdsBatchWriteSpec`. */
export interface MsAdsBatchWriteResult {
  response: unknown;
  requested: number;
  succeeded: number;
  failed: number;
  /** Outcomes for the items that failed (successful items are not listed). */
  failures: MsAdsItemOutcome[];
}

/**
 * Optional Customer Management access, used to read the account's currency
 * for canonical budget snapshots.
 */
export interface MsAdsAccountLookup {
  customerClient: MsAdsHttpClient;
  /** The session's ad account (the `CustomerAccountId` header value). */
  accountId: string;
}

/** Per-item outcome returned by the bulk create/update service methods. */
export interface MsAdsBulkItemResult {
  /** Zero-based index of the item in the caller's `items` array. */
  index: number;
  /** Created ID (bulk create) or targeted ID (bulk update); absent when unknown. */
  entityId?: string;
  success: boolean;
  error?: string;
  errorCode?: string;
}

/** Per-adjustment outcome returned by `adjustBids`. */
export interface MsAdsBidAdjustmentResult {
  entityId: string;
  success: boolean;
  error?: string;
  errorCode?: string;
}

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
 * Uses entity mapping to route operations to the documented collection and query endpoints.
 * Microsoft Ads JSON endpoints use POST for all operations.
 */
export class MsAdsService {
  private accountCurrency: Promise<string> | undefined;

  constructor(
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: MsAdsHttpClient,
    private readonly logger: Logger,
    private readonly accountLookup?: MsAdsAccountLookup
  ) {}

  /**
   * ISO 4217 currency of the session's ad account, from Customer Management
   * GetAccount (`POST /CustomerManagement/v13/Account/Query` with `AccountId`;
   * response `Account.CurrencyCode`, an ISO code per `currencycode.md`).
   * Memoized per service instance (one session, one account). Throws when no
   * account lookup is configured or the response carries no currency; a failed
   * lookup is not cached, so a later call retries.
   */
  async getAccountCurrency(context?: RequestContext): Promise<string> {
    const lookup = this.accountLookup;
    if (!lookup || !lookup.accountId) {
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        "Account currency lookup is not configured for this Microsoft Ads session"
      );
    }
    if (!this.accountCurrency) {
      const pending = (async () => {
        await this.rateLimiter.consume(MSADS_READ_KEY);
        const raw = (await lookup.customerClient.post(
          "/Account/Query",
          { AccountId: Number(lookup.accountId) },
          context
        )) as { Account?: { CurrencyCode?: unknown } } | null;
        const code = raw?.Account?.CurrencyCode;
        if (typeof code !== "string" || !/^[A-Z]{3}$/.test(code)) {
          throw new McpError(
            JsonRpcErrorCode.InternalError,
            `Microsoft Ads GetAccount returned no ISO CurrencyCode for account ${lookup.accountId}`
          );
        }
        return code;
      })();
      this.accountCurrency = pending;
      pending.catch(() => {
        if (this.accountCurrency === pending) this.accountCurrency = undefined;
      });
    }
    return this.accountCurrency;
  }

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
      if (!params.accountId) {
        throw new McpError(
          JsonRpcErrorCode.InvalidParams,
          `Listing '${entityType}' requires accountId`
        );
      }
      const body: Record<string, unknown> = {
        AccountId: Number(params.accountId),
        ...config.defaultReadFields,
        ...params.filters,
      };
      this.logger.debug({ entityType, accountId: params.accountId }, "Listing entities by account");
      raw = await this.httpClient.post(config.getByAccountOperation, body, context);
    } else if (config.getByParentOperation) {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `Listing '${entityType}' requires parentId`
      );
    } else {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        entityType === "audience"
          ? "Use getEntity with specific AudienceIds. Audiences cannot be listed by account in the Microsoft Advertising v13 JSON API."
          : entityType === "budget"
            ? "Use getEntity with specific BudgetIds. Budgets cannot be listed by account in the Microsoft Advertising v13 JSON API."
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
      ...config.defaultReadFields,
      ...params,
    };
    this.assertRequiredFields(config.requiredGetByIdsFields, body, entityType, "getEntity");

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
    const result = await this.httpClient.post(config.addOperation, data, context);
    // HTTP 200 does not mean the Add happened: rejected items come back in
    // PartialErrors with a null id at their index.
    assertMsAdsWriteSucceeded(result, {
      operation: "create",
      entityLabel: config.displayName,
      requested: countBatchItems(data, config.pluralName),
      idsField: config.idsField,
    });
    return result;
  }

  /**
   * Duplicate an entity via the client-side read+create clone pattern (MS Ads
   * has no native copy operation). Reads the source by ID, strips the
   * server-assigned `Id`, then submits a fresh Add payload
   * (`{ AccountId, <PluralName>: [copy] }`). Only `campaign` is supported.
   *
   * The copy is always created `Paused` (MSADS_DUPLICATE_COPY_STATUS), applied
   * after `options`, so duplicating an Active entity can never produce a copy
   * that spends before someone deliberately activates it. This also avoids
   * copying read-only system statuses (e.g. `BudgetPaused`, `Suspended`) that
   * Add rejects.
   */
  async duplicateEntity(
    entityType: MsAdsEntityType,
    accountId: string,
    entityId: string,
    options?: Record<string, unknown>,
    context?: RequestContext
  ): Promise<{ result: unknown; item: Record<string, unknown> }> {
    const config = getEntityConfig(entityType);
    if (!config.supportsDuplicate) {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `Entity type ${entityType} does not support duplication`
      );
    }

    const { entities } = await this.getEntity(
      entityType,
      [entityId],
      { AccountId: Number(accountId) },
      context
    );
    const source = (entities[0] ?? {}) as unknown as Record<string, unknown>;
    if (Object.keys(source).length === 0) {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `${config.displayName} ${entityId} not found in account ${accountId}`
      );
    }

    // Strip the server-assigned ID so the Add operation mints a new one.
    const copy: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(source)) {
      if (key !== config.idField) copy[key] = val;
    }
    if (options) Object.assign(copy, options);
    if (options && "Status" in options && options.Status !== MSADS_DUPLICATE_COPY_STATUS) {
      this.logger.warn(
        { entityType, requestedStatus: options.Status },
        "Ignoring Status override on duplicate; copies are always created Paused"
      );
    }
    copy.Status = MSADS_DUPLICATE_COPY_STATUS;

    const payload = { AccountId: Number(accountId), [config.pluralName]: [copy] };
    // MS Ads Add returns only the new IDs; surface the submitted item too so the
    // caller can normalize the `after` snapshot (mirrors msads_create_entity).
    const result = await this.createEntity(entityType, payload, context);
    return { result, item: copy };
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
    if (config.writeParentIdField) {
      this.assertRequiredFields([config.writeParentIdField], data, entityType, "updateEntity");
    }
    await this.rateLimiter.consume(MSADS_WRITE_KEY, 3);
    this.logger.info({ entityType }, "Updating entity");
    const result = await this.httpClient.put(config.updateOperation, data, context);
    // Update returns HTTP 200 with PartialErrors for rejected items.
    assertMsAdsWriteSucceeded(result, {
      operation: "update",
      entityLabel: config.displayName,
      requested: countBatchItems(data, config.pluralName),
    });
    return result;
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
    return this.httpClient.delete(config.deleteOperation, body, context);
  }

  /**
   * Bulk create entities — batches items per entity batch limit.
   *
   * Returns one outcome per input item. Each batch's `PartialErrors[].Index`
   * (batch-relative) and null entries in the Add id list are mapped back to
   * the caller's item index, so an HTTP 200 whose items were all rejected is
   * reported as failures, not success.
   */
  async bulkCreateEntities(
    entityType: MsAdsEntityType,
    items: Record<string, unknown>[],
    context?: RequestContext,
    parentId?: string
  ): Promise<MsAdsBulkItemResult[]> {
    const config = getEntityConfig(entityType);
    const parent = this.buildWriteParent(config, entityType, parentId, "bulkCreateEntities");
    const results: MsAdsBulkItemResult[] = [];

    for (let i = 0; i < items.length; i += config.batchLimit) {
      const batch = items.slice(i, i + config.batchLimit);
      await this.rateLimiter.consume(MSADS_WRITE_KEY, 3);
      const body = { ...parent, [config.pluralName]: batch };
      this.logger.info(
        { entityType, batchSize: batch.length, batchIndex: i },
        "Bulk creating entities"
      );
      const result = await this.httpClient.post(config.addOperation, body, context);
      const ids = (result as Record<string, unknown> | null)?.[config.idsField];
      for (const outcome of mapMsAdsItemOutcomes(result, batch.length, {
        idsField: config.idsField,
      })) {
        const createdId = outcome.success && Array.isArray(ids) ? ids[outcome.index] : undefined;
        results.push(toBulkItemResult(i + outcome.index, outcome, createdId));
      }
    }

    return results;
  }

  /**
   * Bulk update entities — batches items per entity batch limit.
   *
   * Returns one outcome per input item, mapping each batch's
   * `PartialErrors[].Index` back to the caller's item index.
   */
  async bulkUpdateEntities(
    entityType: MsAdsEntityType,
    items: Record<string, unknown>[],
    context?: RequestContext,
    parentId?: string
  ): Promise<MsAdsBulkItemResult[]> {
    const config = getEntityConfig(entityType);
    const parent = this.buildWriteParent(config, entityType, parentId, "bulkUpdateEntities");
    const results: MsAdsBulkItemResult[] = [];

    for (let i = 0; i < items.length; i += config.batchLimit) {
      const batch = items.slice(i, i + config.batchLimit);
      await this.rateLimiter.consume(MSADS_WRITE_KEY, 3);
      const body = { ...parent, [config.pluralName]: batch };
      this.logger.info({ entityType, batchSize: batch.length }, "Bulk updating entities");
      const result = await this.httpClient.put(config.updateOperation, body, context);
      for (const outcome of mapMsAdsItemOutcomes(result, batch.length)) {
        const item = batch[outcome.index] ?? {};
        results.push(toBulkItemResult(i + outcome.index, outcome, item.Id ?? item.id));
      }
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
    context?: RequestContext,
    parentId?: string
  ): Promise<{ results: Array<{ entityId: string; success: boolean; error?: string }> }> {
    const config = getEntityConfig(entityType);
    const parent = this.buildWriteParent(config, entityType, parentId, "bulkUpdateStatus");

    this.logger.info({ entityType, count: entityIds.length, status }, "Bulk updating status");

    const bulkResults = await executeBulkConcurrent(
      entityIds,
      async (entityId) => {
        // Cost 1 (not 3) — status-only updates are minimal single-field payloads
        await this.rateLimiter.consume(MSADS_WRITE_KEY, 1);
        const body = {
          ...parent,
          [config.pluralName]: [{ Id: Number(entityId), Status: status }],
        };
        const result = await this.httpClient.put(config.updateOperation, body, context);
        // A rejected status change still returns HTTP 200 — surface its
        // PartialErrors as this entity's failure.
        assertMsAdsWriteSucceeded(result, {
          operation: "status update",
          entityLabel: `${config.displayName} ${entityId}`,
          requested: 1,
        });
        return result;
      },
      { logger: this.logger }
    );

    return {
      results: bulkResults.map((r, i) => ({
        entityId: entityIds[i],
        success: r.success,
        error: r.error,
      })),
    };
  }

  /**
   * Adjust bids — read-before-write for keyword/adGroup bids.
   *
   * The read confirms each entity exists under the given parent; the Update
   * then sends a minimal patch `{ Id, <bidField>: { Amount } }` plus the
   * request-body parent (`CampaignId` for ad groups, `AdGroupId` for keywords,
   * taken from `queryParams`). `Keyword.Bid` and `AdGroup.CpcBid` / `CpmBid` /
   * `CpvBid` are `Bid` objects (`bid.md`: `{ "Amount": double }`), not numbers,
   * and Update leaves every omitted field unchanged, so echoing the read entity
   * back (including read-only fields such as `EditorialStatus`) is neither
   * needed nor safe.
   *
   * Returns the raw Update response plus one outcome per requested adjustment.
   * Adjustments whose entity was not found on read are reported as failed
   * (they are never sent). `PartialErrors[].Index` refers to the SUBMITTED
   * list, which excludes those, so it is mapped back through that list.
   */
  async adjustBids(
    entityType: MsAdsEntityType,
    adjustments: Array<{
      entityId: string;
      bidField: string;
      newBid: number;
    }>,
    queryParams: Record<string, unknown> | undefined,
    context?: RequestContext
  ): Promise<{ response: unknown; results: MsAdsBidAdjustmentResult[] }> {
    const config = getEntityConfig(entityType);
    const parentField = config.writeParentIdField;
    const parentValue = parentField ? queryParams?.[parentField] : undefined;
    const parent = this.buildWriteParent(
      config,
      entityType,
      parentValue === undefined || parentValue === null ? undefined : String(parentValue),
      "adjustBids"
    );

    // Read current entities
    const entityIds = adjustments.map((a) => a.entityId);
    const { entities: currentEntities } = await this.getEntity(
      entityType,
      entityIds,
      queryParams,
      context
    );

    // Apply bid changes — skip missing entities to prevent data loss
    // submittedFrom[k] = index in `adjustments` of the k-th entity sent.
    const submittedFrom: number[] = [];
    const updatedEntities = adjustments
      .map((adj, adjIndex) => {
        const current = currentEntities.find(
          (e) => String((e as unknown as Record<string, unknown>)[config.idField]) === adj.entityId
        );
        if (!current) {
          this.logger.warn(
            { entityId: adj.entityId },
            "Entity not found during bid adjustment — skipping to prevent data loss"
          );
          return null;
        }
        submittedFrom.push(adjIndex);
        const patch: Record<string, unknown> = {
          Id: Number(adj.entityId),
          [adj.bidField]: { Amount: adj.newBid },
        };
        return patch;
      })
      .filter((e): e is Record<string, unknown> => e !== null);

    if (updatedEntities.length === 0) {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        "No entities found for bid adjustment — all entity IDs were invalid or deleted"
      );
    }

    await this.rateLimiter.consume(MSADS_WRITE_KEY, 3);
    const body = { ...parent, [config.pluralName]: updatedEntities };
    this.logger.info({ entityType, count: adjustments.length }, "Adjusting bids");
    const response = await this.httpClient.put(config.updateOperation, body, context);

    const results: MsAdsBidAdjustmentResult[] = adjustments.map((adj) => ({
      entityId: adj.entityId,
      success: false,
      error: `${config.displayName} ${adj.entityId} not found on read-before-write; not updated`,
    }));
    for (const outcome of mapMsAdsItemOutcomes(response, submittedFrom.length)) {
      const adjIndex = submittedFrom[outcome.index];
      const adj = adjIndex !== undefined ? adjustments[adjIndex] : undefined;
      if (adjIndex === undefined || !adj) continue;
      results[adjIndex] = {
        entityId: adj.entityId,
        success: outcome.success,
        ...(outcome.error ? { error: outcome.error } : {}),
        ...(outcome.errorCode ? { errorCode: outcome.errorCode } : {}),
      };
    }
    return { response, results };
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
   * Generic write operation with caller-selected HTTP verb (ad extensions, criterions, etc.)
   * Microsoft Advertising REST v13 uses Add=POST, Update=PUT, Delete=DELETE on shared
   * collection paths (e.g. /CampaignCriterions), so callers must pass the right verb.
   *
   * Without `batch` the raw response is returned untouched (read operations).
   * With `batch`, the response is run through the PartialErrors helpers: these
   * operations return HTTP 200 with rejected items listed in `PartialErrors`
   * (SetAdExtensionsAssociations, DeleteAdExtensionsAssociations,
   * DeleteCampaignCriterions, AddImportJobs, …) or `NestedPartialErrors`
   * (Add/UpdateCampaignCriterions, Add/UpdateAdGroupCriterions), per each
   * operation's documented Response Body Elements. When every item was
   * rejected this throws (nothing was written); otherwise the per-item counts
   * are returned so the caller can report a partial success honestly.
   */
  async executeOperation(
    path: string,
    data: Record<string, unknown>,
    context?: RequestContext,
    method?: "POST" | "PUT" | "DELETE"
  ): Promise<unknown>;
  async executeOperation(
    path: string,
    data: Record<string, unknown>,
    context: RequestContext | undefined,
    method: "POST" | "PUT" | "DELETE",
    batch: MsAdsBatchWriteSpec
  ): Promise<MsAdsBatchWriteResult>;
  async executeOperation(
    path: string,
    data: Record<string, unknown>,
    context?: RequestContext,
    method: "POST" | "PUT" | "DELETE" = "POST",
    batch?: MsAdsBatchWriteSpec
  ): Promise<unknown> {
    await this.rateLimiter.consume(MSADS_WRITE_KEY, 3);
    this.logger.debug({ path, method }, "Executing custom operation");
    const response = await this.httpClient.request(method, path, data, context);
    if (!batch) return response;

    const requested = countBatchItems(data, batch.itemsField);
    const outcomes = mapMsAdsItemOutcomes(response, requested, { idsField: batch.idsField });
    const failures = outcomes.filter((o) => !o.success);
    if (failures.length === requested) {
      // Nothing was applied: fail the call with the upstream BatchError text.
      assertMsAdsWriteSucceeded(response, {
        operation: batch.operation,
        entityLabel: batch.entityLabel,
        requested,
        idsField: batch.idsField,
      });
    }
    return {
      response,
      requested,
      succeeded: requested - failures.length,
      failed: failures.length,
      failures,
    } satisfies MsAdsBatchWriteResult;
  }

  // ─── Internal Helpers ───────────────────────────────────────────

  /**
   * The request-body parent element (`{ AccountId }` / `{ CampaignId }` /
   * `{ AdGroupId }`) the entity type's Add / Update requires, or `{}` for
   * types that take none. Throws when it is required and missing.
   */
  private buildWriteParent(
    config: MsAdsEntityConfig,
    entityType: MsAdsEntityType,
    parentId: string | undefined,
    operation: string
  ): Record<string, number> {
    const field = config.writeParentIdField;
    if (!field) return {};
    if (parentId === undefined || parentId.trim().length === 0) {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `${operation} for '${entityType}' requires ${field} (the parent the ${config.pluralName} belong to) in the request body`
      );
    }
    return { [field]: Number(parentId) };
  }

  private assertRequiredFields(
    requiredFields: string[] | undefined,
    body: Record<string, unknown>,
    entityType: MsAdsEntityType,
    operation: string
  ): void {
    if (!requiredFields || requiredFields.length === 0) {
      return;
    }

    const missingFields = requiredFields.filter((field) => {
      const value = body[field];
      return value === undefined || value === null || value === "";
    });

    if (missingFields.length > 0) {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `${operation} for '${entityType}' requires ${missingFields.join(", ")} in the request body`
      );
    }
  }
}

/** Number of items in a `{ <PluralName>: [...] }` write payload (1 if absent). */
function countBatchItems(data: Record<string, unknown>, pluralName: string): number {
  const collection = data[pluralName];
  return Array.isArray(collection) && collection.length > 0 ? collection.length : 1;
}

function toBulkItemResult(
  index: number,
  outcome: { success: boolean; error?: string; errorCode?: string },
  entityId: unknown
): MsAdsBulkItemResult {
  return {
    index,
    ...(entityId !== undefined && entityId !== null ? { entityId: String(entityId) } : {}),
    success: outcome.success,
    ...(outcome.error ? { error: outcome.error } : {}),
    ...(outcome.errorCode ? { errorCode: outcome.errorCode } : {}),
  };
}
