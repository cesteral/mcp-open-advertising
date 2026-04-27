// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  CampaignsUpdateJobInputSchema,
  toWorkflowCallbackInput,
} from "../utils/workflow-schemas.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_update_campaigns_job";
const TOOL_TITLE = "TTD Update Campaigns Job";
const TOOL_DESCRIPTION = `Submit an async Workflows job to update multiple campaigns.`;

export const UpdateCampaignsJobToolInputSchema = CampaignsUpdateJobInputSchema.describe(
  "Parameters for submitting a campaign bulk-update job"
);

export const UpdateCampaignsJobToolOutputSchema = z.object({
  job: z.record(z.unknown()).describe("Raw campaign job submission response"),
  timestamp: z.string().datetime(),
});

type UpdateCampaignsJobToolInput = z.infer<typeof UpdateCampaignsJobToolInputSchema>;
type UpdateCampaignsJobToolOutput = z.infer<typeof UpdateCampaignsJobToolOutputSchema>;

export async function updateCampaignsJobLogic(
  input: UpdateCampaignsJobToolInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UpdateCampaignsJobToolOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);
  const job = (await ttdService.updateCampaignsJob(
    {
      input: input.input,
      ...(input.validateInputOnly !== undefined
        ? { validateInputOnly: input.validateInputOnly }
        : {}),
      ...(input.callbackInput
        ? { callbackInput: toWorkflowCallbackInput(input.callbackInput) }
        : {}),
    },
    context
  )) as Record<string, unknown>;
  return { job, timestamp: new Date().toISOString() };
}

export function updateCampaignsJobResponseFormatter(
  result: UpdateCampaignsJobToolOutput
): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Campaigns update job submitted:\n\n${JSON.stringify(result.job, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const updateCampaignsJobTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: UpdateCampaignsJobToolInputSchema,
  outputSchema: UpdateCampaignsJobToolOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: true,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Submit campaigns update job",
      input: {
        input: [
          {
            id: "camp123",
            primaryInput: {
              name: "Updated Campaign One",
            },
          },
        ],
      },
    },
  ],
  logic: updateCampaignsJobLogic,
  responseFormatter: updateCampaignsJobResponseFormatter,
};
