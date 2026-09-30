import { describe, it, expect } from "vitest";
import {
  buildGAdsDuplicateCopy,
  CAMPAIGN_BIDDING_SELECT_FIELDS,
} from "../../src/mcp-server/tools/utils/duplicate-copy.js";

// 2026-09-30 10:00 UTC — the latest calendar date anywhere (UTC+14) is 2026-10-01.
const NOW = new Date("2026-09-30T10:00:00Z");

// Field names and enums: googleads v23 Discovery (revision 20260929),
// `Resources__Campaign` and the `Common__*` bidding schemes.
function campaign(extra: Record<string, unknown> = {}) {
  return {
    campaign: {
      resourceName: "customers/1/campaigns/111",
      id: "111",
      name: "Source",
      status: "ENABLED",
      advertisingChannelType: "SEARCH",
      campaignBudget: "customers/1/campaignBudgets/9",
      biddingStrategyType: "MANUAL_CPC",
      manualCpc: { enhancedCpcEnabled: false },
      ...extra,
    },
  };
}

const build = (row: Record<string, unknown>, options?: Record<string, unknown>) =>
  buildGAdsDuplicateCopy("campaign", row, options, NOW);

describe("buildGAdsDuplicateCopy — bidding", () => {
  it("copies a standard scheme with its parameters and never sends biddingStrategyType", () => {
    const { payload } = build(
      campaign({
        biddingStrategyType: "TARGET_CPA",
        manualCpc: undefined,
        targetCpa: { targetCpaMicros: "2500000", cpcBidCeilingMicros: "9000000" },
      })
    );
    expect(payload.targetCpa).toEqual({
      targetCpaMicros: "2500000",
      cpcBidCeilingMicros: "9000000",
    });
    expect(payload).not.toHaveProperty("biddingStrategyType");
    expect(payload).not.toHaveProperty("manualCpc");
  });

  it("sends a parameterless scheme as {} (Common__ManualCpm has no properties)", () => {
    const { payload } = build(
      campaign({ biddingStrategyType: "MANUAL_CPM", manualCpc: undefined })
    );
    expect(payload.manualCpm).toEqual({});
  });

  it("copies MAXIMIZE_CONVERSIONS even when the read returns no parameters", () => {
    const { payload } = build(
      campaign({ biddingStrategyType: "MAXIMIZE_CONVERSIONS", manualCpc: undefined })
    );
    expect(payload.maximizeConversions).toEqual({});
  });

  it("copies a portfolio strategy by resource name and no standard scheme", () => {
    const { payload } = build(
      campaign({
        biddingStrategyType: "TARGET_ROAS",
        biddingStrategy: "customers/1/biddingStrategies/77",
        manualCpc: undefined,
      })
    );
    expect(payload.biddingStrategy).toBe("customers/1/biddingStrategies/77");
    expect(payload).not.toHaveProperty("targetRoas");
  });

  it("refuses a type it cannot copy faithfully (TARGET_CPM's frequency goal is not read)", () => {
    expect(() =>
      build(campaign({ biddingStrategyType: "TARGET_CPM", manualCpc: undefined }))
    ).toThrow(/TARGET_CPM.*cannot copy faithfully/);
  });

  it("refuses when the bidding strategy type could not be read", () => {
    expect(() => build(campaign({ biddingStrategyType: undefined }))).toThrow(
      /no biddingStrategyType/
    );
  });

  it("lets a scheme in options replace the source's, without sending two", () => {
    const { payload } = build(campaign(), { targetSpend: { targetSpendMicros: "1000000" } });
    expect(payload.targetSpend).toEqual({ targetSpendMicros: "1000000" });
    expect(payload).not.toHaveProperty("manualCpc");
  });

  it("selects the type, the portfolio strategy and every scheme parameter", () => {
    expect(CAMPAIGN_BIDDING_SELECT_FIELDS).toEqual(
      expect.arrayContaining([
        "campaign.bidding_strategy_type",
        "campaign.bidding_strategy",
        "campaign.target_cpa.target_cpa_micros",
        "campaign.maximize_conversion_value.target_roas",
        "campaign.target_impression_share.location_fraction_micros",
        "campaign.manual_cpc.enhanced_cpc_enabled",
      ])
    );
    // Parameterless schemes are identified by the type alone, never selected.
    expect(CAMPAIGN_BIDDING_SELECT_FIELDS.some((f) => f.startsWith("campaign.manual_cpm"))).toBe(
      false
    );
  });
});

describe("buildGAdsDuplicateCopy — dates", () => {
  it("omits a start that has passed, and says so", () => {
    const { payload, adjustments } = build(
      campaign({ startDateTime: "2026-01-01 00:00:00", endDateTime: "2027-01-31 23:59:59" })
    );
    expect(payload).not.toHaveProperty("startDateTime");
    expect(payload.endDateTime).toBe("2027-01-31 23:59:59");
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0]).toMatch(/startDateTime omitted/);
  });

  it("omits a start dated today at UTC+14, which may already have passed for the customer", () => {
    const { payload } = build(campaign({ startDateTime: "2026-10-01 00:00:00" }));
    expect(payload).not.toHaveProperty("startDateTime");
  });

  it("keeps a start that is in the future everywhere", () => {
    const { payload, adjustments } = build(campaign({ startDateTime: "2026-10-02 00:00:00" }));
    expect(payload.startDateTime).toBe("2026-10-02 00:00:00");
    expect(adjustments).toEqual([]);
  });

  it("keeps the caller's startDateTime from options unadjusted", () => {
    const { payload, adjustments } = build(campaign({ startDateTime: "2026-01-01 00:00:00" }), {
      startDateTime: "2026-11-01 00:00:00",
    });
    expect(payload.startDateTime).toBe("2026-11-01 00:00:00");
    expect(adjustments).toEqual([]);
  });

  it("refuses a source whose end has passed, rather than copying it to run indefinitely", () => {
    expect(() => build(campaign({ endDateTime: "2026-06-30 23:59:59" }))).toThrow(
      /endDateTime 2026-06-30 23:59:59 may already have passed/
    );
  });

  it("accepts an ended source when options sets a new end", () => {
    const { payload } = build(campaign({ endDateTime: "2026-06-30 23:59:59" }), {
      endDateTime: "2026-12-31 23:59:59",
    });
    expect(payload.endDateTime).toBe("2026-12-31 23:59:59");
  });

  it("accepts an ended source when options.endDateTime is null (run indefinitely)", () => {
    const { payload } = build(campaign({ endDateTime: "2026-06-30 23:59:59" }), {
      endDateTime: null,
    });
    expect(payload).not.toHaveProperty("endDateTime");
  });
});

describe("buildGAdsDuplicateCopy — status", () => {
  it("forces PAUSED and reports an ignored status override", () => {
    const { payload, ignoredStatus } = build(campaign(), { status: "ENABLED" });
    expect(payload.status).toBe("PAUSED");
    expect(ignoredStatus).toBe("ENABLED");
  });
});
