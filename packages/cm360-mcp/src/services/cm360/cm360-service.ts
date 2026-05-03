// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { CM360HttpClient } from "./cm360-http-client.js";
import type { RateLimiter } from "@cesteral/shared";
import { McpError, JsonRpcErrorCode, type RequestContext } from "@cesteral/shared";
import type { CM360EntityType } from "../../mcp-server/tools/utils/entity-mapping.js";
import { getEntityConfig } from "../../mcp-server/tools/utils/entity-mapping.js";
import type { components } from "../../generated/types.js";

type CM360Campaign = components["schemas"]["Campaign"];
type CM360Placement = components["schemas"]["Placement"];
type CM360Ad = components["schemas"]["Ad"];
type CM360Creative = components["schemas"]["Creative"];
type CM360Site = components["schemas"]["Site"];
type CM360Advertiser = components["schemas"]["Advertiser"];
type CM360FloodlightActivity = components["schemas"]["FloodlightActivity"];
type CM360FloodlightConfiguration = components["schemas"]["FloodlightConfiguration"];

interface CM360EntityMap {
  campaign: CM360Campaign;
  placement: CM360Placement;
  ad: CM360Ad;
  creative: CM360Creative;
  site: CM360Site;
  advertiser: CM360Advertiser;
  floodlightActivity: CM360FloodlightActivity;
  floodlightConfiguration: CM360FloodlightConfiguration;
}

export type {
  CM360Campaign,
  CM360Placement,
  CM360Ad,
  CM360Creative,
  CM360Site,
  CM360Advertiser,
  CM360FloodlightActivity,
  CM360FloodlightConfiguration,
};

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

  async listEntities<T extends CM360EntityType>(
    entityType: T,
    profileId: string,
    filters?: Record<string, unknown>,
    pageToken?: string,
    maxResults?: number,
    context?: RequestContext
  ): Promise<{ entities: CM360EntityMap[T][]; nextPageToken?: string }> {
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
        {
          entityType,
          collection: config.apiCollection,
          responseKeys: Object.keys(result),
          requestId: context?.requestId,
        },
        `CM360 API response missing expected collection key "${config.apiCollection}" — returning empty results`
      );
    }
    const entities = ((rawEntities as unknown[]) || []) as CM360EntityMap[T][];
    const nextPageToken = result.nextPageToken as string | undefined;

    return { entities, nextPageToken };
  }

  async getEntity<T extends CM360EntityType>(
    entityType: T,
    profileId: string,
    entityId: string,
    context?: RequestContext
  ): Promise<CM360EntityMap[T]> {
    await this.rateLimiter.consume("cm360");
    const config = getEntityConfig(entityType);
    const path = `/userprofiles/${profileId}/${config.apiCollection}/${entityId}`;
    return this.httpClient.fetch(path, context) as Promise<CM360EntityMap[T]>;
  }

  async createEntity<T extends CM360EntityType>(
    entityType: T,
    profileId: string,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<CM360EntityMap[T]> {
    await this.rateLimiter.consume("cm360");
    const config = getEntityConfig(entityType);
    const path = `/userprofiles/${profileId}/${config.apiCollection}`;
    return this.httpClient.fetch(path, context, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }) as Promise<CM360EntityMap[T]>;
  }

  async updateEntity<T extends CM360EntityType>(
    entityType: T,
    profileId: string,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<CM360EntityMap[T]> {
    await this.rateLimiter.consume("cm360");
    const config = getEntityConfig(entityType);
    const path = `/userprofiles/${profileId}/${config.apiCollection}`;
    return this.httpClient.fetch(path, context, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }) as Promise<CM360EntityMap[T]>;
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
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `Delete is not supported for entity type: ${entityType}`
      );
    }
    const path = `/userprofiles/${profileId}/${config.apiCollection}/${entityId}`;
    return this.httpClient.fetch(path, context, { method: "DELETE" });
  }
}
