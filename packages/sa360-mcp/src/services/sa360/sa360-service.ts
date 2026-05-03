// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { SA360HttpClient } from "./sa360-http-client.js";
import type { RateLimiter } from "@cesteral/shared";
import type { RequestContext } from "@cesteral/shared";
import { type SA360EntityType } from "../../mcp-server/tools/utils/entity-mapping.js";
import { buildListQuery, buildGetByIdQuery } from "../../mcp-server/tools/utils/query-helpers.js";
import type { components } from "../../generated/types.js";

export type SA360SearchRow =
  components["schemas"]["GoogleAdsSearchads360V0Services__SearchAds360Row"];

/**
 * SA360 Service — SA360 query language queries, account listing, and entity reads
 * via the SA360 Reporting API v0.
 *
 * Read operations use SA360 query language via POST /customers/{customerId}/searchAds360:search
 * SA360 is read-only for entities (no mutate operations).
 */
export class SA360Service {
  constructor(
    private readonly logger: Logger,
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: SA360HttpClient
  ) {}

  // ─── SA360 Search ──────────────────────────────────────────────────

  /**
   * Execute a raw SA360 query against the SA360 Reporting API.
   * Uses the `search` endpoint (paginated).
   */
  async sa360Search(
    customerId: string,
    query: string,
    pageSize?: number,
    pageToken?: string,
    context?: RequestContext
  ): Promise<{ results: SA360SearchRow[]; nextPageToken?: string; totalResultsCount?: number }> {
    await this.rateLimiter.consume(`sa360:${customerId}`);

    this.logger.debug({ customerId, query: query.substring(0, 200) }, "Executing SA360 search");

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
      `/customers/${customerId}/searchAds360:search`,
      context,
      {
        method: "POST",
        body: JSON.stringify(body),
      }
    )) as Record<string, unknown>;

    return {
      results: ((result.results as unknown[]) || []) as SA360SearchRow[],
      nextPageToken: result.nextPageToken as string | undefined,
      totalResultsCount: result.totalResultsCount as number | undefined,
    };
  }

  // ─── Account Listing ──────────────────────────────────────────────

  /**
   * List SA360 customer accounts accessible to the authenticated user.
   * Uses the listAccessibleCustomers endpoint.
   */
  async listAccessibleCustomers(context?: RequestContext): Promise<{ resourceNames: string[] }> {
    await this.rateLimiter.consume("sa360:global");

    const result = (await this.httpClient.fetch("/customers:listAccessibleCustomers", context, {
      method: "GET",
    })) as Record<string, unknown>;

    return {
      resourceNames: (result.resourceNames as string[]) || [],
    };
  }

  // ─── Entity Read Operations ───────────────────────────────────────

  /**
   * Get a single entity by type and ID using an SA360 query.
   */
  async getEntity(
    entityType: SA360EntityType,
    customerId: string,
    entityId: string,
    context?: RequestContext
  ): Promise<SA360SearchRow> {
    const query = buildGetByIdQuery(entityType, entityId);
    const { results } = await this.sa360Search(customerId, query, 1, undefined, context);

    if (results.length === 0) {
      throw new Error(`${entityType} with ID ${entityId} not found in customer ${customerId}`);
    }

    return results[0];
  }

  /**
   * List entities of a given type with optional filters.
   */
  async listEntities(
    entityType: SA360EntityType,
    customerId: string,
    filters?: Record<string, string>,
    pageSize?: number,
    pageToken?: string,
    orderBy?: string,
    context?: RequestContext
  ): Promise<{ entities: SA360SearchRow[]; nextPageToken?: string; totalResultsCount?: number }> {
    const query = buildListQuery(entityType, filters, orderBy);
    const result = await this.sa360Search(customerId, query, pageSize, pageToken, context);

    return {
      entities: result.results,
      nextPageToken: result.nextPageToken,
      totalResultsCount: result.totalResultsCount,
    };
  }

  // ─── Field Discovery ──────────────────────────────────────────────

  /**
   * Search for available fields, resources, and metrics in the SA360 API.
   * Uses the searchAds360Fields endpoint.
   */
  async searchFields(
    query: string,
    pageSize?: number,
    context?: RequestContext
  ): Promise<{ fields: unknown[]; totalSize?: number }> {
    await this.rateLimiter.consume("sa360:global");

    const body: Record<string, unknown> = { query };
    if (pageSize) {
      body.pageSize = pageSize;
    }

    const result = (await this.httpClient.fetch("/searchAds360Fields:search", context, {
      method: "POST",
      body: JSON.stringify(body),
    })) as Record<string, unknown>;

    return {
      fields: (result.results as unknown[]) || [],
      totalSize: result.totalSize as number | undefined,
    };
  }

  // ─── Custom Columns ──────────────────────────────────────────────

  /**
   * List custom columns for a customer account.
   */
  async listCustomColumns(
    customerId: string,
    context?: RequestContext
  ): Promise<{ customColumns: unknown[] }> {
    await this.rateLimiter.consume(`sa360:${customerId}`);

    const result = (await this.httpClient.fetch(`/customers/${customerId}/customColumns`, context, {
      method: "GET",
    })) as Record<string, unknown>;

    return {
      customColumns: (result.customColumns as unknown[]) || [],
    };
  }
}
