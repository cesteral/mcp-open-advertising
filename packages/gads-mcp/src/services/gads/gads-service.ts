import type { Logger } from "pino";
import type { GAdsHttpClient } from "./gads-http-client.js";
import type { RateLimiter } from "../../utils/security/rate-limiter.js";
import type { RequestContext } from "@cesteral/shared";
import {
  getEntityConfig,
  buildMutateUrl,
  buildResourceName,
  type GAdsEntityType,
} from "../../mcp-server/tools/utils/entity-mapping.js";
import {
  buildListQuery,
  buildGetByIdQuery,
} from "../../mcp-server/tools/utils/gaql-helpers.js";

/**
 * Google Ads Service — GAQL queries, account listing, and generic CRUD
 * via the Google Ads REST API v23.
 *
 * Read operations use GAQL via POST /customers/{customerId}/googleAds:search
 * Write operations use POST /customers/{customerId}/{resources}:mutate
 */
export class GAdsService {
  constructor(
    private readonly logger: Logger,
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: GAdsHttpClient
  ) {}

  // ─── GAQL Search ──────────────────────────────────────────────────

  /**
   * Execute a raw GAQL query against the Google Ads API.
   * Uses the `search` endpoint (paginated) rather than `searchStream`.
   */
  async gaqlSearch(
    customerId: string,
    query: string,
    pageSize?: number,
    pageToken?: string,
    context?: RequestContext
  ): Promise<{ results: unknown[]; nextPageToken?: string; totalResultsCount?: number }> {
    await this.rateLimiter.consume(`gads:${customerId}`);

    this.logger.debug({ customerId, query: query.substring(0, 200) }, "Executing GAQL search");

    const body: Record<string, unknown> = {
      query,
    };

    if (pageSize) {
      body.pageSize = pageSize;
    }

    if (pageToken) {
      body.pageToken = pageToken;
    }

    const result = (await this.httpClient.fetch(
      `/customers/${customerId}/googleAds:search`,
      context,
      {
        method: "POST",
        body: JSON.stringify(body),
      }
    )) as Record<string, unknown>;

    return {
      results: (result.results as unknown[]) || [],
      nextPageToken: result.nextPageToken as string | undefined,
      totalResultsCount: result.totalResultsCount as number | undefined,
    };
  }

  // ─── Account Listing ──────────────────────────────────────────────

  /**
   * List all Google Ads accounts accessible to the authenticated user.
   * Uses the CustomerService:listAccessibleCustomers endpoint.
   */
  async listAccessibleCustomers(
    context?: RequestContext
  ): Promise<{ resourceNames: string[] }> {
    await this.rateLimiter.consume("gads:global");

    // This endpoint doesn't require a customer ID in the path
    const result = (await this.httpClient.fetch(
      "/customers:listAccessibleCustomers",
      context,
      { method: "GET" }
    )) as Record<string, unknown>;

    return {
      resourceNames: (result.resourceNames as string[]) || [],
    };
  }

  // ─── Entity Read Operations ───────────────────────────────────────

  /**
   * Get a single entity by type and ID using a GAQL query.
   */
  async getEntity(
    entityType: GAdsEntityType,
    customerId: string,
    entityId: string,
    context?: RequestContext
  ): Promise<unknown> {
    const query = buildGetByIdQuery(entityType, entityId);
    const { results } = await this.gaqlSearch(customerId, query, 1, undefined, context);

    if (results.length === 0) {
      throw new Error(`${entityType} with ID ${entityId} not found in customer ${customerId}`);
    }

    return results[0];
  }

  /**
   * List entities of a given type with optional GAQL filters.
   */
  async listEntities(
    entityType: GAdsEntityType,
    customerId: string,
    filters?: Record<string, string>,
    pageSize?: number,
    pageToken?: string,
    orderBy?: string,
    context?: RequestContext
  ): Promise<{ entities: unknown[]; nextPageToken?: string; totalResultsCount?: number }> {
    const query = buildListQuery(entityType, filters, orderBy);
    const result = await this.gaqlSearch(customerId, query, pageSize, pageToken, context);

    return {
      entities: result.results,
      nextPageToken: result.nextPageToken,
      totalResultsCount: result.totalResultsCount,
    };
  }

  // ─── Mutate Operations ────────────────────────────────────────────

