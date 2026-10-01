import { describe, expect, it } from "vitest";
import {
  ANALYTICS_MAX_ELEMENTS,
  ANALYTICS_MAX_FIELDS,
  DEFAULT_ANALYTICS_METRICS,
  LINKEDIN_ANALYTICS_PIVOTS,
  analyticsTruncationWarning,
  resolveAnalyticsFields,
} from "../../src/services/linkedin/analytics-fields.js";
import { GetAnalyticsInputSchema } from "../../src/mcp-server/tools/definitions/get-analytics.tool.js";
import { GetAnalyticsBreakdownsInputSchema } from "../../src/mcp-server/tools/definitions/get-analytics-breakdowns.tool.js";

// Every expectation here is from LinkedIn's Ad Analytics docs, read 2026-10-01:
// https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/ads-reporting
// https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/ads-reporting-schema
//
// - `fields` takes metric names, at most 20; with none, only impressions and clicks
//   come back. `dateRange` and `pivotValues` are fields too, and without them
//   the rows cannot be attributed to a pivot value or a date.
// - `conversions`, `reach`, `frequency`, `videoStarted`, `clickThroughRate`,
//   `costPerConversion` and `averageDailyReach` are not fields.
// - The geo pivots are MEMBER_COUNTRY_V2 and MEMBER_REGION_V2.

describe("resolveAnalyticsFields", () => {
  it("defaults to documented metrics, with dateRange and pivotValues so rows are attributable", () => {
    const fields = resolveAnalyticsFields(undefined);
    expect(fields).toEqual(expect.arrayContaining(["impressions", "clicks", "costInUsd"]));
    expect(fields).toContain("dateRange");
    expect(fields).toContain("pivotValues");
    expect(fields).not.toContain("conversions");
    expect(fields.length).toBeLessThanOrEqual(ANALYTICS_MAX_FIELDS);
    expect(new Set(fields).size).toBe(fields.length);
  });

  it("keeps the caller's metrics, in order, and adds dateRange and pivotValues after them", () => {
    expect(resolveAnalyticsFields(["impressions", "videoViews"])).toEqual([
      "impressions",
      "videoViews",
      "dateRange",
      "pivotValues",
    ]);
  });

  it("does not duplicate a field the caller already asked for", () => {
    expect(resolveAnalyticsFields(["pivotValues", "clicks", "clicks"])).toEqual([
      "pivotValues",
      "clicks",
      "dateRange",
    ]);
  });

  it("treats an empty list as no list", () => {
    expect(resolveAnalyticsFields([])).toEqual(resolveAnalyticsFields(undefined));
  });

  it("refuses more than 20 fields, counting the two it adds, and says how many are allowed", () => {
    const metrics = Array.from({ length: 19 }, (_, i) => `impressions${i}`);
    expect(() => resolveAnalyticsFields(metrics)).toThrow(/at most 20/);
    // 18 metrics plus the two it adds is exactly 20.
    expect(resolveAnalyticsFields(metrics.slice(0, 18))).toHaveLength(20);
  });

  it.each([
    ["conversions", /externalWebsiteConversions/],
    ["reach", /approximateMemberReach/],
    ["videoStarted", /videoStarts/],
    ["frequency", /compute|not a LinkedIn/i],
    ["clickThroughRate", /compute|not a LinkedIn/i],
    ["costPerConversion", /compute|not a LinkedIn/i],
    ["averageDailyReach", /approximateMemberReach|not a LinkedIn/i],
  ])("refuses %s, which is not a LinkedIn field, and names what to use", (name, hint) => {
    expect(() => resolveAnalyticsFields(["impressions", name])).toThrow(hint);
  });
});

