// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/services/session-services.js", () => ({
  sessionServiceStore: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    getAuthContext: vi.fn(),
  },
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    resolveSessionServicesFromStore: vi.fn(),
  };
});

import { resolveSessionServicesFromStore } from "@cesteral/shared";
const mockResolveSession = vi.mocked(resolveSessionServicesFromStore);

import {
  getCampaignForecastLogic,
  getCampaignForecastTool,
  getCampaignForecastResponseFormatter,
  GetCampaignForecastInputSchema,
} from "../../src/mcp-server/tools/definitions/get-campaign-forecast.tool.js";

const mockRetrieveForecast = vi.fn();

beforeEach(() => {
  mockRetrieveForecast.mockReset();
  mockResolveSession.mockReturnValue({
    amazonDspV1Service: { retrieveCampaignForecast: mockRetrieveForecast },
  } as never);
});

const baseContext = { requestId: "test-req" } as never;
const baseSdkContext = { sessionId: "test-session" } as never;

describe("amazon_dsp_get_campaign_forecast", () => {
  it("is a plain readOnly tool with no cesteral governance annotation", () => {
    expect(getCampaignForecastTool.name).toBe("amazon_dsp_get_campaign_forecast");
    expect(getCampaignForecastTool.annotations.readOnlyHint).toBe(true);
    expect(
      (getCampaignForecastTool.annotations as { cesteral?: unknown }).cesteral
    ).toBeUndefined();
  });

  it("input schema requires campaignForecastDescriptions, exactly 1 entry, with campaignId", () => {
    expect(
      GetCampaignForecastInputSchema.safeParse({
        profileId: "p1",
        campaignForecastDescriptions: [],
      }).success
    ).toBe(false);
    expect(
      GetCampaignForecastInputSchema.safeParse({
        profileId: "p1",
        campaignForecastDescriptions: [{ campaignId: "cmp-1" }, { campaignId: "cmp-2" }],
      }).success
    ).toBe(false);
    expect(
      GetCampaignForecastInputSchema.safeParse({
        profileId: "p1",
        campaignForecastDescriptions: [{ campaignId: "cmp-1" }],
      }).success
    ).toBe(true);
  });

  it("calls retrieveCampaignForecast with the wrapped request body", async () => {
    const body = { success: [], error: [] };
    mockRetrieveForecast.mockResolvedValueOnce(body);

    await getCampaignForecastLogic(
      {
        profileId: "1234567890",
        campaignForecastDescriptions: [{ campaignId: "cmp-1", flightIds: ["fl-1"] }],
      },
      baseContext,
      baseSdkContext
    );

    expect(mockRetrieveForecast).toHaveBeenCalledWith(
      {
        campaignForecastDescriptions: [{ campaignId: "cmp-1", flightIds: ["fl-1"] }],
      },
      baseContext
    );
  });

  it("formatter counts warnings nested in success[].campaignForecast.flightForecasts[].warnings", () => {
    const out = getCampaignForecastResponseFormatter({
      response: {
        success: [
          {
            campaignForecast: {
              campaignDisplayName: "x",
              campaignForecastDescription: { campaignId: "cmp-1" },
              creationDateTime: "2026-05-28T00:00:00+00:00",
              flightForecasts: [
                {
                  flightId: "fl-1",
                  forecastEndDateTime: "2026-06-01T00:00:00+00:00",
                  forecastStartDateTime: "2026-05-29T00:00:00+00:00",
                  warnings: [
                    { code: "W1", message: "first" },
                    { code: "W2", message: "second" },
                  ],
                },
                {
                  flightId: "fl-2",
                  forecastEndDateTime: "2026-06-15T00:00:00+00:00",
                  forecastStartDateTime: "2026-06-02T00:00:00+00:00",
                  warnings: [{ code: "W3", message: "third" }],
                },
              ],
            },
            index: 0,
          },
        ],
        error: [{ errors: [{ code: "BAD", message: "nope" }], index: 0 }],
      },
      timestamp: "2026-05-28T12:00:00.000Z",
    } as never);
    // 1 succeeded, 1 with warnings (3 total), 1 failed.
    expect(out[0].text).toMatch(/^1 succeeded \(1 with warnings, 3 total warnings\), 1 failed/);
  });

  it("formatter reports 0 warnings cleanly when none nested", () => {
    const out = getCampaignForecastResponseFormatter({
      response: { success: [], error: [] },
      timestamp: "2026-05-28T12:00:00.000Z",
    } as never);
    expect(out[0].text).toMatch(/^0 succeeded, 0 failed/);
  });
});
