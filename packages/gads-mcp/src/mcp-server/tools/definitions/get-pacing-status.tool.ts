// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { createPacingTool } from "@cesteral/shared";
import { CustomerIdSchema } from "../utils/customer-id.js";

export const getPacingStatusTool = createPacingTool({
  platform: "gads",
  accountId: { field: "customerId", schema: CustomerIdSchema },
  campaignIdSchema: z.string().describe("Google Ads Campaign ID"),
  platformApi: "the Google Ads API",
  populateGuidance:
    "To populate spend, first call `gads_get_insights`; to populate budget and flight dates, first call `gads_get_entity` for the campaign. Note: spendToDate should be in actual currency units (not micros).",
  descriptions: {
    spendToDate: "Total spend to date in account currency (not micros — actual currency units)",
  },
  exampleIds: [
    { accountId: "1234567890", campaignId: "9876543" },
    { accountId: "9876543210", campaignId: "1122334" },
  ],
});
