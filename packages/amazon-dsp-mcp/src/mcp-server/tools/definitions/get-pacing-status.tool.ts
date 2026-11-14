// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { createPacingTool } from "@cesteral/shared";

export const getPacingStatusTool = createPacingTool({
  toolName: "amazon_dsp_get_pacing_status",
  accountId: {
    field: "advertiserId",
    schema: z.string().min(1).describe("Amazon DSP Advertiser ID"),
  },
  campaignIdSchema: z
    .string()
    .min(1)
    .describe("Amazon DSP campaign (order) ID to check pacing for"),
  platformApi: "the Amazon DSP API",
  populateGuidance:
    "To populate spend, first call `amazon_dsp_get_report`; to populate budget and flight dates, first call `amazon_dsp_get_entity` for the campaign.",
  exampleIds: [
    { accountId: "1234567890", campaignId: "5876543210" },
    { accountId: "9876543210", campaignId: "6122334455" },
  ],
});
