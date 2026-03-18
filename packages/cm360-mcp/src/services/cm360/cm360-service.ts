// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { CM360HttpClient } from "./cm360-http-client.js";
import type { RateLimiter } from "../../utils/security/rate-limiter.js";
import { McpError, JsonRpcErrorCode, type RequestContext } from "@cesteral/shared";
import type { CM360EntityType } from "../../mcp-server/tools/utils/entity-mapping.js";
import { getEntityConfig } from "../../mcp-server/tools/utils/entity-mapping.js";

export class CM360Service {
  constructor(
    private readonly logger: Logger,
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: CM360HttpClient
  ) {}

  async listUserProfiles(context?: RequestContext): Promise<unknown> {
    await this.rateLimiter.consume("cm360");
    this.logger.debug({ requestId: context?.requestId }, "Listing CM360 user profiles");
    return this.httpClient.fetch("/userprofiles", context);
  }

  async listEntities(
    entityType: CM360EntityType,
    profileId: string,
    filters?: Record<string, unknown>,
    pageToken?: string,
    maxResults?: number,
    context?: RequestContext
  ): Promise<{ entities: unknown[]; nextPageToken?: string }> {
    await this.rateLimiter.consume("cm360");
    const config = getEntityConfig(entityType);

    const params = new URLSearchParams();
    if (pageToken) params.set("pageToken", pageToken);
    if (maxResults) params.set("maxResults", String(maxResults));
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null) {
          params.set(key, String(value));
        }
      }
    }

    const queryString = params.toString();
    const path = `/userprofiles/${profileId}/${config.apiCollection}${queryString ? `?${queryString}` : ""}`;

    const result = (await this.httpClient.fetch(path, context)) as Record<string, unknown>;
    const rawEntities = result[config.apiCollection];
    if (rawEntities === undefined) {
      this.logger.warn(
        { entityType, collection: config.apiCollection, responseKeys: Object.keys(result), requestId: context?.requestId },
        `CM360 API response missing expected collection key "${config.apiCollection}" — returning empty results`
      );
    }
    const entities = (rawEntities as unknown[]) || [];
    const nextPageToken = result.nextPageToken as string | undefined;

    return { entities, nextPageToken };
  }

  async getEntity(
    entityType: CM360EntityType,
    profileId: string,
    entityId: string,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume("cm360");
    const config = getEntityConfig(entityType);
    const path = `/userprofiles/${profileId}/${config.apiCollection}/${entityId}`;
    return this.httpClient.fetch(path, context);
  }

  async createEntity(
    entityType: CM360EntityType,
    profileId: string,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume("cm360");
    const config = getEntityConfig(entityType);
    const path = `/userprofiles/${profileId}/${config.apiCollection}`;
    return this.httpClient.fetch(path, context, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  async updateEntity(
    entityType: CM360EntityType,
    profileId: string,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume("cm360");
    const config = getEntityConfig(entityType);
    const path = `/userprofiles/${profileId}/${config.apiCollection}`;
    return this.httpClient.fetch(path, context, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  async listTargetingOptions(
    profileId: string,
    targetingType: string,
    filters?: Record<string, unknown>,
    pageToken?: string,
    maxResults?: number,
    context?: RequestContext
  ): Promise<{ options: unknown[]; nextPageToken?: string }> {
    await this.rateLimiter.consume("cm360");

    const params = new URLSearchParams();
    if (pageToken) params.set("pageToken", pageToken);
    if (maxResults) params.set("maxResults", String(maxResults));
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null) {
          params.set(key, String(value));
        }
      }
    }

    const queryString = params.toString();
    const path = `/userprofiles/${profileId}/${targetingType}${queryString ? `?${queryString}` : ""}`;

    const result = (await this.httpClient.fetch(path, context)) as Record<string, unknown>;
    const rawOptions = result[targetingType];
    if (rawOptions === undefined) {
      this.logger.warn(
        { targetingType, responseKeys: Object.keys(result), requestId: context?.requestId },
        `CM360 API response missing expected key "${targetingType}" — returning empty results`
      );
    }
    const options = (rawOptions as unknown[]) || [];
    const nextPageToken = result.nextPageToken as string | undefined;

    return { options, nextPageToken };
  }

  async deleteEntity(
    entityType: CM360EntityType,
    profileId: string,
    entityId: string,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume("cm360");
    const config = getEntityConfig(entityType);
    if (!config.supportsDelete) {
      throw new McpError(JsonRpcErrorCode.InvalidParams, `Delete is not supported for entity type: ${entityType}`);
    }
    const path = `/userprofiles/${profileId}/${config.apiCollection}/${entityId}`;
    return this.httpClient.fetch(path, context, { method: "DELETE" });
  }
}