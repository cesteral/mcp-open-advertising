// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { createPacingTool } from "@cesteral/shared";

export const getPacingStatusTool = createPacingTool({
  toolName: "dv360_get_pacing_status",
  accountId: { field: "advertiserId", schema: z.string().min(1).describe("DV360 Advertiser ID") },
  campaignIdSchema: z.string().min(1).describe("DV360 Campaign ID"),
  platformApi: "the DV360 API",
  populateGuidance:
    "To populate spend, first call `dbm_get_performance_metrics` (Bid Manager API); to populate budget and flight dates, first call `dv360_get_entity` for the campaign.",
  descriptions: {
    spendToDate: "Total spend to date in advertiser currency",
    budgetTotal: "Total campaign budget in advertiser currency",
  },
  exampleIds: [
    { accountId: "1234567", campaignId: "9876543" },
    { accountId: "7654321", campaignId: "1122334" },
  ],
});
