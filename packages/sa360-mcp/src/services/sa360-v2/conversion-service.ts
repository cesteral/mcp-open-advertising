// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { SA360V2HttpClient } from "./sa360-v2-http-client.js";
import type { RateLimiter } from "@cesteral/shared";
import type { RequestContext } from "@cesteral/shared";

/**
 * Conversion row for SA360 v2 conversion insert/update.
 *
 * Every key is a property of the v2 `Conversion` resource (doubleclicksearch
 * v2 Discovery). There is no `gclid` or `floodlightActivityId` in that schema:
 * the click goes in `clickId` ("DS click ID") and the Floodlight activity in
 * `segmentationId` ("numeric segmentation identifier (for example, DoubleClick
 * Search Floodlight activity ID)") or `segmentationName`.
 */
export interface ConversionRow {
  /** DS click ID for the conversion. */
  clickId?: string;
  /**
   * Advertiser-provided conversion ID. Required for offline conversions: each
   * conversion in a request must carry a unique ID, and (ID, timestamp) must be
   * unique within the advertiser. Updates identify the conversion by it.
   */
  conversionId: string;
  /** Conversion timestamp (epoch millis UTC) */
  conversionTimestamp: string;
  /** Revenue of a TRANSACTION conversion, in micros */
  revenueMicros?: string;
  /** Currency code (ISO 4217) */
  currencyCode?: string;
  /** Quantity of this conversion, in millis */
  quantityMillis?: string;
  /** Segmentation type (e.g., "FLOODLIGHT") */
  segmentationType: string;
  /** Friendly segmentation identifier (e.g., Floodlight activity name) */
  segmentationName?: string;
  /** Numeric segmentation identifier (e.g., Floodlight activity ID) */
  segmentationId?: string;
  /** Type of conversion (ACTION or TRANSACTION) */
  type?: string;
  /** State of the conversion (ACTIVE or REMOVED) */
  state?: string;
  /** Custom metric values */
  customMetric?: Array<{ name: string; value: number }>;
  /** Custom dimension values */
  customDimension?: Array<{ name: string; value: string }>;
}

/**
 * The v2 `Conversion` properties this server sends. The request body is built
 * from this allowlist rather than by spreading the caller's row, so a key the
 * v2 schema does not define can never reach the API.
 */
const CONVERSION_ROW_KEYS = [
  "clickId",
  "conversionId",
  "conversionTimestamp",
  "revenueMicros",
  "currencyCode",
  "quantityMillis",
  "segmentationType",
  "segmentationName",
  "segmentationId",
  "type",
  "state",
  "customMetric",
  "customDimension",
] as const satisfies ReadonlyArray<keyof ConversionRow>;

/** Build one v2 `Conversion` request object. Exported for tests. */
export function toV2Conversion(
  row: ConversionRow,
  agencyId: string,
  advertiserId: string
): Record<string, unknown> {
  const out: Record<string, unknown> = { agencyId, advertiserId };
  const source = row as unknown as Record<string, unknown>;
  for (const key of CONVERSION_ROW_KEYS) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
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
    // Keys must match the limiter's `sa360:*` pattern. These were `sa360v2:…`,
    // which matches nothing, so the v2 API was never throttled.
    await this.rateLimiter.consume(`sa360:v2:${advertiserId}`);

    this.logger.debug(
      { agencyId, advertiserId, count: conversions.length },
      "Inserting SA360 conversions"
    );

    const conversionRows = conversions.map((c) => toV2Conversion(c, agencyId, advertiserId));

    const result = await this.httpClient.fetch("/conversion", context, {
      method: "POST",
      body: JSON.stringify({
        kind: "doubleclicksearch#conversionList",
        conversion: conversionRows,
      }),
    });

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
    await this.rateLimiter.consume(`sa360:v2:${advertiserId}`);

    this.logger.debug(
      { agencyId, advertiserId, count: conversions.length },
      "Updating SA360 conversions"
    );

    const conversionRows = conversions.map((c) => toV2Conversion(c, agencyId, advertiserId));

    const result = await this.httpClient.fetch("/conversion", context, {
      method: "PUT",
      body: JSON.stringify({
        kind: "doubleclicksearch#conversionList",
        conversion: conversionRows,
      }),
    });

    return result;
  }
}
