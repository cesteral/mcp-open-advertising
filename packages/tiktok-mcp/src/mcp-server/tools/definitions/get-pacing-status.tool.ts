// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { createPacingTool } from "@cesteral/shared";

export const getPacingStatusTool = createPacingTool({
  toolName: "tiktok_get_pacing_status",
  accountId: { field: "advertiserId", schema: z.string().min(1).describe("TikTok Advertiser ID") },
  campaignIdSchema: z.string().min(1).describe("TikTok Campaign ID to check pacing for"),
  platformApi: "the TikTok API",
  populateGuidance:
    "To populate spend, first call `tiktok_get_report`; to populate budget and flight dates, call `tiktok_get_entity` for the campaign (budget) and for its ad groups (flight dates: TikTok schedules live on ad groups as `schedule_start_time` / `schedule_end_time`; campaigns have none).",
  exampleIds: [
    { accountId: "6987654321098765432", campaignId: "1798765432109876" },
    { accountId: "6912345678901234567", campaignId: "1712345678901234" },
  ],
});
