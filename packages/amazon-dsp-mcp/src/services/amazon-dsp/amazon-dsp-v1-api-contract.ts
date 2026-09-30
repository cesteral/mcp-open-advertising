// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

export const AMAZON_DSP_V1_PATHS = {
  listCommitments: "/adsApi/v1/commitments/dsp",
  retrieveCommitments: "/adsApi/v1/retrieve/commitments/dsp",
  createCommitments: "/adsApi/v1/create/commitments/dsp",
  updateCommitments: "/adsApi/v1/update/commitments/dsp",
  retrieveCampaignForecast: "/adsApi/v1/retrieve/campaignForecasts/dsp",
  retrieveCommitmentSpend: "/adsApi/v1/retrieve/commitmentSpends/dsp",
} as const;

export type AmazonDspV1Path = (typeof AMAZON_DSP_V1_PATHS)[keyof typeof AMAZON_DSP_V1_PATHS];

/** Every Amazon Ads API v1 path lives under this prefix. */
export const AMAZON_ADS_V1_PATH_PREFIX = "/adsApi/v1/";

/**
 * Header names for the Amazon Ads API v1 (`/adsApi/v1/*`) family. They differ
 * from the legacy `/dsp/*` + reporting family, which uses
 * `Amazon-Advertising-API-ClientId`.
 *
 * Source: amzn/ads-advanced-tools-docs `unified-api-dsp.json` —
 * `components.parameters.ClientIdHeader` (`Amazon-Ads-ClientId`, required on
 * every commitments / forecast / commitmentSpends operation) and
 * `AccountIdHeader` (`Amazon-Ads-AccountId`, required on
 * `DSPRetrieveCampaignForecast`); mirrored in `src/generated/v1/types.ts`.
 */
export const AMAZON_ADS_V1_HEADERS = {
  clientId: "Amazon-Ads-ClientId",
  accountId: "Amazon-Ads-AccountId",
} as const;

/** Legacy client-id header, still documented for `/dsp/*` and DSP reporting. */
export const AMAZON_LEGACY_CLIENT_ID_HEADER = "Amazon-Advertising-API-ClientId";

export function isAmazonAdsV1Path(path: string): boolean {
  return path.startsWith(AMAZON_ADS_V1_PATH_PREFIX);
}
