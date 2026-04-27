// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { CampaignsJobInputSchema, toWorkflowCallbackInput } from "../utils/workflow-schemas.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_create_campaigns_job";
const TOOL_TITLE = "TTD Create Campaigns Job";
const TOOL_DESCRIPTION = `Submit an async Workflows job to create multiple campaigns.`;

export const CreateCampaignsJobToolInputSchema = CampaignsJobInputSchema.describe(
  "Parameters for submitting a campaign bulk-create job"
);

export const CreateCampaignsJobToolOutputSchema = z.object({
  job: z.record(z.unknown()).describe("Raw campaign job submission response"),
  timestamp: z.string().datetime(),
});

type CreateCampaignsJobToolInput = z.infer<typeof CreateCampaignsJobToolInputSchema>;
type CreateCampaignsJobToolOutput = z.infer<typeof CreateCampaignsJobToolOutputSchema>;

export async function createCampaignsJobLogic(
  input: CreateCampaignsJobToolInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<CreateCampaignsJobToolOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);
  const job = (await ttdService.createCampaignsJob(
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

export function createCampaignsJobResponseFormatter(
  result: CreateCampaignsJobToolOutput
): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Campaigns job submitted:\n\n${JSON.stringify(result.job, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const createCampaignsJobTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: CreateCampaignsJobToolInputSchema,
  outputSchema: CreateCampaignsJobToolOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: true,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Submit campaigns create job",
      input: {
        input: [
          {
            primaryInput: {
              advertiserId: "adv123",
              name: "Campaign One",
            },
          },
        ],
      },
    },
  ],
  logic: createCampaignsJobLogic,
  responseFormatter: createCampaignsJobResponseFormatter,
};
