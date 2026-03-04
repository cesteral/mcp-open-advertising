import type { LinkedInHttpClient } from "./linkedin-http-client.js";
import type { RateLimiter } from "../../utils/security/rate-limiter.js";
import type { RequestContext } from "@cesteral/shared";

/**
 * LinkedIn Reporting Service — Queries the adAnalytics API for performance data.
 *
 * LinkedIn Analytics uses an offset-based API at /v2/adAnalytics with:
 * - dateRange.start.year/month/day and dateRange.end.year/month/day
 * - pivot: CAMPAIGN, CAMPAIGN_GROUP, CREATIVE, MEMBER_COMPANY_SIZE, etc.
 * - timeGranularity: DAILY, MONTHLY, YEARLY, ALL
 * - metrics: impressions, clicks, costInUsd, conversions, etc.
 */
export class LinkedInReportingService {
  constructor(
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: LinkedInHttpClient
  ) {}

  /**
   * Get analytics metrics for an ad account.
   *
   * @param adAccountUrn - The ad account URN (e.g. urn:li:sponsoredAccount:123)
   * @param dateRange - Start and end dates as ISO strings (YYYY-MM-DD)
   * @param metrics - Array of metric names (e.g. impressions, clicks, costInUsd)
   * @param pivot - Dimension to pivot on (CAMPAIGN, CAMPAIGN_GROUP, CREATIVE, etc.)
   * @param timeGranularity - Time granularity (DAILY, MONTHLY, YEARLY, ALL)
   */
  async getAnalytics(
    adAccountUrn: string,
    dateRange: { start: string; end: string },
    metrics?: string[],
    pivot?: string,
    timeGranularity?: string,
    context?: RequestContext
  ): Promise<{ elements: unknown[]; paging?: unknown }> {
    await this.rateLimiter.consume(`linkedin:${adAccountUrn}`);

    const defaultMetrics = [
      "impressions",
      "clicks",
      "costInUsd",
      "conversions",
      "externalWebsiteConversions",
      "leadGenerationMailContactInfoShares",
      "oneClickLeads",
    ];

    const startDate = this.parseDateParts(dateRange.start);
    const endDate = this.parseDateParts(dateRange.end);

    const params: Record<string, string> = {
      q: "analytics",
      pivot: pivot ?? "CAMPAIGN",
      timeGranularity: timeGranularity ?? "DAILY",
      "accounts[0]": adAccountUrn,
      "dateRange.start.year": String(startDate.year),
      "dateRange.start.month": String(startDate.month),
      "dateRange.start.day": String(startDate.day),
      "dateRange.end.year": String(endDate.year),
      "dateRange.end.month": String(endDate.month),
      "dateRange.end.day": String(endDate.day),
      fields: (metrics ?? defaultMetrics).join(","),
    };

    const result = (await this.httpClient.get(
      "/v2/adAnalytics",
      params,
      context
    )) as Record<string, unknown>;

    return {
      elements: (result.elements as unknown[]) || [],
      paging: result.paging,
    };
  }

  /**
   * Get analytics with multiple pivot breakdowns for an ad account.
   *
   * @param adAccountUrn - The ad account URN
   * @param dateRange - Start and end dates as ISO strings (YYYY-MM-DD)
   * @param pivots - Array of pivot dimensions
   * @param metrics - Array of metric names
   * @param filters - Optional additional query filters
   */
  async getAnalyticsBreakdowns(
    adAccountUrn: string,
    dateRange: { start: string; end: string },
    pivots: string[],
    metrics?: string[],
    filters?: Record<string, string>,
    context?: RequestContext
  ): Promise<{ results: Array<{ pivot: string; elements: unknown[] }> }> {
    // Run one analytics query per pivot dimension
    const pivotResults = await Promise.all(
      pivots.map(async (pivot) => {
        const result = await this.getAnalytics(
          adAccountUrn,
          dateRange,
          metrics,
          pivot,
          filters?.timeGranularity,
          context
        );
        return { pivot, elements: result.elements };
      })
    );

    return { results: pivotResults };
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  private parseDateParts(dateStr: string): { year: number; month: number; day: number } {
    const [yearStr, monthStr, dayStr] = dateStr.split("-");
    const year = parseInt(yearStr ?? "2024", 10);
    const month = parseInt(monthStr ?? "1", 10);
    const day = parseInt(dayStr ?? "1", 10);

    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      throw new Error(
        `Invalid date format: "${dateStr}". Expected YYYY-MM-DD.`
      );
    }

    return { year, month, day };
  }
}
