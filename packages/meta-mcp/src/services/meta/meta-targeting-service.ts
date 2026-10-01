// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { MetaGraphApiClient } from "./meta-graph-api-client.js";
import type { RateLimiter } from "@cesteral/shared";
import type { RequestContext } from "@cesteral/shared";
import type { Logger } from "pino";
import {
  consumeMetaAccountQuota,
  consumeMetaUserQuota,
  normalizeMetaAdAccountId,
} from "./rate-limit-keys.js";

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
    context?: RequestContext,
    after?: string,
    targetingClass?: string
  ): Promise<unknown> {
    await consumeMetaUserQuota(this.rateLimiter, this.httpClient);

    // Normalize type to lowercase, matching facebook-python-business-sdk's
    // TargetingSearchTypes (e.g. "adinterest", "adtargetingcategory").
    // (facebook-php-business-sdk spells the latter "adTargetingCategory".)
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

    // `class` narrows adTargetingCategory searches (facebook-php-business-sdk
    // TargetingSearch::search($type, $class, $query)).
    if (targetingClass) {
      params.class = targetingClass;
    }

    if (limit) {
      params.limit = String(limit);
    }

    if (after) {
      params.after = after;
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
    await consumeMetaAccountQuota(this.rateLimiter, this.httpClient, adAccountId);

    const actId = normalizeMetaAdAccountId(adAccountId);

    const params: Record<string, string> = {};
    if (type) {
      // `targetingbrowse` filters by `limit_type`, not `type`: Meta's
      // facebook-business-sdk-codegen spec (api_specs/specs/AdAccount.json,
      // GET targetingbrowse) lists excluded_category, include_nodes,
      // is_exclusion, is_reserved, limit_type, optimization_goal,
      // regulated_categories, regulated_countries and whitelisted_types — no
      // `type` — so a `type=` filter was silently ignored and every category
      // came back. The `limit_type` enum values are lowercase
      // (`adaccounttargetingbrowse_limit_type_enum_param`: behaviors,
      // interests, life_events, …).
      params.limit_type = type.toLowerCase();
    }

    return this.httpClient.get(`/${actId}/targetingbrowse`, params, context);
  }
}
