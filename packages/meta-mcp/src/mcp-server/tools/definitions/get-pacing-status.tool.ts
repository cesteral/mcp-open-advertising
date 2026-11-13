// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { createPacingTool } from "@cesteral/shared";

export const getPacingStatusTool = createPacingTool({
  platform: "meta",
  accountId: {
    field: "adAccountId",
    schema: z.string().describe("Meta Ad Account ID (e.g. act_123456789)"),
  },
  campaignIdSchema: z.string().describe("Meta Campaign ID"),
  platformApi: "the Meta API",
  populateGuidance:
    "To populate spend, first call `meta_get_insights`; to populate budget and flight dates, first call `meta_get_entity` for the campaign. Pass both amounts in the same unit: `meta_get_entity` returns `lifetime_budget` in the account currency's minor unit (cents for USD; the base unit for zero-decimal currencies such as JPY), while insights `spend` is in the major unit — so divide a USD budget by 100 before passing it as `budgetTotal`.",
  exampleIds: [
    { accountId: "act_123456789", campaignId: "9876543210" },
    { accountId: "act_987654321", campaignId: "1122334455" },
  ],
});
