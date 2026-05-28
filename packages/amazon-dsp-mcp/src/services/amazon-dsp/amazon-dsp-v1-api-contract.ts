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
