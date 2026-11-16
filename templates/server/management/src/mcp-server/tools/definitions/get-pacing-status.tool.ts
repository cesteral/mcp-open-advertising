// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { createPacingTool } from "@cesteral/shared";

export const getPacingStatusTool = createPacingTool({
  toolName: "{{key}}_get_pacing_status",
  accountId: {
    field: "accountId",
    schema: z.string().min(1).describe("{{displayName}} account ID"),
  },
  campaignIdSchema: z.string().min(1).describe("{{displayName}} campaign ID to check pacing for"),
  platformApi: "the {{displayName}} API",
  populateGuidance:
    "To populate budget and flight dates, first call `{{key}}_get_entity` for the campaign.",
  exampleIds: [
    { accountId: "1234567890", campaignId: "1800123456789" },
    { accountId: "1234567891", campaignId: "1800123456790" },
  ],
});
