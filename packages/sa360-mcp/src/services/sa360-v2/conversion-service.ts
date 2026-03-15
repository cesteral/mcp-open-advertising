// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { SA360V2HttpClient } from "./sa360-v2-http-client.js";
import type { RateLimiter } from "../../utils/security/rate-limiter.js";
import type { RequestContext } from "@cesteral/shared";

/**
 * Conversion row for SA360 v2 conversion insert/update.
 */
export interface ConversionRow {
  /** Click ID or Google click ID */
  clickId?: string;
  /** Google click ID */
  gclid?: string;
  /** Conversion ID (required for updates) */
  conversionId?: string;
  /** Conversion timestamp (epoch millis) */
  conversionTimestamp: string;
  /** Revenue amount (in advertiser's currency) */
  revenueMicros?: string;
  /** Currency code */
  currencyCode?: string;
  /** Quantity of conversions */
  quantityMillis?: string;
  /** Segment type (e.g., "FLOODLIGHT") */
  segmentationType: string;
  /** Segment name (floodlight activity name) */
  segmentationName?: string;
  /** Floodlight activity ID */
  floodlightActivityId?: string;
  /** Type of conversion */
  type?: string;
  /** State of the conversion */
  state?: string;
  /** Custom metric values */
  customMetric?: Array<{ name: string; value: number }>;
  /** Custom dimension values */
  customDimension?: Array<{ name: string; value: string }>;
}

/**
 * SA360 v2 Conversion Service
 *
 * Handles offline conversion insert/update via the legacy DoubleClick Search v2 API.
 * Endpoint: POST /doubleclicksearch/v2/conversion
 */
export class ConversionService {
  constructor(
    private readonly logger: Logger,
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: SA360V2HttpClient
  ) {}

  /**
   * Insert offline conversions.
   *
   * POST /conversion
   * Body: { conversion: [...rows], kind: "doubleclicksearch#conversionList" }
   */
  async insertConversions(
    agencyId: string,
    advertiserId: string,
    conversions: ConversionRow[],
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`sa360v2:${advertiserId}`);

    this.logger.debug(
      { agencyId, advertiserId, count: conversions.length },
      "Inserting SA360 conversions"
    );

    const conversionRows = conversions.map((c) => ({
      ...c,
      agencyId,
      advertiserId,
    }));

    const result = await this.httpClient.fetch(
      "/conversion",
      context,
      {
        method: "POST",
        body: JSON.stringify({
          kind: "doubleclicksearch#conversionList",
          conversion: conversionRows,
        }),
      }
    );

    return result;
  }

  /**
   * Update existing conversions.
   *
   * PUT /conversion
   * Body: { conversion: [...rows], kind: "doubleclicksearch#conversionList" }
   */
  async updateConversions(
    agencyId: string,
    advertiserId: string,
    conversions: ConversionRow[],
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume(`sa360v2:${advertiserId}`);

    this.logger.debug(
      { agencyId, advertiserId, count: conversions.length },
      "Updating SA360 conversions"
    );

    const conversionRows = conversions.map((c) => ({
      ...c,
      agencyId,
      advertiserId,
    }));

    const result = await this.httpClient.fetch(
      "/conversion",
      context,
      {
        method: "PUT",
        body: JSON.stringify({
          kind: "doubleclicksearch#conversionList",
          conversion: conversionRows,
        }),
      }
    );

    return result;
  }
}