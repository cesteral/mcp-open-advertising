// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { RateLimiter, RequestContext } from "@cesteral/shared";
import type { {{Pascal}}HttpClient } from "./{{key}}-http-client.js";
import type { PageResult } from "./{{key}}-service.js";
import { ENTITY_PATHS, type {{Pascal}}EntityType } from "../../mcp-server/tools/utils/entity-mapping.js";

/**
 * Entity reads against the {{displayName}} API. Write methods are added when
 * the governed stub tools are implemented.
 *
 * TODO(scaffold): the paths in ENTITY_PATHS and the response shape below are
 * placeholders; replace them from the vendor's API reference.
 */
export class {{Pascal}}EntityService {
  constructor(
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: {{Pascal}}HttpClient,
    private readonly logger: Logger
  ) {}

  async listEntities(
    entityType: {{Pascal}}EntityType,
    accountId: string,
    pageToken: string | undefined,
    context?: RequestContext
  ): Promise<PageResult> {
    await this.rateLimiter.consume(`{{key}}:user:${this.httpClient.quotaUser}:account:${accountId}`);
    const body = (await this.httpClient.get(
      `/accounts/${encodeURIComponent(accountId)}/${ENTITY_PATHS[entityType]}`,
      pageToken ? { page_token: pageToken } : undefined,
      context
    )) as { data?: Record<string, unknown>[]; next_page_token?: string };
    this.logger.debug({ entityType, count: body.data?.length ?? 0 }, "Listed entities");
    return {
      items: body.data ?? [],
      ...(body.next_page_token ? { nextPageToken: body.next_page_token } : {}),
    };
  }

  async getEntity(
    entityType: {{Pascal}}EntityType,
    accountId: string,
    entityId: string,
    context?: RequestContext
  ): Promise<Record<string, unknown>> {
    await this.rateLimiter.consume(`{{key}}:user:${this.httpClient.quotaUser}:account:${accountId}`);
    return (await this.httpClient.get(
      `/accounts/${encodeURIComponent(accountId)}/${ENTITY_PATHS[entityType]}/${encodeURIComponent(entityId)}`,
      undefined,
      context
    )) as Record<string, unknown>;
  }
}
