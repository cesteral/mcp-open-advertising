import type { MetaGraphApiClient } from "./meta-graph-api-client.js";
import type { RateLimiter } from "../../utils/security/rate-limiter.js";
import type { RequestContext } from "@cesteral/shared";

/**
 * Meta Targeting Service — Targeting search and browse operations.
 *
 * Supports interest search, interest validation, targeting suggestions,
 * and browsing targeting categories.
 */
export class MetaTargetingService {
  constructor(
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: MetaGraphApiClient
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

    const params: Record<string, string> = {
      type,
      q: query,
    };

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
      params.type = type;
    }

    return this.httpClient.get(`/${actId}/targetingbrowse`, params, context);
  }
}
