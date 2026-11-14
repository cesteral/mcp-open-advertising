// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { createPacingTool } from "@cesteral/shared";

export const getPacingStatusTool = createPacingTool({
  toolName: "msads_get_pacing_status",
  accountId: {
    field: "accountId",
    schema: z.string().min(1).describe("Microsoft Advertising Account ID"),
  },
  campaignIdSchema: z
    .string()
    .min(1)
    .describe("Microsoft Advertising Campaign ID to check pacing for"),
  platformApi: "the Microsoft Advertising API",
  populateGuidance:
    "To populate spend, first call `msads_get_report`; to populate budget and flight dates, first call `msads_get_entity` for the campaign.",
  exampleIds: [
    { accountId: "123456789", campaignId: "9876543210" },
    { accountId: "987654321", campaignId: "1122334455" },
  ],
});
