// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { createPacingTool } from "@cesteral/shared";

export const getPacingStatusTool = createPacingTool({
  platform: "pinterest",
  accountId: {
    field: "adAccountId",
    schema: z.string().min(1).describe("Pinterest Ad Account ID"),
  },
  campaignIdSchema: z.string().min(1).describe("Pinterest Campaign ID to check pacing for"),
  platformApi: "the Pinterest API",
  populateGuidance:
    "To populate spend, first call `pinterest_get_report`; to populate budget and flight dates, first call `pinterest_get_entity` for the campaign.",
  exampleIds: [
    { accountId: "549755885175", campaignId: "626735565838" },
    { accountId: "549755000001", campaignId: "626735000002" },
  ],
});
