import type { Logger } from "pino";
import type { TtdHttpClient } from "./ttd-http-client.js";
import type { RateLimiter } from "../../utils/security/rate-limiter.js";
import type { RequestContext } from "../../utils/internal/request-context.js";
import { getEntityConfig, type TtdEntityType } from "../../mcp-server/tools/utils/entity-mapping.js";

/**
 * TTD Service — Generic CRUD operations for TTD entities.
 *
 * Uses entity-mapping.ts for path construction and the TtdHttpClient
 * for authenticated HTTP calls with retry logic.
 */
export class TtdService {
  constructor(
    private readonly logger: Logger,
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: TtdHttpClient
  ) {}

  async listEntities(
    entityType: TtdEntityType,
    filters: Record<string, unknown>,
    pageToken?: string,
    pageSize?: number,
    context?: RequestContext
  ): Promise<{ entities: unknown[]; nextPageToken?: string }> {
    const config = getEntityConfig(entityType);
    const partnerId = this.httpClient.partnerId;

    await this.rateLimiter.consume(`ttd:${partnerId}`);

    this.logger.debug({ entityType, partnerId }, "Listing TTD entities");

    // TTD v3 uses POST for queries/list operations
    const body: Record<string, unknown> = {
      ...filters,
      PageSize: pageSize || 25,
    };

    if (entityType === "advertiser") {
      body.PartnerId = partnerId;
    }

    if (pageToken) {
      body.PageStartIndex = parseInt(pageToken, 10) || 0;
    }

    const result = (await this.httpClient.fetch(
      `${config.apiPath}/query`,
      context,
      {
        method: "POST",
        body: JSON.stringify(body),
      }
    )) as Record<string, unknown>;

    // TTD returns { Result: [...], TotalCount, ResultCount }
    const entities = (result.Result as unknown[]) || [];
    const totalCount = (result.TotalCount as number) || 0;
    const resultCount = (result.ResultCount as number) || 0;
    const startIndex = pageToken ? parseInt(pageToken, 10) || 0 : 0;
    const nextStartIndex = startIndex + resultCount;

    return {
      entities,
      nextPageToken: nextStartIndex < totalCount ? String(nextStartIndex) : undefined,
    };
  }

  async getEntity(
    entityType: TtdEntityType,
    entityId: string,
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);
    const partnerId = this.httpClient.partnerId;

    await this.rateLimiter.consume(`ttd:${partnerId}`);

    return this.httpClient.fetch(
      `${config.apiPath}/${entityId}`,
      context,
      { method: "GET" }
    );
  }

  async createEntity(
    entityType: TtdEntityType,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);
    const partnerId = this.httpClient.partnerId;

    await this.rateLimiter.consume(`ttd:${partnerId}`);

    return this.httpClient.fetch(
      config.apiPath,
      context,
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    );
  }

  async updateEntity(
    entityType: TtdEntityType,
    entityId: string,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    const config = getEntityConfig(entityType);
    const partnerId = this.httpClient.partnerId;

    await this.rateLimiter.consume(`ttd:${partnerId}`);

    return this.httpClient.fetch(
      `${config.apiPath}/${entityId}`,
      context,
      {
        method: "PUT",
        body: JSON.stringify(data),
      }
    );
  }

  async deleteEntity(
    entityType: TtdEntityType,
    entityId: string,
    context?: RequestContext
  ): Promise<void> {
    const config = getEntityConfig(entityType);
    const partnerId = this.httpClient.partnerId;

    await this.rateLimiter.consume(`ttd:${partnerId}`);

    await this.httpClient.fetch(
      `${config.apiPath}/${entityId}`,
      context,
      { method: "DELETE" }
    );
  }
}
