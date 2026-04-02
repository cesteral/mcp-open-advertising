// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { CampaignUpdateWorkflowInputSchema } from "../utils/workflow-schemas.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_update_campaign_workflow";
const TOOL_TITLE = "TTD Update Campaign Workflow";
const TOOL_DESCRIPTION = `Update a campaign through the TTD Workflows API using PATCH semantics.

Only the workflow fields provided in the payload are updated.`;

export const UpdateCampaignWorkflowToolInputSchema = CampaignUpdateWorkflowInputSchema.describe(
  "Parameters for updating a campaign via the TTD Workflows API"
);

export const UpdateCampaignWorkflowToolOutputSchema = z.object({
  campaign: z.record(z.unknown()).describe("Raw campaign workflow response"),
  timestamp: z.string().datetime(),
});

type UpdateCampaignWorkflowToolInput = z.infer<typeof UpdateCampaignWorkflowToolInputSchema>;
type UpdateCampaignWorkflowToolOutput = z.infer<typeof UpdateCampaignWorkflowToolOutputSchema>;

export async function updateCampaignWorkflowLogic(
  input: UpdateCampaignWorkflowToolInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UpdateCampaignWorkflowToolOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);
  const campaign = (await ttdService.updateCampaignWorkflow(input, context)) as Record<string, unknown>;
  return { campaign, timestamp: new Date().toISOString() };
}

export function updateCampaignWorkflowResponseFormatter(
  result: UpdateCampaignWorkflowToolOutput
): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Campaign workflow update response:\n\n${JSON.stringify(result.campaign, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const updateCampaignWorkflowTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: UpdateCampaignWorkflowToolInputSchema,
  outputSchema: UpdateCampaignWorkflowToolOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: true,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Update campaign workflow",
      input: {
        id: "camp123",
        primaryInput: {
          name: "Updated Workflow Campaign",
        },
      },
    },
  ],
  logic: updateCampaignWorkflowLogic,
  responseFormatter: updateCampaignWorkflowResponseFormatter,
};
