// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { createPacingTool } from "@cesteral/shared";

export const getPacingStatusTool = createPacingTool({
  toolName: "cm360_get_pacing_status",
  accountId: { field: "advertiserId", schema: z.string().min(1).describe("CM360 Advertiser ID") },
  campaignIdSchema: z.string().min(1).describe("CM360 campaign ID to check pacing for"),
  platformApi: "the Campaign Manager 360 API",
  populateGuidance:
    "To populate spend, first call `cm360_get_report`; to populate flight dates, first call `cm360_get_entity` for the campaign (startDate / endDate). A CM360 campaign has no budget field: take the budget from your media plan, or from the placements' pricingSchedule.",
  exampleIds: [
    { accountId: "12345678", campaignId: "98765432" },
    { accountId: "87654321", campaignId: "11223344" },
  ],
});
