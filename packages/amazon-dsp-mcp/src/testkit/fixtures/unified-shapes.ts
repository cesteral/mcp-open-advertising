// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Scrubbed Unified API entity builders shared by the fixture modules.
 * Shapes follow unified-api-dsp.json (amzn/ads-advanced-tools-docs @
 * e25aace0): `DSPCampaign` (budgets[], flights[], read-only top-level dates)
 * and `DSPAdGroup` (budgets[], bid with read-only currencyCode, top-level
 * dates). Hand-authored, not live captures.
 */

export const advertiserId = "advertiser-REDACTED-001";
export const profileId = "profile-REDACTED-001";

/** A `DSPCreateBudget` (create/update shape — `value` only, no currencyCode). */
export function monetaryBudget(
  value: number,
  recurrenceTimePeriod: "DAILY" | "LIFETIME" | "MONTHLY"
): Record<string, unknown> {
  return {
    budgetType: "MONETARY",
    budgetValue: { monetaryBudgetValue: { monetaryBudget: { value } } },
    recurrenceTimePeriod,
  };
}

/** A `DSPBudget` (read shape — carries the advertiser currency). */
function readBudget(
  value: number,
  recurrenceTimePeriod: "DAILY" | "LIFETIME"
): Record<string, unknown> {
  return {
    budgetType: "MONETARY",
    budgetValue: { monetaryBudgetValue: { monetaryBudget: { value, currencyCode: "USD" } } },
    recurrenceTimePeriod,
  };
}

/** A `DSPCampaign` read shape with one flight and a LIFETIME budget. */
export function campaign(
  campaignId: string,
  name: string,
  state: string,
  lifetimeBudget: number
): Record<string, unknown> {
  return {
    campaignId,
    adProduct: "AMAZON_DSP",
    name,
    state,
    budgets: [readBudget(lifetimeBudget, "LIFETIME")],
    flights: [
      {
        flightId: `${campaignId}-flight-1`,
        startDateTime: "2026-01-01T00:00:00Z",
        endDateTime: "2026-12-31T00:00:00Z",
        budget: {
          budgetType: "MONETARY",
          budgetValue: {
            monetaryBudgetValue: { monetaryBudget: { value: lifetimeBudget, currencyCode: "USD" } },
          },
        },
      },
    ],
    startDateTime: "2026-01-01T00:00:00Z",
    endDateTime: "2026-12-31T00:00:00Z",
    optimizations: { bidSettings: { bidStrategy: "SPEND_BUDGET_IN_FULL" } },
    creationDateTime: "2025-12-01T00:00:00Z",
    lastUpdatedDateTime: "2025-12-01T00:00:00Z",
  };
}

/** A `DSPAdGroup` read shape with a DAILY budget. */
export function adGroup(
  adGroupId: string,
  name: string,
  state: string,
  dailyBudget: number
): Record<string, unknown> {
  return {
    adGroupId,
    campaignId: "cmp-REDACTED-1",
    adProduct: "AMAZON_DSP",
    name,
    state,
    inventoryType: "DISPLAY",
    bid: { baseBid: 1.5, currencyCode: "USD" },
    budgets: [readBudget(dailyBudget, "DAILY")],
    startDateTime: "2026-01-01T00:00:00Z",
    endDateTime: "2026-06-30T00:00:00Z",
    creationDateTime: "2025-12-01T00:00:00Z",
    lastUpdatedDateTime: "2025-12-01T00:00:00Z",
  };
}