describe("pivots", () => {
  it("accepts every pivot LinkedIn documents for the analytics finder at 202608", () => {
    for (const pivot of [
      "COMPANY",
      "ACCOUNT",
      "SHARE",
      "CAMPAIGN",
      "CREATIVE",
      "CAMPAIGN_GROUP",
      "CONVERSION",
      "CONVERSATION_NODE",
      "CONVERSATION_NODE_OPTION_INDEX",
      "SERVING_LOCATION",
      "CARD_INDEX",
      "MEMBER_COMPANY_SIZE",
      "MEMBER_INDUSTRY",
      "MEMBER_SENIORITY",
      "MEMBER_JOB_TITLE",
      "MEMBER_JOB_FUNCTION",
      "MEMBER_COUNTRY_V2",
      "MEMBER_REGION_V2",
      "MEMBER_COMPANY",
      "PLACEMENT_NAME",
      "IMPRESSION_DEVICE_TYPE",
      "EVENT_STAGE",
    ]) {
      expect(LINKEDIN_ANALYTICS_PIVOTS, pivot).toContain(pivot);
    }
  });

  it("rejects the removed geo pivots and the one that needs 202609", () => {
    for (const pivot of ["MEMBER_COUNTRY", "MEMBER_REGION", "MEMBER_GEO_COUNTRY"]) {
      expect(LINKEDIN_ANALYTICS_PIVOTS as readonly string[], pivot).not.toContain(pivot);
    }
    // Available only from 202609; this server pins 202608.
    expect(LINKEDIN_ANALYTICS_PIVOTS as readonly string[]).not.toContain(
      "MEMBER_DESIGNATED_MARKET_AREA"
    );
  });

  it("is enforced by both tools, so a removed pivot fails before it reaches LinkedIn", () => {
    const base = { adAccountUrn: "urn:li:sponsoredAccount:1", datePreset: "LAST_7_DAYS" as const };
    expect(GetAnalyticsInputSchema.safeParse({ ...base, pivot: "MEMBER_COUNTRY_V2" }).success).toBe(
      true
    );
    expect(GetAnalyticsInputSchema.safeParse({ ...base, pivot: "MEMBER_COUNTRY" }).success).toBe(
      false
    );
    expect(
      GetAnalyticsBreakdownsInputSchema.safeParse({
        ...base,
        pivots: ["CAMPAIGN", "MEMBER_REGION_V2"],
      }).success
    ).toBe(true);
    expect(
      GetAnalyticsBreakdownsInputSchema.safeParse({
        ...base,
        pivots: ["CAMPAIGN", "MEMBER_REGION"],
      }).success
    ).toBe(false);
  });
});

describe("metric limits on the tool schemas", () => {
  it("caps metrics at 20, LinkedIn's limit", () => {
    const base = { adAccountUrn: "urn:li:sponsoredAccount:1", datePreset: "LAST_7_DAYS" as const };
    const twentyOne = Array.from({ length: 21 }, (_, i) => `m${i}`);
    expect(GetAnalyticsInputSchema.safeParse({ ...base, metrics: twentyOne }).success).toBe(false);
    expect(
      GetAnalyticsBreakdownsInputSchema.safeParse({
        ...base,
        pivots: ["CAMPAIGN"],
        metrics: twentyOne,
      }).success
    ).toBe(false);
  });
});

describe("analyticsTruncationWarning", () => {
  it("warns when a response reaches LinkedIn's 15,000-element cap, since there is no next page", () => {
    expect(analyticsTruncationWarning(ANALYTICS_MAX_ELEMENTS - 1)).toBeUndefined();
    const warning = analyticsTruncationWarning(ANALYTICS_MAX_ELEMENTS);
    expect(warning).toMatch(/15,000/);
    expect(warning).toMatch(/narrow|shorter|filter/i);
  });
});

describe("defaults", () => {
  it("are all valid metric names (the old default included `conversions`)", () => {
    for (const metric of DEFAULT_ANALYTICS_METRICS) {
      expect(() => resolveAnalyticsFields([metric]), metric).not.toThrow();
    }
  });
});
