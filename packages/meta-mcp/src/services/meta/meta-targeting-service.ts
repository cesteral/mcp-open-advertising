// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { MetaGraphApiClient } from "./meta-graph-api-client.js";
import type { RateLimiter } from "@cesteral/shared";
import type { RequestContext } from "@cesteral/shared";
import type { Logger } from "pino";

/**
 * Meta Targeting Service — Targeting search and browse operations.
 *
 * Supports interest search, interest validation, targeting suggestions,
 * and browsing targeting categories.
 */
export class MetaTargetingService {
  constructor(
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: MetaGraphApiClient,
    private readonly logger: Logger
  ) {}

  /**
   * Search for targeting options (interests, behaviors, demographics, etc.)
   */
  async searchTargeting(
    type: string,
    query: string,
    limit?: number,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`meta:default`);

    // Normalize type to lowercase — Meta API search types are case-sensitive
    // and expect lowercase (e.g., "adinterest", "adinterestsuggestion")
    const normalizedType = type.toLowerCase();

    const params: Record<string, string> = {
      type: normalizedType,
    };

    // adinterestsuggestion requires interest_list instead of q
    if (normalizedType === "adinterestsuggestion") {
      this.logger.debug(
        { type: normalizedType },
        "Using interest_list param for adinterestsuggestion type"
      );
      params.interest_list = query;
    } else {
      params.q = query;
    }

    if (limit) {
      params.limit = String(limit);
    }

    return this.httpClient.get("/search", params, context);
  }

  /**
   * Browse targeting options by category.
   */
  async getTargetingOptions(
    adAccountId: string,
    type?: string,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`meta:default`);

    const actId = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;

    const params: Record<string, string> = {};
    if (type) {
      // Normalize to lowercase — Meta API targeting types are case-sensitive
      params.type = type.toLowerCase();
    }

    return this.httpClient.get(`/${actId}/targetingbrowse`, params, context);
  }
}
