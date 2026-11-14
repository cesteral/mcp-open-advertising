// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { createPacingTool } from "@cesteral/shared";

export const getPacingStatusTool = createPacingTool({
  toolName: "snapchat_get_pacing_status",
  accountId: { field: "adAccountId", schema: z.string().min(1).describe("Snapchat Ad Account ID") },
  campaignIdSchema: z.string().min(1).describe("Snapchat Campaign ID to check pacing for"),
  platformApi: "the Snapchat API",
  populateGuidance:
    "To populate spend, first call `snapchat_get_report`; to populate budget and flight dates, first call `snapchat_get_entity` for the campaign.",
  exampleIds: [
    {
      accountId: "8d6f0eab-1234-4a1b-9abc-1234567890ab",
      campaignId: "a1b2c3d4-1111-2222-3333-444455556666",
    },
    {
      accountId: "7c5e0dab-5678-4c2d-8def-0987654321fe",
      campaignId: "b2c3d4e5-7777-8888-9999-000011112222",
    },
  ],
});
