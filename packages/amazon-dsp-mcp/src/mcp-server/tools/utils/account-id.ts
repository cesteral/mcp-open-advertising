// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";

/**
 * The `accountId` argument every entity tool takes since the Unified API
 * migration (#234). unified-api-dsp.json declares `Amazon-Ads-AccountId`
 * (AccountIdHeader, "The identifier of an Amazon Ads Advertiser Account") as
 * required on every campaign / adGroup / ad / target / adAssociation
 * operation, and the DSP migration guide §4 drops `advertiserId` from bodies
 * because the advertiser is "derived from AccountId header". Same value and
 * wording as `amazon_dsp_get_campaign_forecast`'s `accountId`.
 */
export const AccountIdSchema = z
  .string()
  .min(1)
  .describe(
    "DSP advertiser ID (the `advertiserId` from amazon_dsp_list_advertisers). Sent as the `Amazon-Ads-AccountId` header, which the Unified API requires on every entity call. Distinct from `profileId`."
  );
