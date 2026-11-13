// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { createPacingTool } from "@cesteral/shared";

export const getPacingStatusTool = createPacingTool({
  platform: "linkedin",
  accountId: {
    field: "accountId",
    schema: z
      .string()
      .min(1)
      .describe("LinkedIn Sponsored Account ID (numeric portion of the URN)"),
  },
  campaignIdSchema: z
    .string()
    .min(1)
    .describe("LinkedIn Sponsored Campaign ID (numeric portion of the URN) to check pacing for"),
  platformApi: "the LinkedIn API",
  populateGuidance:
    "To populate spend, first call `linkedin_get_analytics`; to populate budget and flight dates, first call `linkedin_get_entity` for the campaign.",
  exampleIds: [
    { accountId: "503491473", campaignId: "123456789" },
    { accountId: "512233445", campaignId: "987654321" },
  ],
});
