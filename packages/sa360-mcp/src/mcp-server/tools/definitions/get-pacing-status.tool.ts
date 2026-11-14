// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { createPacingTool } from "@cesteral/shared";

export const getPacingStatusTool = createPacingTool({
  toolName: "sa360_get_pacing_status",
  accountId: {
    field: "customerId",
    schema: z.string().min(1).describe("SA360 Customer ID (no dashes)"),
  },
  campaignIdSchema: z.string().min(1).describe("SA360 Campaign ID to check pacing for"),
  platformApi: "the Search Ads 360 API",
  populateGuidance:
    "To populate spend, first call `sa360_get_insights`; to populate flight dates, first call `sa360_get_entity` for the campaign. sa360_get_entity returns only the campaign's budget resource name (campaign.campaign_budget); for the amount, query `campaign_budget.amount_micros` with `sa360_gaql_search`.",
  exampleIds: [
    { accountId: "1234567890", campaignId: "9876543" },
    { accountId: "9876543210", campaignId: "1122334" },
  ],
});
