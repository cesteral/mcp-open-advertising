// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { createPacingTool } from "@cesteral/shared";

export const getPacingStatusTool = createPacingTool({
  platform: "ttd",
  accountId: {
    field: "advertiserId",
    schema: z.string().min(1).describe("The Trade Desk Advertiser ID"),
  },
  campaignIdSchema: z.string().min(1).describe("The Trade Desk Campaign ID to check pacing for"),
  platformApi: "The Trade Desk's API",
  populateGuidance:
    "To populate spend, first call `ttd_get_report`; to populate budget and flight dates, first call `ttd_get_entity` for the campaign.",
  exampleIds: [
    { accountId: "abc1234", campaignId: "cmpa1b2" },
    { accountId: "xyz9876", campaignId: "cmpx9y8" },
  ],
});