  /**
   * Create a new entity using the :mutate endpoint.
   *
   * Google Ads mutate uses:
   *   POST /customers/{customerId}/{resource}:mutate
   *   Body: { operations: [{ create: { ...fields } }] }
   */
  async createEntity(
    entityType: GAdsEntityType,
    customerId: string,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`gads:${customerId}`);

    this.logger.debug({ entityType, customerId }, "Creating Google Ads entity");

    const mutateUrl = buildMutateUrl(entityType, customerId);

    const result = await this.httpClient.fetch(
      mutateUrl,
      context,
      {
        method: "POST",
        body: JSON.stringify({
          operations: [{ create: data }],
        }),
      }
    );

    return result;
  }

  /**
   * Update an existing entity using the :mutate endpoint with updateMask.
   *
   * Google Ads mutate update uses:
   *   POST /customers/{customerId}/{resource}:mutate
   *   Body: { operations: [{ update: { ...fields, resourceName }, updateMask: "field1,field2" }] }
   */
  async updateEntity(
    entityType: GAdsEntityType,
    customerId: string,
    entityId: string,
    data: Record<string, unknown>,
    updateMask: string,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`gads:${customerId}`);

    this.logger.debug({ entityType, customerId, entityId, updateMask }, "Updating Google Ads entity");

    const resourceName = buildResourceName(entityType, customerId, entityId);
    const mutateUrl = buildMutateUrl(entityType, customerId);

    const result = await this.httpClient.fetch(
      mutateUrl,
      context,
      {
        method: "POST",
        body: JSON.stringify({
          operations: [
            {
              update: { ...data, resourceName },
              updateMask: updateMask,
            },
          ],
        }),
      }
    );

    return result;
  }

  /**
   * Remove an entity using the :mutate endpoint.
   *
   * Google Ads mutate remove uses:
   *   POST /customers/{customerId}/{resource}:mutate
   *   Body: { operations: [{ remove: "customers/{id}/{resource}/{entityId}" }] }
   */
  async removeEntity(
    entityType: GAdsEntityType,
    customerId: string,
    entityId: string,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`gads:${customerId}`);

    this.logger.debug({ entityType, customerId, entityId }, "Removing Google Ads entity");

    const resourceName = buildResourceName(entityType, customerId, entityId);
    const mutateUrl = buildMutateUrl(entityType, customerId);

    const result = await this.httpClient.fetch(
      mutateUrl,
      context,
      {
        method: "POST",
        body: JSON.stringify({
          operations: [{ remove: resourceName }],
        }),
      }
    );

    return result;
  }

  // ─── Validate (Dry-Run) ──────────────────────────────────────────

  /**
   * Validate an entity payload without creating or modifying it.
   *
   * Uses the Google Ads `validateOnly: true` flag on the :mutate endpoint
   * to perform server-side validation without side effects.
   *
   * - "create" mode: validates a create operation
   * - "update" mode: validates an update operation (requires entityId + updateMask)
   */
  async validateEntity(
    entityType: GAdsEntityType,
    customerId: string,
    data: Record<string, unknown>,
    mode: "create" | "update",
    entityId?: string,
    updateMask?: string,
    context?: RequestContext
  ): Promise<{ valid: boolean; errors?: string[] }> {
    await this.rateLimiter.consume(`gads:${customerId}`);

    this.logger.debug({ entityType, customerId, mode }, "Validating Google Ads entity (dry-run)");

    const mutateUrl = buildMutateUrl(entityType, customerId);

    let operations: Array<Record<string, unknown>>;

    if (mode === "update") {
      if (!entityId || !updateMask) {
        return {
          valid: false,
          errors: ["entityId and updateMask are required for update mode validation"],
        };
      }
      const resourceName = buildResourceName(entityType, customerId, entityId);
      operations = [
        {
          update: { ...data, resourceName },
          updateMask,
        },
      ];
    } else {
      operations = [{ create: data }];
    }

    try {
      await this.httpClient.fetch(
        mutateUrl,
        context,
        {
          method: "POST",
          body: JSON.stringify({
            operations,
            validateOnly: true,
          }),
        }
      );
      return { valid: true };
    } catch (error: any) {
      const errorMessage = error?.message ?? String(error);
      const errorBody = error?.data?.errorBody ?? errorMessage;
      return { valid: false, errors: [errorBody] };
    }
  }

  // ─── Bulk Operations ──────────────────────────────────────────────

  /**
   * Execute multiple mutate operations in a single API call.
   * Supports mixed create/update/remove operations.
   *
   * Each operation should be an object with one of: { create }, { update, updateMask }, or { remove }
   */
  async bulkMutate(
    entityType: GAdsEntityType,
    customerId: string,
    operations: Array<Record<string, unknown>>,
    partialFailure?: boolean,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`gads:${customerId}`);

    this.logger.debug(
      { entityType, customerId, operationCount: operations.length },
      "Executing bulk mutate"
    );

    const mutateUrl = buildMutateUrl(entityType, customerId);

    const body: Record<string, unknown> = { operations };
    if (partialFailure) {
      body.partialFailure = true;
    }

    const result = await this.httpClient.fetch(
      mutateUrl,
      context,
      {
        method: "POST",
        body: JSON.stringify(body),
      }
    );

    return result;
  }

  // ─── Bid Adjustment ──────────────────────────────────────────────

  /**
   * Safe read-modify-write bid adjustment for ad groups.
   *
   * For each adjustment:
   * 1. Read: Fetch current ad group via GAQL to capture previous bid values
   * 2. Modify: Build update payload with new bid fields
   * 3. Write: Call :mutate with update operation and targeted updateMask
   *
   * Bid values are strings of micros (1,000,000 = $1.00 USD).
   */
  async adjustBids(
    customerId: string,
    adjustments: Array<{
      adGroupId: string;
      cpcBidMicros?: string;
      cpmBidMicros?: string;
    }>,
    context?: RequestContext
  ): Promise<{
    results: Array<{
      adGroupId: string;
      adGroupName?: string;
      success: boolean;
      previousCpcBidMicros?: string;
      previousCpmBidMicros?: string;
      newCpcBidMicros?: string;
      newCpmBidMicros?: string;
      error?: string;
    }>;
  }> {
    const results: Array<{
      adGroupId: string;
      adGroupName?: string;
      success: boolean;
      previousCpcBidMicros?: string;
      previousCpmBidMicros?: string;
      newCpcBidMicros?: string;
      newCpmBidMicros?: string;
      error?: string;
    }> = [];

    for (const adjustment of adjustments) {
      try {
        // 1. Read — fetch current ad group to capture previous bids
        const readQuery = `SELECT ad_group.id, ad_group.name, ad_group.cpc_bid_micros, ad_group.cpm_bid_micros FROM ad_group WHERE ad_group.id = ${adjustment.adGroupId}`;
        const { results: rows } = await this.gaqlSearch(customerId, readQuery, 1, undefined, context);

        if (rows.length === 0) {
          results.push({
            adGroupId: adjustment.adGroupId,
            success: false,
            error: `Ad group ${adjustment.adGroupId} not found in customer ${customerId}`,
          });
          continue;
        }

        const adGroupRow = rows[0] as Record<string, any>;
        const adGroup = adGroupRow.adGroup || adGroupRow.ad_group || {};
        const adGroupName = adGroup.name as string | undefined;
        const previousCpcBidMicros = adGroup.cpcBidMicros?.toString() ?? adGroup.cpc_bid_micros?.toString();
        const previousCpmBidMicros = adGroup.cpmBidMicros?.toString() ?? adGroup.cpm_bid_micros?.toString();

        // 2. Modify — build update payload with only the bid fields being changed
        const updateData: Record<string, unknown> = {};
        const maskFields: string[] = [];

        if (adjustment.cpcBidMicros !== undefined) {
          updateData.cpcBidMicros = adjustment.cpcBidMicros;
          maskFields.push("cpcBidMicros");
        }

        if (adjustment.cpmBidMicros !== undefined) {
          updateData.cpmBidMicros = adjustment.cpmBidMicros;
          maskFields.push("cpmBidMicros");
        }

        // 3. Write — call :mutate with update operation
        const resourceName = buildResourceName("adGroup", customerId, adjustment.adGroupId);
        const mutateUrl = buildMutateUrl("adGroup", customerId);

        await this.rateLimiter.consume(`gads:${customerId}`);

        await this.httpClient.fetch(mutateUrl, context, {
          method: "POST",
          body: JSON.stringify({
            operations: [
              {
                update: { ...updateData, resourceName },
                updateMask: maskFields.join(","),
              },
            ],
          }),
        });

        results.push({
          adGroupId: adjustment.adGroupId,
          adGroupName,
          success: true,
          previousCpcBidMicros,
          previousCpmBidMicros,
          newCpcBidMicros: adjustment.cpcBidMicros,
          newCpmBidMicros: adjustment.cpmBidMicros,
        });
      } catch (error: any) {
        this.logger.error(
          { adGroupId: adjustment.adGroupId, error: error?.message },
          "Bid adjustment failed for ad group"
        );
        results.push({
          adGroupId: adjustment.adGroupId,
          success: false,
          error: error?.message ?? String(error),
        });
      }
    }

    return { results };
  }

  // ─── Bulk Operations ──────────────────────────────────────────────

  /**
   * Batch update the status for multiple entities of the same type.
   * Uses individual update operations combined into a single :mutate call.
   */
  async bulkUpdateStatus(
    entityType: GAdsEntityType,
    customerId: string,
    entityIds: string[],
    status: "ENABLED" | "PAUSED" | "REMOVED",
    context?: RequestContext
  ): Promise<{ results: Array<{ entityId: string; success: boolean; error?: string }> }> {
    await this.rateLimiter.consume(`gads:${customerId}`);

    this.logger.debug(
      { entityType, customerId, count: entityIds.length, status },
      "Executing bulk status update"
    );

    const config = getEntityConfig(entityType);
    const mutateUrl = buildMutateUrl(entityType, customerId);

    // Reject entity types without a status field (e.g., campaignBudget, asset)
    if (!config.statusField && status !== "REMOVED") {
      return {
        results: entityIds.map((entityId) => ({
          entityId,
          success: false,
          error: `Entity type "${entityType}" does not have a status field and cannot be set to ${status}`,
        })),
      };
    }

    // Determine the status field based on entity type
    const statusFieldParts = (config.statusField || "").split(".");
    const statusProperty = statusFieldParts[statusFieldParts.length - 1] || "status";

    if (status === "REMOVED") {
      // Use remove operations for REMOVED status
      const operations = entityIds.map((entityId) => ({
        remove: buildResourceName(entityType, customerId, entityId),
      }));

      try {
        const result = (await this.httpClient.fetch(mutateUrl, context, {
          method: "POST",
          body: JSON.stringify({ operations, partialFailure: true }),
        })) as Record<string, unknown>;

        // Parse partial failure results (same pattern as ENABLED/PAUSED branch)
        const mutateResults = (result.results as Array<Record<string, unknown>>) || [];
        const partialErrors = result.partialFailureError as Record<string, unknown> | undefined;

        return {
          results: entityIds.map((entityId, idx) => {
            const hasResult = mutateResults[idx] && Object.keys(mutateResults[idx]).length > 0;
            return {
              entityId,
              success: hasResult || !partialErrors,
              error: !hasResult && partialErrors ? "Partial failure — check error details" : undefined,
            };
          }),
        };
      } catch (error: any) {
        return {
          results: entityIds.map((entityId) => ({
            entityId,
            success: false,
            error: error?.message ?? String(error),
          })),
        };
      }
    }

    // For ENABLED/PAUSED, use update operations
    const operations = entityIds.map((entityId) => ({
      update: {
        resourceName: buildResourceName(entityType, customerId, entityId),
        [statusProperty]: status,
      },
      updateMask: statusProperty,
    }));

    try {
      const result = (await this.httpClient.fetch(mutateUrl, context, {
        method: "POST",
        body: JSON.stringify({ operations, partialFailure: true }),
      })) as Record<string, unknown>;

      // Parse partial failure results
      const mutateResults = (result.results as Array<Record<string, unknown>>) || [];
      const partialErrors = result.partialFailureError as Record<string, unknown> | undefined;

      return {
        results: entityIds.map((entityId, idx) => {
          const hasResult = mutateResults[idx] && Object.keys(mutateResults[idx]).length > 0;
          return {
            entityId,
            success: hasResult || !partialErrors,
            error: !hasResult && partialErrors ? "Partial failure — check error details" : undefined,
          };
        }),
      };
    } catch (error: any) {
      return {
        results: entityIds.map((entityId) => ({
          entityId,
          success: false,
          error: error?.message ?? String(error),
        })),
      };
    }
  }
}
