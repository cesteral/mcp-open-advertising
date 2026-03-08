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
    // Process pivots sequentially to avoid rate limit bursts (typical: 2-5 pivots)
    const pivotResults: Array<{ pivot: string; elements: unknown[] }> = [];
    for (const pivot of pivots) {
      const result = await this.getAnalytics(
        adAccountUrn,
        dateRange,
        metrics,
        pivot,
        filters?.timeGranularity,
        context
      );
      pivotResults.push({ pivot, elements: result.elements });
    }

    return { results: pivotResults };
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  private parseDateParts(dateStr: string): { year: number; month: number; day: number } {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      throw new Error(
        `Invalid date format: "${dateStr}". Expected YYYY-MM-DD.`
      );
    }

    const [yearStr, monthStr, dayStr] = dateStr.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);

    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      throw new Error(
        `Invalid date format: "${dateStr}". Expected YYYY-MM-DD.`
      );
    }

    // Validate the date is actually real (rejects e.g. 2026-02-30)
    const testDate = new Date(year, month - 1, day);
    if (
      testDate.getFullYear() !== year ||
      testDate.getMonth() !== month - 1 ||
      testDate.getDate() !== day
    ) {
      throw new Error(
        `Invalid date: "${dateStr}" does not represent a real calendar date.`
      );
    }

    return { year, month, day };
  }
}
